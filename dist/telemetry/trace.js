/** Cost of one usage record for one model, from the price table (USD); undefined when unpriced. */
export function costOfUsage(usage, model, pricing) {
    if (!usage || !model)
        return undefined;
    if (usage.inputTokens === 0 && usage.outputTokens === 0)
        return 0;
    const price = pricing[model];
    if (!price || usage.usageIncomplete)
        return undefined;
    const cached = usage.cachedInputTokens ?? 0;
    if (cached > 0 && price.cachedInput === undefined)
        return undefined;
    const cost = ((usage.inputTokens - cached) / 1_000_000) * price.input +
        (cached / 1_000_000) * (price.cachedInput ?? price.input) +
        (usage.outputTokens / 1_000_000) * price.output;
    return Number(cost.toFixed(8));
}
/**
 * Collects what a run actually did, in order. One `begin`/`end` pair per step;
 * `skip` records a step that was not needed (same head, no reviewable change,
 * `--deterministic-only`...), so the workflow diagram can show it greyed out.
 */
export class RunTrace {
    pricing;
    runId;
    startedAt;
    records = [];
    now;
    constructor(runId, pricing, now = Date.now) {
        this.pricing = pricing;
        this.runId = runId;
        this.now = now;
        this.startedAt = new Date(now());
    }
    begin(id, label, meta = {}) {
        const started = this.now();
        const record = {
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
        const usage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, reasoningTokens: 0 };
        let touched = false;
        const handle = {
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
                if (model)
                    record.model = model;
            },
            end: (status = "done", extra = {}) => {
                record.status = status;
                record.durationMs = Math.max(0, this.now() - started);
                if (extra.detail !== undefined)
                    record.detail = extra.detail;
                if (extra.model !== undefined)
                    record.model = extra.model;
                if (touched) {
                    record.inputTokens = usage.inputTokens;
                    record.outputTokens = usage.outputTokens;
                    if (usage.cachedInputTokens !== undefined)
                        record.cachedInputTokens = usage.cachedInputTokens;
                    if (usage.reasoningTokens !== undefined)
                        record.reasoningTokens = usage.reasoningTokens;
                    const cost = costOfUsage(usage, record.model, this.pricing);
                    if (cost !== undefined)
                        record.estimatedCostUsd = cost;
                }
                return record;
            },
        };
        return handle;
    }
    skip(id, label, detail, meta = {}) {
        const record = {
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
    steps() {
        return [...this.records];
    }
    summary() {
        const steps = this.steps();
        const priced = steps.filter((s) => s.estimatedCostUsd !== undefined);
        const modelSteps = steps.filter((s) => s.inputTokens !== undefined || s.outputTokens !== undefined);
        const unpriced = modelSteps.some((s) => s.estimatedCostUsd === undefined && (s.inputTokens || s.outputTokens));
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
//# sourceMappingURL=trace.js.map