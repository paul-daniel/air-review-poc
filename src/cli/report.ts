import type { ReviewSummary } from "../contracts/review.js";
import type { ReviewOutcome } from "../review/pipeline.js";
import { formatCost } from "../telemetry/run-log.js";
import { TerminalLayout, type TerminalOptions } from "./terminal/layout.js";
import { renderFinding } from "./terminal/finding.js";
export { terminalText, wrapText } from "./terminal/layout.js";
export { renderCodeFrame as renderCodeBlock } from "./terminal/code-frame.js";

export interface ReportOptions extends TerminalOptions {
  deterministicOnly?: boolean;
  local?: boolean;
}

function reviewHeader(ui: TerminalLayout, outcome: ReviewOutcome, options: ReportOptions): void {
  const { summary } = outcome;
  const repo =
    summary.pr.owner === summary.pr.repo ? summary.pr.repo : `${summary.pr.owner}/${summary.pr.repo}`;
  ui.space();
  ui.pair(
    "AIR REVIEW",
    `${repo}${ui.separator}${summary.reviewedHeadSha.slice(0, 8)}`,
    ui.color.bold,
    ui.color.gray,
  );
  ui.prose(
    `${summary.pr.number === null ? "Local review" : `Pull request #${summary.pr.number}`}${ui.separator}${options.deterministicOnly ? "Structural checks only" : "AI + structural review"}`,
    ui.color.gray,
  );
  ui.space();
  const count = outcome.findings.filter((f) => f.status !== "RESOLVED" && f.status !== "WONT_FIX").length;
  const status = outcome.incomplete
    ? "Incomplete review: a model request failed."
    : outcome.stale
      ? "Outdated review: the code changed during analysis."
      : outcome.skipped
        ? "Already reviewed; skipped new analysis."
        : count
          ? `${count} ${count === 1 ? "issue needs" : "issues need"} attention.`
          : "No open findings.";
  ui.prose(status, outcome.incomplete || outcome.stale || count ? ui.color.yellow.bold : ui.color.green.bold);
  if (!outcome.incomplete && !outcome.stale) {
    ui.prose(
      summary.gatePassed
        ? "Policy gate passed: no issue meets the blocking threshold."
        : "Policy gate failed: blocking issues must be addressed.",
      summary.gatePassed ? (value) => value : ui.color.red,
    );
  }
  if (summary.resolved) {
    ui.prose(
      `${summary.resolved} previously reported ${summary.resolved === 1 ? "issue resolved" : "issues resolved"}.`,
      ui.color.green,
    );
  }
  if (outcome.skipped) ui.prose("No new API calls or charges. Use --force to review again.", ui.color.gray);
}

function routingSummary(ui: TerminalLayout, summary: ReviewSummary): void {
  const routing = summary.metrics.routing;
  if (!routing) return;
  ui.section("Routing");
  ui.prose(
    `${routing.tier} tier${ui.separator}reviewer ${routing.reviewerModel}${ui.separator}verifier ${routing.verifierModel}${ui.separator}decided by ${routing.method === "model" ? `triage model ${routing.triageModel ?? ""}` : routing.method}`,
    ui.color.bold,
  );
  for (const reason of routing.reasons.slice(0, 4)) ui.prose(`- ${reason}`, ui.color.gray);
}

function stepsSummary(ui: TerminalLayout, summary: ReviewSummary): void {
  const trace = summary.metrics.trace;
  if (!trace) return;
  ui.section("Steps");
  for (const step of trace.steps) {
    const status = step.status === "done" ? "" : ` [${step.status}]`;
    const model = step.model ? `${ui.separator}${step.model}` : "";
    const time = step.status === "skipped" ? "" : `${ui.separator}${(step.durationMs / 1000).toFixed(1)} s`;
    const tokens =
      step.inputTokens !== undefined || step.outputTokens !== undefined
        ? `${ui.separator}${step.inputTokens ?? 0} in / ${step.outputTokens ?? 0} out`
        : "";
    const cost =
      step.estimatedCostUsd !== undefined ? `${ui.separator}${formatCost(step.estimatedCostUsd)}` : "";
    ui.prose(
      `${step.label}${status}${model}${time}${tokens}${cost}`,
      step.status === "skipped" ? ui.color.gray : (value) => value,
    );
    if (step.detail && step.status !== "skipped") ui.prose(`  ${step.detail}`, ui.color.gray);
  }
}

function usageSummary(ui: TerminalLayout, summary: ReviewSummary): void {
  const m = summary.metrics;
  const count = (value?: number) => (value === undefined ? "not reported" : value.toLocaleString("en-US"));
  ui.section("Usage & cost");
  ui.prose(
    `Estimated cost (USD)  ${formatCost(m.estimatedCostUsd) === "n/a" ? "unavailable" : formatCost(m.estimatedCostUsd)}${ui.separator}${(m.durationMs / 1000).toFixed(1)} s${ui.separator}${m.modelCalls} API calls`,
    ui.color.bold,
  );
  ui.prose(
    `Input   ${count(m.inputTokens)} tokens${ui.separator}${count(m.cachedInputTokens)} from provider cache`,
  );
  ui.prose(`Output  ${count(m.outputTokens)} tokens${ui.separator}${count(m.reasoningTokens)} reasoning`);
  ui.prose("Cache is included in input; reasoning is included in output.", ui.color.gray);
  if (m.cacheHits) ui.prose(`${m.cacheHits} local results reused without an API call.`, ui.color.gray);
  if (m.usageIncomplete) {
    ui.prose("Token totals are incomplete: some usage was not reported.", ui.color.yellow);
  }
  for (const [role, usage] of Object.entries(m.byRole ?? {})) {
    if (!usage.modelCalls && !usage.cacheHits) continue;
    ui.prose(
      `${role} / ${usage.model ?? "unconfigured"}${ui.separator}${count(usage.inputTokens)} in, ${count(usage.outputTokens)} out${ui.separator}cost ${formatCost(usage.estimatedCostUsd)}`,
      ui.color.gray,
    );
  }
  if (m.modelCalls) {
    ui.prose("Cost uses your configured rates; it is not the provider invoice.", ui.color.gray);
  }
}

function reviewNotes(ui: TerminalLayout, outcome: ReviewOutcome): void {
  const warnings = [
    ...new Set(
      outcome.warnings.map((w) =>
        /^Possible prompt-injection text/.test(w)
          ? "Prompt-injection text detected. Repository content was treated as data, not instructions."
          : w,
      ),
    ),
  ];
  if (!warnings.length) return;
  ui.section("Review notes");
  for (const warning of warnings.slice(0, 5)) ui.prose(warning, ui.color.yellow);
  if (warnings.length > 5) ui.prose(`${warnings.length - 5} more notes in the saved report.`, ui.color.gray);
}

function reportFooter(ui: TerminalLayout, outcome: ReviewOutcome, options: ReportOptions): void {
  ui.space();
  if (outcome.report) ui.prose(`Run report  ${relativeToCwd(outcome.report.markdown)}`, ui.color.cyan);
  if (options.local) {
    ui.prose("Summary     .air-review/summary.md", ui.color.cyan);
    ui.prose("Memory      .air-review/context.md", ui.color.gray);
    ui.prose(
      outcome.incomplete
        ? "Review incomplete; previous memory was kept. Fix the API error and rerun."
        : outcome.published
          ? "Saved locally. No pull-request comments published."
          : "Saved locally. No pull-request comments published (dry-run).",
      ui.color.gray,
    );
  } else {
    ui.prose(
      outcome.published
        ? "Findings published to the pull request."
        : "Nothing published (dry-run). Use --publish when ready.",
      ui.color.gray,
    );
  }
}

function relativeToCwd(path: string): string {
  const cwd = process.cwd().replace(/\/+$/, "") + "/";
  return path.startsWith(cwd) ? path.slice(cwd.length) : path;
}

/** All presentation is deterministic; review data remains unchanged. */
export function renderReviewReport(outcome: ReviewOutcome, options: ReportOptions = {}): string {
  const ui = new TerminalLayout(options);
  reviewHeader(ui, outcome, options);
  const open = outcome.findings.filter((f) => f.status !== "RESOLVED" && f.status !== "WONT_FIX");
  for (const [index, finding] of open.entries()) {
    ui.space();
    ui.lines.push(...renderFinding(finding, { ...options, index: index + 1 }));
  }
  routingSummary(ui, outcome.summary);
  stepsSummary(ui, outcome.summary);
  usageSummary(ui, outcome.summary);
  reviewNotes(ui, outcome);
  reportFooter(ui, outcome, options);
  ui.space();
  return ui.toString();
}
