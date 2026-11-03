import type { Usage } from "../contracts/model.js";
import type { RunTraceSummary, StepRecord, StepStatus } from "../contracts/trace.js";
import type { PricingTable } from "./run-log.js";
/** Cost of one usage record for one model, from the price table (USD); undefined when unpriced. */
export declare function costOfUsage(usage: Usage | undefined, model: string | undefined, pricing: PricingTable): number | undefined;
export interface StepHandle {
    readonly id: string;
    /** Attribute model usage to this step (several calls add up). */
    addUsage(usage: Usage, model?: string): void;
    /** Close the step. `detail` replaces the one given at `begin`. */
    end(status?: StepStatus, extra?: {
        detail?: string;
        model?: string;
    }): StepRecord;
}
/**
 * Collects what a run actually did, in order. One `begin`/`end` pair per step;
 * `skip` records a step that was not needed (same head, no reviewable change,
 * `--deterministic-only`...), so the workflow diagram can show it greyed out.
 */
export declare class RunTrace {
    private readonly pricing;
    readonly runId: string;
    readonly startedAt: Date;
    private readonly records;
    private readonly now;
    constructor(runId: string, pricing: PricingTable, now?: () => number);
    begin(id: string, label: string, meta?: {
        role?: string;
        model?: string;
        detail?: string;
    }): StepHandle;
    skip(id: string, label: string, detail: string, meta?: {
        role?: string;
        model?: string;
    }): StepRecord;
    steps(): StepRecord[];
    summary(): RunTraceSummary;
}
