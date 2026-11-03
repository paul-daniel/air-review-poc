import type { Finding } from "../contracts/review.js";
import type { RepositoryDelta } from "../contracts/scm.js";
import type { CandidateFinding } from "../framework/rules.js";
export interface ReconciledRun {
    findings: Finding[];
    events: Array<{
        event: string;
        findingId: string;
        detail?: string;
    }>;
    resolved: Finding[];
    newOrReopened: Finding[];
}
/**
 * Merge the fresh candidates with the previous ledger:
 * - unchanged findings keep their state and thread reference;
 * - a finding whose anchor is removed and no longer emitted is treated as fixed;
 * - a finding that reappears after being resolved is reopened.
 */
export interface ReconcileOptions {
    /**
     * True when `delta` starts at the previously reviewed head, so previous
     * anchors are in `delta.fromSha` coordinates and must be shifted by the
     * lines added/removed since. False for a full re-review from the base
     * (first run, `--force`, config change): previous anchors already describe
     * the current head and must not be moved.
     */
    incremental: boolean;
    /**
     * Rule ids produced by deterministic rules. Model findings invent their own
     * rule names ("discount-percent-misuse" one run, "discount-percent-calculation"
     * the next), so two model findings in the same file within a few lines of
     * each other are treated as the same finding and keep the earlier id.
     */
    isDeterministicRule?: (ruleId: string) => boolean;
}
export declare function reconcile(previous: Finding[], candidates: CandidateFinding[], delta: RepositoryDelta, configHash: string, headSha: string, options?: ReconcileOptions): ReconciledRun;
