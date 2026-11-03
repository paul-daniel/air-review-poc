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
    for (const item of finding.evidence) {
      lines.push(`- ${item.label}${item.detail ? ` — ${item.detail}` : ""}`);
    }
  }
  lines.push(
    "",
    `<sub>Scope ${finding.scope} · confidence ${Number(finding.confidence).toFixed(2)} · rule \`${finding.ruleId}\` (${finding.ruleOrigin}) · air-review-id ${finding.id}</sub>`,
  );
  return lines.join("\n");
}
