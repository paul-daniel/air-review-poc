import type { PullRequestSnapshot, RepositoryDelta, ScmAdapter } from "../contracts/scm.js";
import type { Finding, ReviewSummary, ThreadRef } from "../contracts/review.js";
import type { GitRepository } from "../context/repository.js";
export interface LocalAdapterOptions {
    repo: GitRepository;
    base?: string;
    stateDir: string;
}
export declare class LocalAdapter implements ScmAdapter {
    private readonly options;
    readonly kind: "local";
    constructor(options: LocalAdapterOptions);
    private get stateDir();
    private resolveBase;
    getPullRequest(): Promise<PullRequestSnapshot>;
    getDelta(fromSha: string, toSha: string): Promise<RepositoryDelta>;
    private stateFile;
    listState(): Promise<string | null>;
    writeState(body: string): Promise<void>;
    createInlineFinding(finding: Finding): Promise<ThreadRef>;
    updateFinding(_ref: ThreadRef, _finding: Finding): Promise<void>;
    resolveFinding(_ref: ThreadRef): Promise<void>;
    upsertSummary(summary: ReviewSummary, findings?: Finding[]): Promise<void>;
}
