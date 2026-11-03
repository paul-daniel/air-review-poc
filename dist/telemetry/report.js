import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatCost } from "./run-log.js";
/**
 * The per-run observability report: cost per step and in total, tokens,
 * durations, agent/model per step, routing decision and the workflow diagram.
 * Rendered as Markdown for humans and JSON for dashboards.
 */
const VERDICT_LABEL = {
    approve: "✅ Approved",
    "approve-with-suggestions": "✅ Approved with suggestions",
    "request-changes": "❌ Changes requested",
    comment: "💬 Commented (no vote)",
};
export function verdictLabel(verdict) {
    return VERDICT_LABEL[verdict];
}
function tokens(value) {
    return value === undefined ? "–" : value.toLocaleString("en-US");
}
function seconds(ms) {
    return `${(ms / 1000).toFixed(1)} s`;
}
const STATUS_ICON = {
    done: "✓",
    cached: "⟳ cache",
    skipped: "– skipped",
    failed: "✗ failed",
};
/** Markdown table: one row per step, then the total line. */
export function renderStepTable(summary) {
    const trace = summary.metrics.trace;
    if (!trace)
        return "_No step trace recorded._";
    const rows = trace.steps.map((step) => {
        const agent = step.role ? `${step.role}${step.model ? ` · \`${step.model}\`` : ""}` : "deterministic";
        return `| ${step.label} | ${STATUS_ICON[step.status]} | ${agent} | ${step.status === "skipped" ? "–" : seconds(step.durationMs)} | ${tokens(step.inputTokens)} | ${tokens(step.cachedInputTokens)} | ${tokens(step.outputTokens)} | ${step.estimatedCostUsd === undefined ? (step.inputTokens || step.outputTokens ? "n/a" : "–") : formatCost(step.estimatedCostUsd)} |`;
    });
    const total = `| **Total** | | ${summary.metrics.modelCalls} model call${summary.metrics.modelCalls === 1 ? "" : "s"} | **${seconds(trace.durationMs)}** | **${tokens(trace.totalInputTokens)}** | ${tokens(summary.metrics.cachedInputTokens)} | **${tokens(trace.totalOutputTokens)}** | **${trace.totalEstimatedCostUsd === undefined ? "n/a" : formatCost(trace.totalEstimatedCostUsd)}** |`;
    return [
        "| Step | Status | Agent · model | Duration | Input | Cached | Output | Est. cost |",
        "|---|---|---|---:|---:|---:|---:|---:|",
        ...rows,
        total,
    ].join("\n");
}
export function renderRoutingBlock(summary) {
    const routing = summary.metrics.routing;
    if (!routing)
        return "_No routing decision (deterministic-only run or nothing to review)._";
    const method = {
        deterministic: "deterministic thresholds",
        model: `triage model \`${routing.triageModel ?? "?"}\`${routing.confidence !== undefined ? ` (confidence ${routing.confidence.toFixed(2)})` : ""}`,
        override: "command-line override",
        disabled: "routing disabled",
    };
    return [
        `**Tier:** \`${routing.tier}\` · **Reviewer:** \`${routing.reviewerModel}\` · **Verifier:** \`${routing.verifierModel}\` · decided by ${method[routing.method] ?? routing.method}`,
        "",
        `Signals: ${routing.signals.files} file(s), +${routing.signals.addedLines}/−${routing.signals.removedLines} lines, module(s): ${routing.signals.modules.join(", ") || "none"}`,
        "",
        ...routing.reasons.map((reason) => `- ${reason}`),
    ].join("\n");
}
export function renderRunReport(input) {
    const { summary } = input;
    const trace = summary.metrics.trace;
    const repo = summary.pr.owner === summary.pr.repo ? summary.pr.repo : `${summary.pr.owner}/${summary.pr.repo}`;
    const open = input.findings.filter((f) => f.status === "OPEN" || f.status === "REOPENED");
    const lines = [
        `# Air Review run report`,
        "",
        `- Repository: \`${repo}\`${summary.pr.number === null ? " (local review)" : ` · pull request #${summary.pr.number}`}`,
        `- Reviewed head: \`${summary.reviewedHeadSha}\``,
        `- Verdict: ${verdictLabel(summary.verdict)} · gate ${summary.gatePassed ? "passed" : "failed"}`,
        `- Run: \`${trace?.runId ?? "n/a"}\` started ${trace?.startedAt ?? "n/a"}, ${trace ? seconds(trace.durationMs) : "n/a"}`,
        `- Configured role models: ${Object.entries(input.configuredModels)
            .map(([role, model]) => `${role}=\`${model}\``)
            .join(", ")}`,
        ...(summary.skippedReason ? [`- Skipped: ${summary.skippedReason}`] : []),
        "",
        "## Routing (which agent reviewed, and why)",
        "",
        renderRoutingBlock(summary),
        "",
        "## Cost and duration per step",
        "",
        renderStepTable(summary),
        "",
        `Totals: ${tokens(summary.metrics.inputTokens)} input tokens (${tokens(summary.metrics.cachedInputTokens)} from provider cache), ` +
            `${tokens(summary.metrics.outputTokens)} output tokens (${tokens(summary.metrics.reasoningTokens)} reasoning), ` +
            `${summary.metrics.modelCalls} model call(s), ${summary.metrics.cacheHits} local cache hit(s), ` +
            `estimated cost ${formatCost(summary.metrics.estimatedCostUsd)}.`,
        "",
        "Cost uses the configured USD token rates (telemetry.pricing); it is an estimate, not the provider invoice.",
        "",
        "## Findings",
        "",
        open.length === 0
            ? "No open finding."
            : [
                "| Severity | Category | File | Title | Status |",
                "|---|---|---|---|---|",
                ...open.map((f) => `| ${f.severity} | ${f.category ?? "correctness"} | \`${f.anchor.file}:${f.anchor.startLine}\` | ${f.title} | ${f.status} |`),
            ].join("\n"),
        "",
        `${summary.resolved} finding(s) resolved on this pull request so far.`,
        "",
        "## Workflow actually executed",
        "",
        "```mermaid",
        summary.workflowDiagram ?? "flowchart TD\n  none[no trace]",
        "```",
        "",
    ];
    if (summary.warnings.length) {
        lines.push("## Warnings", "", ...summary.warnings.map((w) => `- ${w}`), "");
    }
    return lines.join("\n");
}
/** Write `<dir>/<runId>.md` and `<dir>/<runId>.json`; never fails the review. */
export function writeRunReport(dir, input) {
    const runId = input.summary.metrics.trace?.runId ?? `run_${Date.now()}`;
    try {
        mkdirSync(resolve(dir), { recursive: true });
        const markdown = resolve(dir, `${runId}.md`);
        const json = resolve(dir, `${runId}.json`);
        writeFileSync(markdown, renderRunReport(input));
        writeFileSync(json, JSON.stringify({
            summary: input.summary,
            findings: input.findings,
            configuredModels: input.configuredModels,
        }, null, 2));
        return { markdown, json };
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=report.js.map