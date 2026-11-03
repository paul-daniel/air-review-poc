/**
 * Review-domain contracts shared by the whole engine.
 *
 * These types follow the taxonomy defined in the air-review architecture:
 * severity is separate from confidence, and scope says where a fix belongs.
 */
/**
 * BLOCKER / CRITICAL / MAJOR / MINOR must be fixed before approval.
 * NITPICK is a reviewer preference (the code is correct); INFO is existing
 * debt or a follow-up. Neither blocks.
 */
export const SEVERITIES = ["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "NITPICK", "INFO"];
export const SCOPES = ["IN_PR", "FOLLOW_UP", "REPO_WIDE"];
export const RULE_ORIGINS = ["PROJECT_CONFIG", "FRAMEWORK", "REPO_CONVENTION", "HEURISTIC"];
export const FINDING_STATUSES = ["OPEN", "RESOLVED", "REOPENED", "WONT_FIX"];
/**
 * What kind of problem a finding describes. Orthogonal to severity (how bad)
 * and confidence (how sure): a reader scanning a pull request filters on it,
 * which is why the main AI reviewers (CodeRabbit, Qodo) label every comment
 * with one. See docs/review-format.md.
 */
export const FINDING_CATEGORIES = [
    "correctness",
    "security",
    "performance",
    "maintainability",
    "consistency",
    "tests",
    "docs",
];
//# sourceMappingURL=review.js.map