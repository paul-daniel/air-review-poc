import type { ReviewOutcome } from "../review/pipeline.js";
import { type TerminalOptions } from "./terminal/layout.js";
export { terminalText, wrapText } from "./terminal/layout.js";
export { renderCodeFrame as renderCodeBlock } from "./terminal/code-frame.js";
export interface ReportOptions extends TerminalOptions {
    deterministicOnly?: boolean;
    local?: boolean;
}
/** All presentation is deterministic; review data remains unchanged. */
export declare function renderReviewReport(outcome: ReviewOutcome, options?: ReportOptions): string;
