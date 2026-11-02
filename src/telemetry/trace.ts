import type { Usage } from "../contracts/model.js";
import type { RunTraceSummary, StepRecord, StepStatus } from "../contracts/trace.js";
import type { PricingTable } from "./run-log.js";

/** Cost of one usage record for one model, from the price table (USD); undefined when unpriced. */
export function costOfUsage(
  usage: Usage | undefined,
  model: string | undefined,
  pricing: PricingTable,
): number | undefined {
  if (!usage || !model) return undefined;
  if (usage.inputTokens === 0 && usage.outputTokens === 0) return 0;
  const price = pricing[model];
  if (!price || usage.usageIncomplete) return undefined;
  const cached = usage.cachedInputTokens ?? 0;
  if (cached > 0 && price.cachedInput === undefined) return undefined;
  const cost =
    ((usage.inputTokens - cached) / 1_000_000) * price.input +
    (cached / 1_000_000) * (price.cachedInput ?? price.input) +
    (usage.outputTokens / 1_000_000) * price.output;
  return Number(cost.toFixed(8));
}

export interface StepHandle {
  readonly id: string;
  /** Attribute model usage to this step (several calls add up). */
  addUsage(usage: Usage, model?: string): void;
  /** Close the step. `detail` replaces the one given at `begin`. */
  end(status?: StepStatus, extra?: { detail?: string; model?: string }): StepRecord;
}

/**
 * Collects what a run actually did, in order. One `begin`/`end` pair per step;
 * `skip` records a step that was not needed (same head, no reviewable change,
 * `--deterministic-only`...), so the workflow diagram can show it greyed out.
 */
export class RunTrace {
  readonly runId: string;
  readonly startedAt: Date;
  private readonly records: StepRecord[] = [];
  private readonly now: () => number;

  constructor(
    runId: string,
    private readonly pricing: PricingTable,
    now: () => number = Date.now,
  ) {
    this.runId = runId;
    this.now = now;
    this.startedAt = new Date(now());
  }

  begin(
    id: string,
    label: string,
    meta: { role?: string; model?: string; detail?: string } = {},
  ): StepHandle {
    const started = this.now();
    const record: StepRecord = {
      id,
      label,
      status: "done",
      startedAt: new Date(started).toISOString(),
      durationMs: 0,
      ...(meta.role ? { role: meta.role } : {}),
      ...(meta.model ? { model: meta.model } : {}),
      ...(meta.detail ? { detail: meta.detail } : {}),
    };
    this.records.push(record);
    const usage: Usage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, reasoningTokens: 0 };
    let touched = false;
    const handle: StepHandle = {
      id,
      addUsage: (next, model) => {
        touched = true;
        usage.inputTokens += next.inputTokens;
        usage.outputTokens += next.outputTokens;
        usage.cachedInputTokens =
          usage.cachedInputTokens !== undefined && next.cachedInputTokens !== undefined
            ? usage.cachedInputTokens + next.cachedInputTokens
            : undefined;
        usage.reasoningTokens =
          usage.reasoningTokens !== undefined && next.reasoningTokens !== undefined
            ? usage.reasoningTokens + next.reasoningTokens
            : undefined;
        usage.usageIncomplete = usage.usageIncomplete || next.usageIncomplete;
        if (model) record.model = model;
      },
      end: (status = "done", extra = {}) => {
        record.status = status;
        record.durationMs = Math.max(0, this.now() - started);
        if (extra.detail !== undefined) record.detail = extra.detail;
        if (extra.model !== undefined) record.model = extra.model;
        if (touched) {
          record.inputTokens = usage.inputTokens;
          record.outputTokens = usage.outputTokens;
          if (usage.cachedInputTokens !== undefined) record.cachedInputTokens = usage.cachedInputTokens;
          if (usage.reasoningTokens !== undefined) record.reasoningTokens = usage.reasoningTokens;
          const cost = costOfUsage(usage, record.model, this.pricing);
          if (cost !== undefined) record.estimatedCostUsd = cost;
        }
        return record;
      },
    };
    return handle;
  }

  skip(id: string, label: string, detail: string, meta: { role?: string; model?: string } = {}): StepRecord {
    const record: StepRecord = {
      id,
      label,
      status: "skipped",
      startedAt: new Date(this.now()).toISOString(),
      durationMs: 0,
      detail,
      ...(meta.role ? { role: meta.role } : {}),
      ...(meta.model ? { model: meta.model } : {}),
    };
    this.records.push(record);
    return record;
  }

  steps(): StepRecord[] {
    return [...this.records];
  }

  summary(): RunTraceSummary {
    const steps = this.steps();
    const priced = steps.filter((s) => s.estimatedCostUsd !== undefined);
    const modelSteps = steps.filter((s) => s.inputTokens !== undefined || s.outputTokens !== undefined);
    const unpriced = modelSteps.some(
      (s) => s.estimatedCostUsd === undefined && (s.inputTokens || s.outputTokens),
    );
    return {
      runId: this.runId,
      startedAt: this.startedAt.toISOString(),
      durationMs: Math.max(0, this.now() - this.startedAt.getTime()),
      totalInputTokens: steps.reduce((sum, s) => sum + (s.inputTokens ?? 0), 0),
      totalOutputTokens: steps.reduce((sum, s) => sum + (s.outputTokens ?? 0), 0),
      totalEstimatedCostUsd: unpriced
        ? undefined
        : Number(priced.reduce((sum, s) => sum + (s.estimatedCostUsd ?? 0), 0).toFixed(8)),
      steps,
    };
  }
}
