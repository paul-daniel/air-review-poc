import type { ReviewSummary } from "../contracts/review.js";
import { updateMarkerBlock } from "./ledger.js";
import { formatCost } from "../telemetry/run-log.js";

export const SUMMARY_MARKER_OPEN = "<!-- air-review:summary:v1 -->";
export const SUMMARY_MARKER_CLOSE = "<!-- /air-review:summary:v1 -->";

export function renderSummaryMarkdown(summary: ReviewSummary): string {
  const rows = (["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "INFO"] as const)
    .map((severity) => {
      const count = summary.counts[severity] ?? 0;
      return count > 0 ? `| ${severity} | ${count} |` : null;
    })
    .filter(Boolean)
    .join("\n");

  return [
    "## Air Review",
    "",
    ...(summary.metrics.incomplete
      ? ["**Incomplete review — provider failure. State was not advanced.**", ""]
      : []),
    `> ${summary.gatePassed ? "✅ gate passed" : "❌ gate failed"} · reviewed \`${summary.reviewedHeadSha.slice(0, 8)}\` · ${summary.open} open finding(s), ${summary.resolved} resolved`,
    "",
    rows ? `| Severity | Open |\n|---|---|\n${rows}` : "No open findings.",
    "",
    `<details><summary>Run metrics</summary>`,
    "",
    `- tokens: ${summary.metrics.inputTokens} in / ${summary.metrics.outputTokens} out`,
    `- cached input tokens: ${summary.metrics.cachedInputTokens ?? "not reported"} (included in input)`,
    `- reasoning tokens: ${summary.metrics.reasoningTokens ?? "not reported"} (included in output)`,
    `- estimated cost (USD): ${formatCost(summary.metrics.estimatedCostUsd)}`,
    ...(summary.metrics.usageIncomplete
      ? ["- Usage is incomplete; totals above include only reported tokens."]
      : []),
    `- model calls: ${summary.metrics.modelCalls} · context requests: ${summary.metrics.contextRequests} · cache hits: ${summary.metrics.cacheHits}`,
    `- duration: ${(summary.metrics.durationMs / 1000).toFixed(1)}s`,
    "",
    `</details>`,
    "",
    "| Role | Model/deployment | Calls | Input | Cached input | Output | Reasoning | Est. USD |",
    "|---|---|---:|---:|---:|---:|---:|---:|",
    ...Object.entries(summary.metrics.byRole ?? {}).map(
      ([role, u]) =>
        `| ${role} | ${u.model ?? "—"} | ${u.modelCalls} | ${u.inputTokens} | ${u.cachedInputTokens ?? "n/a"} | ${u.outputTokens} | ${u.reasoningTokens ?? "n/a"} | ${formatCost(u.estimatedCostUsd)} |`,
    ),
    "",
    "Cost uses configured USD token rates; this is an estimate, not the provider invoice. Local result cache hits avoid requests; provider cached tokens are still billed at their configured rate.",
    ...summary.warnings.map((warning) => `\n- ${warning}`),
  ].join("\n");
}

export function upsertSummaryBody(current: string, summary: ReviewSummary): string {
  return updateMarkerBlock(
    current,
    SUMMARY_MARKER_OPEN,
    SUMMARY_MARKER_CLOSE,
    renderSummaryMarkdown(summary),
  );
}
