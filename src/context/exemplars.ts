import type { FileChange, RepositoryDelta } from "../contracts/scm.js";

/**
 * Exemplar selection: the "how does this repository do it?" step.
 *
 * For every changed file the planner looks for existing files of the same
 * *kind* (`*.component.ts`, `*.service.ts`, `fr.json` in an i18n folder, ...)
 * and picks the closest few as reference material for the reviewer. The
 * budget adapts to the change: a brand-new file gets up to three exemplars, a
 * heavily rewritten one two, a small edit one, and a kind that has no
 * precedent gets none plus an explicit note so the model recommends general
 * good practice instead of inventing a "repository convention".
 *
 * Everything here is deterministic and costs no model tokens until the
 * reviewer prompt is built; the token budget keeps the prompt bounded.
 */

export type ExemplarRelation = "same-directory" | "sibling-directory" | "same-feature" | "repository";

export interface ExemplarRecord {
  /** Changed file this exemplar is evidence for. */
  forFile: string;
  /** Repository-relative path of the exemplar. */
  path: string;
  relation: ExemplarRelation;
  /** Short human-readable reason, shown by `inspect` and in the prompt. */
  reason: string;
  /** Excerpt (whole file when small). */
  content: string;
  lines: number;
  truncated: boolean;
}

export interface RelatedModuleRecord {
  /** Changed file that imports the module. */
  forFile: string;
  path: string;
  /** Exported declarations (one line each), so the reviewer can check an API exists. */
  exports: string[];
}

export interface ExemplarPlan {
  exemplars: ExemplarRecord[];
  related: RelatedModuleRecord[];
  /** Planner decisions worth telling the model and the user ("no precedent for X"). */
  notes: string[];
  /** Rough token estimate of everything selected (chars / 4). */
  estimatedTokens: number;
  /** Files read while planning; reported as metrics.contextRequests. */
  filesRead: number;
}

export interface ExemplarBudget {
  /** Hard cap on tokens of exemplar + related-module text. */
  maxTokens: number;
  /** Hard cap on files read for evidence. */
  maxFiles: number;
}

const IGNORED_PATH =
  /(^|\/)(node_modules|dist|build|out|coverage|vendor|\.git|\.angular|\.next|target|__pycache__)\//;
const IGNORED_FILE =
  /(\.min\.(js|css)$|\.d\.ts$|(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock|composer\.lock)$|\.(png|jpe?g|gif|svg|ico|woff2?|ttf|pdf|zip|mp4|mp3)$)/i;
const DATA_KINDS = new Set([
  "json",
  "yaml",
  "yml",
  "toml",
  "xml",
  "properties",
  "md",
  "env",
  "csv",
  "txt",
  "resx",
  "arb",
  "po",
]);
const TEST_KIND = /(^|\.)(spec|test)\.[a-z]+$/i;

/** Number of lines kept when an exemplar is too long to send whole. */
const EXCERPT_LINES = 120;
const WHOLE_FILE_MAX_LINES = 160;
const MAX_EXEMPLAR_LINE_COUNT = 1500;
const MAX_RELATED_MODULES = 4;
const MAX_EXPORT_LINES = 30;

/**
 * The "kind" of a file is what makes two files comparable: `*.component.ts`
 * files are compared to other `*.component.ts` files, `fr.json` to other json
 * files. Dotted basenames keep everything after the first dot
 * (`order.container.ts` -> `container.ts`); plain names keep the extension.
 */
export function fileKind(path: string): string {
  const base = path.split("/").pop() ?? path;
  const parts = base.split(".");
  if (parts.length <= 1) return base.toLowerCase();
  if (parts.length === 2) return (parts[1] ?? "").toLowerCase();
  return parts.slice(1).join(".").toLowerCase();
}

export function isDataKind(kind: string): boolean {
  return DATA_KINDS.has(kind.split(".").pop() ?? kind);
}

function dirname(path: string): string {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

function parentDir(dir: string): string {
  return dirname(dir);
}

/** The first two path segments: `src/app/orders/x.ts` -> `src/app`. */
function featureOf(path: string): string {
  return path.split("/").slice(0, 3).slice(0, -1).join("/");
}

function relationOf(changed: string, candidate: string): ExemplarRelation {
  const a = dirname(changed);
  const b = dirname(candidate);
  if (a === b) return "same-directory";
  if (parentDir(a) === parentDir(b) && parentDir(a) !== "") return "sibling-directory";
  if (featureOf(changed) !== "" && featureOf(changed) === featureOf(candidate)) return "same-feature";
  return "repository";
}

const RELATION_SCORE: Record<ExemplarRelation, number> = {
  "same-directory": 30,
  "sibling-directory": 20,
  "same-feature": 10,
  repository: 0,
};

/** `slider-thumb.ts` -> `slider`: the family a file belongs to by name. */
function nameStem(path: string): string {
  const base = (path.split("/").pop() ?? "").replace(/^_/, "");
  return (base.split(".")[0] ?? "").split(/[-_]/)[0]?.toLowerCase() ?? "";
}

/**
 * Tie-breakers inside a relation: a file of the same name family
 * (`slider.ts` for `slider-thumb.ts`) says more than an unrelated neighbour,
 * and a barrel `index.*` or a tiny file says almost nothing.
 */
function affinityScore(changed: string, candidate: string): number {
  let score = 0;
  const stem = nameStem(changed);
  if (stem && stem === nameStem(candidate)) score += 8;
  if (/(^|\/)index\.[a-z]+$/.test(candidate)) score -= 6;
  return score;
}

/**
 * How many exemplars a changed file deserves. Adding a file is where
 * consistency matters most; a one-line edit needs only a reminder.
 */
export function exemplarsWanted(file: FileChange, headLineCount: number): number {
  const kind = fileKind(file.path);
  if (TEST_KIND.test(file.path) || isDataKind(kind)) return 1;
  if (file.status === "added") return 3;
  const total = Math.max(headLineCount, 1);
  const ratio = file.addedLines.length / total;
  if (ratio >= 0.4 || file.addedLines.length >= 80) return 2;
  return 1;
}

function excerpt(content: string): { text: string; lines: number; truncated: boolean } {
  const lines = content.split("\n");
  if (lines.length <= WHOLE_FILE_MAX_LINES) return { text: content, lines: lines.length, truncated: false };
  return {
    text: `${lines.slice(0, EXCERPT_LINES).join("\n")}\n… (${lines.length - EXCERPT_LINES} more lines omitted)`,
    lines: lines.length,
    truncated: true,
  };
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const IMPORT_RE =
  /(?:import|export)\s+[^'"]*?\s+from\s+["'](\.{1,2}\/[^"']+)["']|require\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g;
const RESOLVE_SUFFIXES = [
  "",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  "/index.ts",
  "/index.tsx",
  "/index.js",
];

function resolveRelativeImport(
  fromFile: string,
  specifier: string,
  tracked: Set<string>,
): string | undefined {
  const base = dirname(fromFile).split("/").filter(Boolean);
  for (const segment of specifier.split("/")) {
    if (segment === "..") base.pop();
    else if (segment !== ".") base.push(segment);
  }
  const joined = base.join("/");
  for (const suffix of RESOLVE_SUFFIXES) {
    const candidate = `${joined}${suffix}`;
    if (tracked.has(candidate)) return candidate;
  }
  return undefined;
}

function exportLines(content: string): string[] {
  const lines: string[] = [];
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (
      /^export\s+(default\s+)?(abstract\s+)?(async\s+)?(class|function|const|let|var|interface|type|enum|\{|\*)/.test(
        line,
      )
    ) {
      lines.push(line.length > 160 ? `${line.slice(0, 157)}...` : line);
      if (lines.length >= MAX_EXPORT_LINES) break;
    }
  }
  return lines;
}

export interface PlanExemplarsInput {
  delta: RepositoryDelta;
  trackedFiles: string[];
  /** Read the head (working tree) content of a tracked file; "" when unreadable. */
  readFile: (path: string) => string;
  budget: ExemplarBudget;
}

/** Select exemplars and related modules for the whole delta within budget. */
export function planExemplars(input: PlanExemplarsInput): ExemplarPlan {
  const { delta, trackedFiles, readFile, budget } = input;
  const changedPaths = new Set(delta.files.map((f) => f.path));
  const tracked = new Set(trackedFiles);
  const candidatesByKind = new Map<string, string[]>();
  for (const path of trackedFiles) {
    if (changedPaths.has(path) || IGNORED_PATH.test(path) || IGNORED_FILE.test(path)) continue;
    const kind = fileKind(path);
    const list = candidatesByKind.get(kind) ?? [];
    list.push(path);
    candidatesByKind.set(kind, list);
  }

  const exemplars: ExemplarRecord[] = [];
  const related: RelatedModuleRecord[] = [];
  const notes: string[] = [];
  const used = new Set<string>();
  let tokens = 0;
  let filesRead = 0;
  const lineCountCache = new Map<string, number>();
  const lineCount = (path: string): number => {
    const cached = lineCountCache.get(path);
    if (cached !== undefined) return cached;
    filesRead += 1;
    const count = readFile(path).split("\n").length;
    lineCountCache.set(path, count);
    return count;
  };

  const reviewable = delta.files.filter((f) => f.status !== "deleted");
  // New files first: they are where precedent matters most.
  const ordered = [...reviewable].sort((a, b) => Number(b.status === "added") - Number(a.status === "added"));

  for (const file of ordered) {
    if (IGNORED_PATH.test(file.path) || IGNORED_FILE.test(file.path)) continue;
    const kind = fileKind(file.path);
    const wanted = exemplarsWanted(
      file,
      file.status === "added" ? file.addedLines.length : lineCount(file.path),
    );
    const pool = candidatesByKind.get(kind) ?? [];
    if (pool.length === 0) {
      if (file.status === "added") {
        notes.push(
          `No existing *.${kind} file in the repository to compare ${file.path} with: ` +
            `judge it against widely accepted practice and the repository's general style, not a repository convention.`,
        );
      }
      continue;
    }
    const ranked = pool
      .map((path) => {
        const relation = relationOf(file.path, path);
        return { path, relation, score: RELATION_SCORE[relation] + affinityScore(file.path, path) };
      })
      .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

    let taken = 0;
    for (const candidate of ranked) {
      if (taken >= wanted) break;
      if (used.has(candidate.path)) {
        // Already sent for another changed file; cite it without resending.
        const existing = exemplars.find((e) => e.path === candidate.path);
        if (existing) {
          exemplars.push({
            ...existing,
            forFile: file.path,
            relation: candidate.relation,
            content: "(same content as above)",
            truncated: existing.truncated,
          });
          taken += 1;
        }
        continue;
      }
      if (filesRead >= budget.maxFiles) break;
      const lines = lineCount(candidate.path);
      if (lines > MAX_EXEMPLAR_LINE_COUNT || lines === 0) continue;
      const content = readFile(candidate.path);
      if (!content.trim()) continue;
      const cut = excerpt(content);
      const cost = estimateTokens(cut.text);
      if (tokens + cost > budget.maxTokens) {
        if (taken === 0) {
          notes.push(`Evidence budget reached before an exemplar for ${file.path} could be included.`);
        }
        break;
      }
      tokens += cost;
      used.add(candidate.path);
      exemplars.push({
        forFile: file.path,
        path: candidate.path,
        relation: candidate.relation,
        reason: `same kind (*.${kind}), ${candidate.relation.replace("-", " ")}`,
        content: cut.text,
        lines: cut.lines,
        truncated: cut.truncated,
      });
      taken += 1;
    }
    if (taken < wanted && taken > 0 && pool.length > taken) {
      notes.push(`Only ${taken} of ${wanted} wanted exemplars fit the budget for ${file.path}.`);
    }
  }

  // Related modules: what the changed code imports from inside the repository.
  for (const file of reviewable) {
    if (related.length >= MAX_RELATED_MODULES) break;
    if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file.path)) continue;
    const content = readFile(file.path);
    for (const match of content.matchAll(IMPORT_RE)) {
      if (related.length >= MAX_RELATED_MODULES) break;
      const specifier = match[1] ?? match[2];
      if (!specifier) continue;
      const target = resolveRelativeImport(file.path, specifier, tracked);
      if (!target || changedPaths.has(target) || used.has(target) || related.some((r) => r.path === target)) {
        continue;
      }
      if (filesRead >= budget.maxFiles) break;
      filesRead += 1;
      const exports = exportLines(readFile(target));
      if (exports.length === 0) continue;
      const cost = estimateTokens(exports.join("\n"));
      if (tokens + cost > budget.maxTokens) break;
      tokens += cost;
      related.push({ forFile: file.path, path: target, exports });
    }
  }

  return { exemplars, related, notes, estimatedTokens: tokens, filesRead };
}
