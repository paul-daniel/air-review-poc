import type { AirReviewConfig } from "../config/schema.js";
import type { Finding } from "../contracts/review.js";
export interface GateResult {
    passed: boolean;
    blocking: Finding[];
}
/**
 * Policy gate: which open findings actually block the merge. Only IN_PR
 * findings can block: FOLLOW_UP and REPO_WIDE findings describe work that by
 * definition belongs outside this change.
 */
export declare function evaluateGate(config: AirReviewConfig, findings: Finding[]): GateResult;
