import type { Finding, ReviewSummary } from "../contracts/review.js";
import { updateMarkerBlock } from "./ledger.js";
import { formatCost } from "../telemetry/run-log.js";
import { renderRoutingBlock, renderStepTable, verdictLabel } from "../telemetry/report.js";
import { categoryLabel, severityIcon } from "./finding-comment.js";
import { TOOL } from "../version.js";

export const SUMMARY_MARKER_OPEN = "<!-- air-review:summary:v1 -->";
export const SUMMARY_MARKER_CLOSE = "<!-- /air-review:summary:v1 -->";

export interface SummaryRenderOptions {
  /** Open findings, for the findings table (the ledger's current state). */
  findings?: Finding[];
  /** Platform renders ```mermaid blocks (GitHub). Azure DevOps shows the source. */
  mermaid?: boolean;
  /** Include the per-step cost table and the workflow diagram. */
  observability?: boolean;
}

/**
 * The single summary comment of a review, updated in place on every run.
 * Shape (rationale in docs/review-format.md): verdict first, then routing
 * (which agent and why), the findings table, what changed since the last
 * run, and collapsed observability sections.
 */
export function renderSummaryMarkdown(summary: ReviewSummary, options: SummaryRenderOptions = {}): string {
  const routing = summary.metrics.routing;
  const trace = summary.metrics.trace;
  const findings = (options.findings ?? []).filter((f) => f.status === "OPEN" || f.status === "REOPENED");
  const observability = options.observability ?? true;

  const headline = [
    `reviewed \`${summary.reviewedHeadSha.slice(0, 8)}\``,
    `${summary.open} open`,
    `${summary.resolved} resolved`,
    routing ? `tier **${routing.tier}** (\`${routing.reviewerModel}\`)` : null,
    formatCost(summary.metrics.estimatedCostUsd) === "n/a"
      ? null
      : `cost ${formatCost(summary.metrics.estimatedCostUsd)}`,
    trace ? `${(trace.durationMs / 1000).toFixed(1)} s` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const lines: string[] = [`## Air Review — ${verdictLabel(summary.verdict)}`, "", `> ${headline}`];
  if (summary.metrics.incomplete) {
    lines.push(
      "",
      "**Incomplete review: a model request failed. Nothing was published and the state was not advanced.**",
    );
  }
  if (summary.skippedReason) {
    lines.push("", `_No new review: ${summary.skippedReason}._`);
  }

  // Everything below the verdict line is folded by default: the activity feed
  // shows one line per review; routing, findings and cost are one click away.
  const detailsTitle = [
    "Details",
    routing ? `routing (${routing.tier})` : "routing",
    `${summary.open} open finding(s)`,
    formatCost(summary.metrics.estimatedCostUsd) === "n/a" ? null : `cost ${formatCost(summary.metrics.estimatedCostUsd)}`,
  ]
    .filter(Boolean)
    .join(" · ");
  lines.push("", `<details><summary>${detailsTitle}</summary>`);

  lines.push(
    "",
    "**Routing**",
    "",
    routing
      ? renderRoutingBlock(summary)
      : "_No model call: nothing new to review or structural checks only._",
  );

  lines.push("", `### Findings (${summary.open} open)`, "");
  if (findings.length === 0 && summary.open === 0) {
    lines.push(
      "No open finding. " + (summary.resolved ? `${summary.resolved} earlier finding(s) resolved.` : ""),
    );
  } else if (findings.length === 0) {
    const rows = (["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "NITPICK", "INFO"] as const)
      .filter((severity) => (summary.counts[severity] ?? 0) > 0)
      .map((severity) => `| ${severityIcon(severity)} ${severity} | ${summary.counts[severity]} |`);
    lines.push("| Severity | Open |", "|---|---:|", ...rows);
  } else {
    lines.push(
      "| | Severity | Category | Location | Finding | Scope |",
      "|---|---|---|---|---|---|",
      ...findings.map(
        (f) =>
          `| ${severityIcon(f.severity)} | ${f.severity} | ${categoryLabel(f.category)} | \`${f.anchor.file}:${f.anchor.startLine}\` | ${f.title}${f.status === "REOPENED" ? " (reopened)" : ""} | ${f.scope} |`,
      ),
    );
  }

  if (summary.events?.length) {
    lines.push("", "### Since the last review", "");
    for (const event of summary.events.slice(-20)) {
      const icon = event.event === "resolved" ? "✅" : event.event === "reopened" ? "🔁" : "•";
      lines.push(
        `- ${icon} ${event.event} \`${event.findingId}\`${event.detail ? ` — ${event.detail}` : ""}`,
      );
    }
  }

  if (observability && trace) {
    lines.push(
      "",
      `<details><summary>Cost and duration per step — total ${formatCost(summary.metrics.estimatedCostUsd)}, ${summary.metrics.modelCalls} model call(s), ${(trace.durationMs / 1000).toFixed(1)} s</summary>`,
      "",
      renderStepTable(summary),
      "",
      `Tokens: ${summary.metrics.inputTokens} in (${summary.metrics.cachedInputTokens ?? "n/a"} cached) / ${summary.metrics.outputTokens} out (${summary.metrics.reasoningTokens ?? "n/a"} reasoning). Estimates use telemetry.pricing, not the provider invoice.`,
      "",
      "</details>",
    );
    if (summary.workflowDiagram) {
      lines.push(
        "",
        "<details><summary>Workflow actually executed</summary>",
        "",
        options.mermaid === false ? "Paste into https://mermaid.live to render:" : "",
        "",
        "```mermaid",
        summary.workflowDiagram,
        "```",
        "",
        "</details>",
      );
    }
  }
  if (summary.warnings.length) {
    lines.push(
      "",
      "<details><summary>Notes</summary>",
      "",
      ...summary.warnings.map((w) => `- ${w}`),
      "",
      "</details>",
    );
  }
  lines.push("", "</details>");
  lines.push(
    "",
    `<sub>${TOOL.name} ${TOOL.version} · run \`${trace?.runId ?? "n/a"}\` · the state thread holds the machine-readable ledger</sub>`,
  );
  return lines.join("\n");
}

export function upsertSummaryBody(
  current: string,
  summary: ReviewSummary,
  options: SummaryRenderOptions = {},
): string {
  return updateMarkerBlock(
    current,
    SUMMARY_MARKER_OPEN,
    SUMMARY_MARKER_CLOSE,
    renderSummaryMarkdown(summary, options),
  );
}
