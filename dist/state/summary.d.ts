import type { Finding, ReviewSummary } from "../contracts/review.js";
export declare const SUMMARY_MARKER_OPEN = "<!-- air-review:summary:v1 -->";
export declare const SUMMARY_MARKER_CLOSE = "<!-- /air-review:summary:v1 -->";
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
export declare function renderSummaryMarkdown(summary: ReviewSummary, options?: SummaryRenderOptions): string;
export declare function upsertSummaryBody(current: string, summary: ReviewSummary, options?: SummaryRenderOptions): string;
