/**
 * Azure DevOps (Azure Repos) pull-request adapter: air-review as a real reviewer.
 *
 * Review memory lives in pull-request threads, so nothing has to exist outside
 * the customer's repository platform:
 *
 *   - one "state" thread (status `closed`, collapsed) whose first comment is the
 *     machine-readable `air-review:state` envelope,
 *   - one "summary" thread (`active` while findings are open, `fixed` once all
 *     were resolved, `closed` when there was nothing to report),
 *   - one inline thread per finding, anchored on the right (head) side of the file.
 *
 * Every comment carries a hidden marker. Before creating anything the adapter
 * looks for the marker in the existing threads, so a lost ledger, a re-run or a
 * second identity never produces a duplicate thread: the existing one is
 * updated or replied to instead.
 *
 * After publishing, the adapter registers the reviewing identity as a reviewer
 * and casts the verdict as a vote (10 approved, 5 approved with suggestions,
 * -5 waiting for author), and can post a pull-request status usable by a
 * "Status" branch policy. It never completes or merges the pull request.
 *
 * All endpoints below are from the Azure DevOps Git REST reference, api-version 7.1:
 * https://learn.microsoft.com/en-us/rest/api/azure/devops/git/
 */
import type { PullRequestSnapshot, RepositoryDelta, ScmAdapter } from "../contracts/scm.js";
import type { Finding, ReviewSummary, ThreadRef } from "../contracts/review.js";
import type { GitRepository } from "../context/repository.js";
import { type AzureDevOpsClientOptions } from "./azure-devops-http.js";
export interface AzureDevOpsAdapterOptions extends AzureDevOpsClientOptions {
    /** Local checkout used for the diff (the pipeline agent has the repo with `fetchDepth: 0`). */
    git: GitRepository;
    /** Cast the reviewer vote after publishing (default true). */
    vote?: boolean;
    /** Post a pull-request status (`genre/name`) with the gate result (default off). */
    status?: {
        enabled: boolean;
        genre: string;
        name: string;
    };
    /** Build URL shown on the status, e.g. the pipeline run. */
    statusTargetUrl?: string;
}
/** Reviewer vote values (Pull Request Reviewers - Create Pull Request Reviewer, `vote`). */
export declare const ADO_VOTE: {
    readonly approved: 10;
    readonly approvedWithSuggestions: 5;
    readonly noVote: 0;
    readonly waitingForAuthor: -5;
    readonly rejected: -10;
};
/** Verdict → vote. `comment` keeps the reviewer registered without a vote. */
export declare function voteForVerdict(verdict: ReviewSummary["verdict"]): number;
export declare class AzureDevOpsAdapter implements ScmAdapter {
    private readonly options;
    readonly kind: "azure-devops";
    private readonly client;
    private snapshot;
    /** Thread list cache for one publish pass (invalidated after every write). */
    private threadCache;
    /** Azure DevOps rejects unauthenticated calls; exposed for `doctor`. */
    readonly authenticated: boolean;
    constructor(options: AzureDevOpsAdapterOptions);
    /**
     * GET {org}/{project}/_apis/git/repositories/{repositoryId}/pullRequests/{pullRequestId}?api-version=7.1
     * https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-requests/get-pull-request?view=azure-devops-rest-7.1
     */
    getPullRequest(): Promise<PullRequestSnapshot>;
    /**
     * The diff is computed locally: the agent has the repository checked out
     * (`fetchDepth: 0`), and pull-request semantics mean comparing from the
     * merge base so commits that landed on the target branch do not show up.
     */
    getDelta(fromSha: string, toSha: string): Promise<RepositoryDelta>;
    /**
     * GET .../pullRequests/{pullRequestId}/threads?api-version=7.1
     * https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-threads/list?view=azure-devops-rest-7.1
     */
    private threads;
    private invalidate;
    /** The first live comment of a thread is where air-review keeps its markers. */
    private static firstComment;
    /** The newest thread carrying the marker: a replacement thread supersedes an older one. */
    private findByMarker;
    /**
     * Azure DevOps lets only a comment's author (or a project admin) edit it. When
     * a review was first published by one identity (a developer's PAT) and later
     * by another (the pipeline's build service), edits are refused with 403. The
     * adapter then falls back to creating a replacement thread or a reply.
     */
    private static isAuthorRefusal;
    /** Best effort: closing a thread we no longer own may itself be refused. */
    private tryClose;
    /**
     * POST .../pullRequests/{pullRequestId}/threads?api-version=7.1
     * https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-threads/create?view=azure-devops-rest-7.1
     */
    private createThread;
    /**
     * PATCH .../pullRequests/{pullRequestId}/threads/{threadId}/comments/{commentId}?api-version=7.1
     * https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-thread-comments/update?view=azure-devops-rest-7.1
     */
    private updateComment;
    /**
     * PATCH .../pullRequests/{pullRequestId}/threads/{threadId}?api-version=7.1
     * https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-threads/update?view=azure-devops-rest-7.1
     */
    private setThreadStatus;
    /**
     * POST .../pullRequests/{pullRequestId}/threads/{threadId}/comments?api-version=7.1
     * https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-thread-comments/create?view=azure-devops-rest-7.1
     */
    private replyTo;
    /**
     * Human decisions on finding threads: `wontFix`, `byDesign`, `closed`, and
     * `fixed` ("Resolved" in the portal). The adapter sets `fixed` itself only
     * when it resolved the finding, which the ledger records as RESOLVED; the
     * pipeline therefore treats a `fixed` thread of a still-open finding as a
     * reviewer's decision.
     */
    listDismissedFindings(): Promise<Set<string>>;
    listState(): Promise<string | null>;
    writeState(body: string): Promise<void>;
    /**
     * One thread per finding, never two: if a thread already carries this
     * finding's marker (ledger lost, manual re-run, earlier identity), it is
     * updated and reactivated instead of being created again.
     */
    createInlineFinding(finding: Finding): Promise<ThreadRef>;
    updateFinding(ref: ThreadRef, finding: Finding): Promise<void>;
    /** Continue the finding's thread: a reply with what is still to be done, thread back to active. */
    replyToFinding(ref: ThreadRef, finding: Finding): Promise<void>;
    resolveFinding(ref: ThreadRef): Promise<void>;
    upsertSummary(summary: ReviewSummary, findings?: Finding[]): Promise<void>;
    /**
     * Act as a reviewer: register the reviewing identity (the PAT's user, or the
     * pipeline's build service) and cast the verdict as a vote:
     *   10  approved                  - nothing open
     *    5  approved with suggestions - open findings, none blocking
     *   -5  waiting for author        - blocking findings (the gate failed)
     *    0  no vote                   - incomplete review (never vote on partial data)
     * Optionally posts a pull-request status for a "Status" branch policy.
     * The vote never completes or merges the pull request.
     *
     * GET  {org}/_apis/connectionData                       -> authenticatedUser.id
     * PUT  .../pullRequests/{id}/reviewers/{reviewerId}     body { vote, id }
     * https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-reviewers/create-pull-request-reviewer?view=azure-devops-rest-7.1
     * POST .../pullRequests/{id}/statuses                   body { state, context, description }
     * https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-statuses/create?view=azure-devops-rest-7.1
     */
    castVote(summary: ReviewSummary): Promise<void>;
}
/** ThreadRef ids are `${threadId}:${commentId}` so an update needs no listing. */
export declare function threadRefId(threadId: number, commentId: number): string;
export declare function parseThreadRef(ref: ThreadRef): {
    threadId: number;
    commentId: number;
};
