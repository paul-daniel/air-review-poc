const IGNORED_PATH = /(^|\/)(node_modules|dist|build|out|coverage|vendor|\.git|\.angular|\.next|target|__pycache__)\//;
const IGNORED_FILE = /(\.min\.(js|css)$|\.d\.ts$|(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock|composer\.lock)$|\.(png|jpe?g|gif|svg|ico|woff2?|ttf|pdf|zip|mp4|mp3)$)/i;
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
export function fileKind(path) {
    const base = path.split("/").pop() ?? path;
    const parts = base.split(".");
    if (parts.length <= 1)
        return base.toLowerCase();
    if (parts.length === 2)
        return (parts[1] ?? "").toLowerCase();
    return parts.slice(1).join(".").toLowerCase();
}
export function isDataKind(kind) {
    return DATA_KINDS.has(kind.split(".").pop() ?? kind);
}
function dirname(path) {
    const index = path.lastIndexOf("/");
    return index < 0 ? "" : path.slice(0, index);
}
function parentDir(dir) {
    return dirname(dir);
}
/** The first two path segments: `src/app/orders/x.ts` -> `src/app`. */
function featureOf(path) {
    return path.split("/").slice(0, 3).slice(0, -1).join("/");
}
function relationOf(changed, candidate) {
    const a = dirname(changed);
    const b = dirname(candidate);
    if (a === b)
        return "same-directory";
    if (parentDir(a) === parentDir(b) && parentDir(a) !== "")
        return "sibling-directory";
    if (featureOf(changed) !== "" && featureOf(changed) === featureOf(candidate))
        return "same-feature";
    return "repository";
}
const RELATION_SCORE = {
    "same-directory": 30,
    "sibling-directory": 20,
    "same-feature": 10,
    repository: 0,
};
/** `slider-thumb.ts` -> `slider`: the family a file belongs to by name. */
function nameStem(path) {
    const base = (path.split("/").pop() ?? "").replace(/^_/, "");
    return (base.split(".")[0] ?? "").split(/[-_]/)[0]?.toLowerCase() ?? "";
}
/**
 * Tie-breakers inside a relation: a file of the same name family
 * (`slider.ts` for `slider-thumb.ts`) says more than an unrelated neighbour,
 * and a barrel `index.*` or a tiny file says almost nothing.
 */
function affinityScore(changed, candidate) {
    let score = 0;
    const stem = nameStem(changed);
    if (stem && stem === nameStem(candidate))
        score += 8;
    if (/(^|\/)index\.[a-z]+$/.test(candidate))
        score -= 6;
    return score;
}
/**
 * How many exemplars a changed file deserves. Adding a file is where
 * consistency matters most; a one-line edit needs only a reminder.
 */
export function exemplarsWanted(file, headLineCount) {
    const kind = fileKind(file.path);
    if (TEST_KIND.test(file.path) || isDataKind(kind))
        return 1;
    if (file.status === "added")
        return 3;
    const total = Math.max(headLineCount, 1);
    const ratio = file.addedLines.length / total;
    if (ratio >= 0.4 || file.addedLines.length >= 80)
        return 2;
    return 1;
}
function excerpt(content) {
    const lines = content.split("\n");
    if (lines.length <= WHOLE_FILE_MAX_LINES)
        return { text: content, lines: lines.length, truncated: false };
    return {
        text: `${lines.slice(0, EXCERPT_LINES).join("\n")}\n… (${lines.length - EXCERPT_LINES} more lines omitted)`,
        lines: lines.length,
        truncated: true,
    };
}
function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
const IMPORT_RE = /(?:import|export)\s+[^'"]*?\s+from\s+["'](\.{1,2}\/[^"']+)["']|require\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g;
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
function resolveRelativeImport(fromFile, specifier, tracked) {
    const base = dirname(fromFile).split("/").filter(Boolean);
    for (const segment of specifier.split("/")) {
        if (segment === "..")
            base.pop();
        else if (segment !== ".")
            base.push(segment);
    }
    const joined = base.join("/");
    for (const suffix of RESOLVE_SUFFIXES) {
        const candidate = `${joined}${suffix}`;
        if (tracked.has(candidate))
            return candidate;
    }
    return undefined;
}
function exportLines(content) {
    const lines = [];
    for (const raw of content.split("\n")) {
        const line = raw.trim();
        if (/^export\s+(default\s+)?(abstract\s+)?(async\s+)?(class|function|const|let|var|interface|type|enum|\{|\*)/.test(line)) {
            lines.push(line.length > 160 ? `${line.slice(0, 157)}...` : line);
            if (lines.length >= MAX_EXPORT_LINES)
                break;
        }
    }
    return lines;
}
/** Select exemplars and related modules for the whole delta within budget. */
export function planExemplars(input) {
    const { delta, trackedFiles, readFile, budget } = input;
    const changedPaths = new Set(delta.files.map((f) => f.path));
    const tracked = new Set(trackedFiles);
    const candidatesByKind = new Map();
    for (const path of trackedFiles) {
        if (changedPaths.has(path) || IGNORED_PATH.test(path) || IGNORED_FILE.test(path))
            continue;
        const kind = fileKind(path);
        const list = candidatesByKind.get(kind) ?? [];
        list.push(path);
        candidatesByKind.set(kind, list);
    }
    const exemplars = [];
    const related = [];
    const notes = [];
    const used = new Set();
    let tokens = 0;
    let filesRead = 0;
    const lineCountCache = new Map();
    const lineCount = (path) => {
        const cached = lineCountCache.get(path);
        if (cached !== undefined)
            return cached;
        filesRead += 1;
        const count = readFile(path).split("\n").length;
        lineCountCache.set(path, count);
        return count;
    };
    const reviewable = delta.files.filter((f) => f.status !== "deleted");
    // New files first: they are where precedent matters most.
    const ordered = [...reviewable].sort((a, b) => Number(b.status === "added") - Number(a.status === "added"));
    for (const file of ordered) {
        if (IGNORED_PATH.test(file.path) || IGNORED_FILE.test(file.path))
            continue;
        const kind = fileKind(file.path);
        const wanted = exemplarsWanted(file, file.status === "added" ? file.addedLines.length : lineCount(file.path));
        const pool = candidatesByKind.get(kind) ?? [];
        if (pool.length === 0) {
            if (file.status === "added") {
                notes.push(`No existing *.${kind} file in the repository to compare ${file.path} with: ` +
                    `judge it against widely accepted practice and the repository's general style, not a repository convention.`);
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
            if (taken >= wanted)
                break;
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
            if (filesRead >= budget.maxFiles)
                break;
            const lines = lineCount(candidate.path);
            if (lines > MAX_EXEMPLAR_LINE_COUNT || lines === 0)
                continue;
            const content = readFile(candidate.path);
            if (!content.trim())
                continue;
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
        if (related.length >= MAX_RELATED_MODULES)
            break;
        if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file.path))
            continue;
        const content = readFile(file.path);
        for (const match of content.matchAll(IMPORT_RE)) {
            if (related.length >= MAX_RELATED_MODULES)
                break;
            const specifier = match[1] ?? match[2];
            if (!specifier)
                continue;
            const target = resolveRelativeImport(file.path, specifier, tracked);
            if (!target || changedPaths.has(target) || used.has(target) || related.some((r) => r.path === target)) {
                continue;
            }
            if (filesRead >= budget.maxFiles)
                break;
            filesRead += 1;
            const exports = exportLines(readFile(target));
            if (exports.length === 0)
                continue;
            const cost = estimateTokens(exports.join("\n"));
            if (tokens + cost > budget.maxTokens)
                break;
            tokens += cost;
            related.push({ forFile: file.path, path: target, exports });
        }
    }
    return { exemplars, related, notes, estimatedTokens: tokens, filesRead };
}
//# sourceMappingURL=exemplars.js.map