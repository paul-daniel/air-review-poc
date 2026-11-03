import type { Finding, ReviewSummary } from "../contracts/review.js";
export declare function verdictLabel(verdict: ReviewSummary["verdict"]): string;
/** Markdown table: one row per step, then the total line. */
export declare function renderStepTable(summary: ReviewSummary): string;
export declare function renderRoutingBlock(summary: ReviewSummary): string;
export interface RunReportInput {
    summary: ReviewSummary;
    findings: Finding[];
    configuredModels: Record<string, string>;
}
export declare function renderRunReport(input: RunReportInput): string;
/** Write `<dir>/<runId>.md` and `<dir>/<runId>.json`; never fails the review. */
export declare function writeRunReport(dir: string, input: RunReportInput): {
    markdown: string;
    json: string;
} | null;
