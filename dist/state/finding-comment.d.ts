import type { Finding, FindingCategory, Severity } from "../contracts/review.js";
export declare function findingMarker(id: string): string;
export declare function findingIdFromBody(body: string): string | null;
export declare function categoryLabel(category: FindingCategory | undefined): string;
export declare function severityIcon(severity: Severity): string;
export interface FindingCommentOptions {
    /**
     * Render `suggestedCode` as a committable ```suggestion block when the
     * reviewer declared it a drop-in replacement of the anchored lines (GitHub
     * applies those in one click). Platforms without the feature (Azure DevOps)
     * get a normal fenced code block.
     */
    suggestionBlocks?: boolean;
}
/**
 * Inline review comment. Layout (see docs/review-format.md for the rationale):
 *
 *   <hidden marker>
 *   ### 🛑 CRITICAL · Correctness — <title>
 *   <file:lines · symbol>
 *   <what is wrong and its consequence>            ← summary
 *   **Fix:** <repository-consistent recommendation> ← suggestion
 *   ```suggestion / ```lang <code>                  ← optional
 *   **Evidence** bullets                            ← why we believe it
 *   <sub>scope · confidence · rule · id</sub>       ← machine-readable footer
 */
/**
 * Reply posted in an existing finding thread after the author pushed a change
 * that touched the code but did not settle the finding, or when a resolved
 * finding comes back. It states what remains to be done, without judging the
 * attempt.
 */
export declare function renderFollowUpComment(finding: Finding, headSha: string, options?: FindingCommentOptions): string;
export declare function renderFindingComment(finding: Finding, options?: FindingCommentOptions): string;
