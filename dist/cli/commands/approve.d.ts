import type { ReviewSummary } from "../../contracts/review.js";
import type { AirReviewConfig } from "../../config/schema.js";
import type { CliContext } from "../context.js";
/**
 * `air-review approve`: the pipeline's last word on a pull request.
 *
 * The review step comments, requests changes when something blocks, and
 * otherwise withholds its vote. This command, placed at the end of the
 * pipeline with a condition on the review, build and test steps, reads the
 * review memory already in the pull request and casts the approving vote
 * (approved, or approved with suggestions when only nitpicks remain). It
 * never completes or merges the pull request, and it never approves a head
 * that the review did not examine.
 */
export interface ApprovalDecision {
    action: "approve" | "approve-with-suggestions" | "refuse" | "stale" | "no-review";
    reason: string;
    summary?: ReviewSummary;
}
export declare function decideApproval(config: AirReviewConfig, stateBody: string | null, pr: {
    owner: string;
    repo: string;
    number: number | null;
    headSha: string;
}): ApprovalDecision;
export declare function runApprove(ctx: CliContext, options: {
    json: boolean;
    dryRun: boolean;
}): Promise<number>;
