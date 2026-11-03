import type { Finding, FindingCategory, Severity } from "../contracts/review.js";

export function findingMarker(id: string): string {
  return `<!-- air-review:finding:${id} -->`;
}

export function findingIdFromBody(body: string): string | null {
  const match = body.match(/<!-- air-review:finding:(arf_[0-9a-f]{6}) -->/);
  return match?.[1] ?? null;
}

const SEVERITY_ICON: Record<Severity, string> = {
  BLOCKER: "⛔",
  CRITICAL: "🛑",
  MAJOR: "🟠",
  MINOR: "🟡",
  NITPICK: "⚪",
  INFO: "🔵",
};

const CATEGORY_LABEL: Record<FindingCategory, string> = {
  correctness: "Correctness",
  security: "Security",
  performance: "Performance",
  maintainability: "Maintainability",
  consistency: "Repository consistency",
  tests: "Tests",
  docs: "Documentation",
};

export function categoryLabel(category: FindingCategory | undefined): string {
  return CATEGORY_LABEL[category ?? "correctness"];
}

export function severityIcon(severity: Severity): string {
  return SEVERITY_ICON[severity];
}

export interface FindingCommentOptions {
  /**
   * Render `suggestedCode` as a committable ```suggestion block when the
   * reviewer declared it a drop-in replacement of the anchored lines (GitHub
   * applies those in one click). Platforms without the feature (Azure DevOps)
   * get a normal fenced code block.
   */
  suggestionBlocks?: boolean;
}

/**
 * Inline review comment. Layout (see docs/review-format.md for the rationale):
 *
 *   <hidden marker>
 *   ### 🛑 CRITICAL · Correctness — <title>
 *   <file:lines · symbol>
 *   <what is wrong and its consequence>            ← summary
 *   **Fix:** <repository-consistent recommendation> ← suggestion
 *   ```suggestion / ```lang <code>                  ← optional
 *   **Evidence** bullets                            ← why we believe it
 *   <sub>scope · confidence · rule · id</sub>       ← machine-readable footer
 */
/**
 * Reply posted in an existing finding thread after the author pushed a change
 * that touched the code but did not settle the finding, or when a resolved
 * finding comes back. It states what remains to be done, without judging the
 * attempt.
 */
export function renderFollowUpComment(
  finding: Finding,
  headSha: string,
  options: FindingCommentOptions = {},
): string {
  const lines: string[] = [
    finding.status === "REOPENED"
      ? `**Back on \`${headSha.slice(0, 8)}\`** — this finding reappeared.`
      : `**After the latest change (\`${headSha.slice(0, 8)}\`)** — still open:`,
    "",
    `\`${finding.anchor.file}:${finding.anchor.startLine}${finding.anchor.endLine > finding.anchor.startLine ? `-${finding.anchor.endLine}` : ""}\` · ${SEVERITY_ICON[finding.severity]} ${finding.severity}`,
    "",
    finding.summary,
  ];
  if (finding.suggestion) lines.push("", `**Next step:** ${finding.suggestion}`);
  if (finding.suggestedCode) {
    const fence = "`".repeat(
      Math.max(3, ...[...finding.suggestedCode.code.matchAll(/`+/g)].map((m) => m[0].length + 1)),
    );
    const language = finding.suggestedCode.language.replace(/[^a-zA-Z0-9+#.-]/g, "");
    const committable = options.suggestionBlocks && finding.suggestedCode.replacesAnchor;
    lines.push("", fence + (committable ? "suggestion" : language), finding.suggestedCode.code, fence);
  }
  lines.push(
    "",
    `<sub>confidence ${Number(finding.confidence).toFixed(2)} · air-review-id ${finding.id}</sub>`,
  );
  return lines.join("\n");
}

export function renderFindingComment(finding: Finding, options: FindingCommentOptions = {}): string {
  const lines: string[] = [
    findingMarker(finding.id),
    `### ${SEVERITY_ICON[finding.severity]} ${finding.severity} · ${categoryLabel(finding.category)} — ${finding.title}`,
    "",
    `\`${finding.anchor.file}:${finding.anchor.startLine}${finding.anchor.endLine > finding.anchor.startLine ? `-${finding.anchor.endLine}` : ""}\`` +
      (finding.anchor.symbol ? ` · \`${finding.anchor.symbol}\`` : "") +
      (finding.status === "REOPENED" ? " · **reopened**" : "") +
      (finding.anchor.inDiff === false ? " · _unchanged code this change interacts with_" : ""),
    "",
    finding.summary,
  ];

  if (finding.suggestion) {
    lines.push("", `**Fix:** ${finding.suggestion}`);
  }
  if (finding.suggestedCode) {
    const fence = "`".repeat(
      Math.max(3, ...[...finding.suggestedCode.code.matchAll(/`+/g)].map((m) => m[0].length + 1)),
    );
    const language = finding.suggestedCode.language.replace(/[^a-zA-Z0-9+#.-]/g, "");
    const committable = options.suggestionBlocks && finding.suggestedCode.replacesAnchor;
    lines.push("", fence + (committable ? "suggestion" : language), finding.suggestedCode.code, fence);
  }
  if (finding.evidence.length > 0) {
    lines.push("", "**Evidence**");
    const language = languageOf(finding.anchor.file);
    for (const item of finding.evidence) {
      if (item.detail && looksLikeCode(item.detail)) {
        // A quoted snippet is shown as code, not as a run-on sentence.
        const fence = fenceFor(item.detail);
        lines.push(`- ${item.label}`, "", fence + language, item.detail.trim(), fence, "");
      } else {
        lines.push(`- ${item.label}${item.detail ? ` — ${item.detail}` : ""}`);
      }
    }
  }
  lines.push(
    "",
    `<sub>Scope ${finding.scope} · confidence ${Number(finding.confidence).toFixed(2)} · rule \`${finding.ruleId}\` (${finding.ruleOrigin}) · air-review-id ${finding.id}</sub>`,
  );
  return lines.join("\n");
}

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: "ts",
  tsx: "tsx",
  js: "js",
  jsx: "jsx",
  mjs: "js",
  cjs: "js",
  html: "html",
  scss: "scss",
  css: "css",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  py: "python",
  java: "java",
  kt: "kotlin",
  cs: "csharp",
  go: "go",
  rs: "rust",
  rb: "ruby",
  php: "php",
  swift: "swift",
  dart: "dart",
  sql: "sql",
  sh: "bash",
  md: "md",
};

function languageOf(file: string): string {
  const extension = file.split(".").pop()?.toLowerCase() ?? "";
  return LANGUAGE_BY_EXTENSION[extension] ?? "";
}

/** Multi-line text, or a single line that reads as code rather than prose. */
export function looksLikeCode(text: string): boolean {
  if (text.includes("\n")) return true;
  return /[;{}]|=>|\(\)|^\s*(import|export|const|let|var|function|class|return|if|for|while)\b/.test(text);
}

function fenceFor(code: string): string {
  return "`".repeat(Math.max(3, ...[...code.matchAll(/`+/g)].map((m) => m[0].length + 1)));
}
