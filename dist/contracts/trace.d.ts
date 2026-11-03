/**
 * Run trace: what actually happened during a review, step by step.
 *
 * Every step records its duration, the agent/model it used, the tokens it
 * consumed and its estimated cost. The trace is the source of the cost report
 * and of the workflow diagram, so the diagram always shows the path really
 * taken (including cached and skipped steps), never a static picture.
 */
export declare const STEP_STATUSES: readonly ["done", "cached", "skipped", "failed"];
export type StepStatus = (typeof STEP_STATUSES)[number];
export interface StepRecord {
    /** Stable step id, e.g. `review.model`. */
    id: string;
    /** Short human label, e.g. "Reviewer (heavy)". */
    label: string;
    status: StepStatus;
    startedAt: string;
    durationMs: number;
    /** Agent role that owns the step, when a model is involved. */
    role?: string;
    /** Model / deployment / agent name used by the step. */
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
    reasoningTokens?: number;
    /** USD, from the configured price table; undefined when unpriced. */
    estimatedCostUsd?: number;
    /** One line of context: "12 files, 340 lines", "no reviewable change", an error... */
    detail?: string;
}
export interface RunTraceSummary {
    runId: string;
    startedAt: string;
    durationMs: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalEstimatedCostUsd?: number;
    steps: StepRecord[];
}
