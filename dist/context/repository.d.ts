export declare class GitRepository {
    readonly root: string;
    constructor(root: string);
    static discover(cwd: string): Promise<GitRepository>;
    run(args: string[], options?: {
        cwd?: string;
        allowFailure?: boolean;
    }): Promise<string>;
    headSha(): Promise<string>;
    resolveRef(ref: string): Promise<string>;
    mergeBase(a: string, b: string): Promise<string>;
    diff(from: string, to: string): Promise<string>;
    listTrackedFiles(): Promise<string[]>;
    readFile(path: string): string;
    readFileAt(ref: string, path: string): Promise<string>;
    /**
     * `owner/repo` from the origin URL. GitHub/GitLab/Bitbucket end in
     * `owner/repo(.git)`; Azure Repos URLs end in `project/_git/repo` (or
     * `org@dev.azure.com:v3/org/project/repo` over SSH), where the project is
     * the meaningful owner.
     */
    repositoryId(): Promise<string>;
}
