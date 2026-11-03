import { Octokit } from "@octokit/rest";
import type { PullRequestSnapshot, RepositoryDelta, ScmAdapter } from "../contracts/scm.js";
import type { Finding, ReviewSummary, ThreadRef } from "../contracts/review.js";
export interface GitHubAdapterOptions {
    owner: string;
    repo: string;
    pullNumber: number;
    token?: string;
    apiBaseUrl?: string;
    /** Inject for tests; production uses the real REST client. */
    octokit?: Octokit;
}
export declare class GitHubAdapter implements ScmAdapter {
    private readonly options;
    readonly kind: "github";
    private readonly octokit;
    private snapshot;
    /** Unauthenticated reads are allowed; writes require a token. */
    readonly authenticated: boolean;
    constructor(options: GitHubAdapterOptions);
    /** Fail with an actionable message when a write is attempted without a token. */
    private requireToken;
    getPullRequest(): Promise<PullRequestSnapshot>;
    getDelta(fromSha: string, toSha: string): Promise<RepositoryDelta>;
    private issueComments;
    listState(): Promise<string | null>;
    writeState(body: string): Promise<void>;
    /**
     * GitHub review comments must sit on a line of the diff. A finding on
     * unchanged code (anchor.inDiff === false), or one GitHub rejects with 422,
     * is published as a general pull-request comment instead; its ThreadRef id
     * carries the `issue:` prefix so updates and resolutions use the issues API.
     */
    createInlineFinding(finding: Finding): Promise<ThreadRef>;
    private createGeneralFinding;
    private updateCommentBody;
    updateFinding(ref: ThreadRef, finding: Finding): Promise<void>;
    /** Continue the finding's conversation: a reply to the review comment (or a new PR comment for general ones). */
    replyToFinding(ref: ThreadRef, finding: Finding): Promise<void>;
    resolveFinding(ref: ThreadRef): Promise<void>;
    upsertSummary(summary: ReviewSummary, findings?: Finding[]): Promise<void>;
}
