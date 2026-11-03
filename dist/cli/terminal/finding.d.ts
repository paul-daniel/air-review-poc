import type { Finding } from "../../contracts/review.js";
import { type TerminalOptions } from "./layout.js";
export interface FindingOptions extends TerminalOptions {
    index?: number;
    detailed?: boolean;
}
export declare function renderFinding(finding: Finding, options?: FindingOptions): string[];
