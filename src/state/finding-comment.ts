import type { Finding } from "../contracts/review.js";

export function findingMarker(id: string): string {
  return `<!-- air-review:finding:${id} -->`;
}

export function findingIdFromBody(body: string): string | null {
  const match = body.match(/<!-- air-review:finding:(arf_[0-9a-f]{6}) -->/);
  return match?.[1] ?? null;
}

const SEVERITY_ICON: Record<string, string> = {
  BLOCKER: "⛔",
  CRITICAL: "🛑",
  MAJOR: "⚠️",
  MINOR: "🔸",
  INFO: "💡",
};

/** Human + machine readable inline review comment. */
export function renderFindingComment(finding: Finding): string {
  const lines: string[] = [
    findingMarker(finding.id),
    `### ${SEVERITY_ICON[finding.severity] ?? "•"} [${finding.severity}] ${finding.title}`,
    "",
    `**${finding.anchor.file}:${finding.anchor.startLine}-${finding.anchor.endLine}**`,
    finding.anchor.symbol ? `symbol: \`${finding.anchor.symbol}\`` : "",
    "",
    finding.summary,
  ];

  if (finding.suggestion) {
    lines.push("", finding.suggestion);
  }
  if (finding.suggestedCode) {
    const fence = "`".repeat(
      Math.max(3, ...[...finding.suggestedCode.code.matchAll(/`+/g)].map((m) => m[0].length + 1)),
    );
    const language = finding.suggestedCode.language.replace(/[^a-zA-Z0-9+#.-]/g, "");
    lines.push("", "**Fix example**", "", fence + language, finding.suggestedCode.code, fence);
  }
  if (finding.evidence.length > 0) {
    lines.push("", "**Evidence**");
    for (const item of finding.evidence) {
      lines.push(`- ${item.label}${item.detail ? ` — ${item.detail}` : ""}`);
    }
  }
  lines.push(
    "",
    `Scope: ${finding.scope} · Confidence: ${Number(finding.confidence).toFixed(2)}`,
    `Rule: \`${finding.ruleId}\` (${finding.ruleOrigin})`,
    `air-review-id: ${finding.id}`,
  );
  return lines.join("\n");
}
