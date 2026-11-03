import type { ScmAdapter } from "../contracts/scm.js";
import type { AirReviewConfig } from "../config/schema.js";
import type { GitRepository } from "../context/repository.js";
export type CiMode = "auto" | "github" | "azure-devops" | "local";
/** Accepted values of `--ci`, in the order shown in help text. */
export declare const CI_MODES: readonly CiMode[];
export interface ScmOptions {
    ci?: CiMode;
    owner?: string;
    /** GitHub repository name, or Azure Repos repository name/GUID. */
    repo?: string;
    pr?: number;
    base?: string;
    /** Azure DevOps organization URL (`--org`), e.g. https://dev.azure.com/acme. */
    org?: string;
    /** Azure DevOps project (`--project`). */
    project?: string;
    /** Receives non-fatal detection notes, e.g. a fallback to local mode. */
    onWarning?: (message: string) => void;
}
/**
 * The Azure DevOps token, from the configured env name first, then the
 * conventional PAT variables. Returned with the variable it came from so
 * `doctor` can say where it looked.
 */
export declare function azureDevOpsToken(config: AirReviewConfig): {
    token: string | undefined;
    /** `bearer` for Entra ID access tokens, `basic` for PATs and System.AccessToken. */
    kind: "basic" | "bearer";
    source: string;
    checked: string[];
};
/**
 * True when the command runs inside a CI job that is not a pull-request build
 * (for example a pipeline started by hand on `main`). There is nothing to
 * review there, and no pull request to comment on: callers exit 0 with a
 * message instead of failing the job.
 */
export declare function ciBuildWithoutPullRequest(options: Pick<ScmOptions, "ci" | "pr">): string | null;
export declare function createScmAdapter(config: AirReviewConfig, gitRepo: GitRepository, options: ScmOptions): ScmAdapter;
