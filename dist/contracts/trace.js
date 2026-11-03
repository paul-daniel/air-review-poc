/**
 * Run trace: what actually happened during a review, step by step.
 *
 * Every step records its duration, the agent/model it used, the tokens it
 * consumed and its estimated cost. The trace is the source of the cost report
 * and of the workflow diagram, so the diagram always shows the path really
 * taken (including cached and skipped steps), never a static picture.
 */
export const STEP_STATUSES = ["done", "cached", "skipped", "failed"];
//# sourceMappingURL=trace.js.map