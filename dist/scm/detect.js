import { readFileSync } from "node:fs";
import { ScmError } from "../errors.js";
import { GitHubAdapter } from "./github.js";
import { AzureDevOpsAdapter } from "./azure-devops.js";
import { LocalAdapter } from "./local.js";
/** Accepted values of `--ci`, in the order shown in help text. */
export const CI_MODES = ["auto", "github", "azure-devops", "local"];
function githubEventData() {
    const path = process.env.GITHUB_EVENT_PATH;
    if (!path)
        return null;
    try {
        return JSON.parse(readFileSync(path, "utf8"));
    }
    catch {
        return null;
    }
}
function azurePipelinesEnv() {
    const rawId = process.env.SYSTEM_PULLREQUEST_PULLREQUESTID;
    const parsed = rawId ? Number(rawId) : NaN;
    return {
        isPipeline: /^true$/i.test(process.env.TF_BUILD ?? ""),
        pullRequestId: Number.isInteger(parsed) && parsed > 0 ? parsed : undefined,
        organizationUrl: process.env.SYSTEM_TEAMFOUNDATIONCOLLECTIONURI || undefined,
        project: process.env.SYSTEM_TEAMPROJECT || undefined,
        repository: process.env.BUILD_REPOSITORY_ID || process.env.BUILD_REPOSITORY_NAME || undefined,
        repositoryProvider: process.env.BUILD_REPOSITORY_PROVIDER || undefined,
    };
}
/**
 * The Azure DevOps token, from the configured env name first, then the
 * conventional PAT variables. Returned with the variable it came from so
 * `doctor` can say where it looked.
 */
export function azureDevOpsToken(config) {
    const checked = [
        config.platform.azureDevops.tokenEnv,
        "AZURE_DEVOPS_ACCESS_TOKEN",
        "AZURE_DEVOPS_EXT_PAT",
        "AZURE_DEVOPS_TOKEN",
    ];
    for (const name of checked) {
        const value = process.env[name];
        if (value)
            return { token: value, kind: azureTokenKind(name, value), source: name, checked };
    }
    return { token: undefined, kind: "basic", source: checked[0], checked };
}
/**
 * An Entra ID access token (`az account get-access-token --resource
 * 499b84ac-1321-427f-aa17-267ca6975798`) is a JWT and only works as a bearer
 * token; PATs are opaque strings and need Basic auth. `System.AccessToken` is
 * also a JWT and Azure DevOps accepts it either way, so bearer is safe for it.
 */
function azureTokenKind(source, token) {
    if (source === "AZURE_DEVOPS_ACCESS_TOKEN")
        return "bearer";
    return /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(token.trim()) ? "bearer" : "basic";
}
export function createScmAdapter(config, gitRepo, options) {
    const mode = options.ci === "auto" ? detectCiMode(config) : options.ci;
    if (mode === "github")
        return createGitHubAdapter(config, options);
    if (mode === "azure-devops") {
        const adapter = createAzureDevOpsAdapter(config, gitRepo, options);
        if (adapter)
            return adapter;
    }
    return new LocalAdapter({
        repo: gitRepo,
        base: options.base ?? config.platform.local.base,
        stateDir: ".air-review",
    });
}
function createGitHubAdapter(config, options) {
    const event = githubEventData();
    const repositoryEnv = process.env.GITHUB_REPOSITORY;
    const [envOwner, envRepo] = repositoryEnv?.split("/") ?? [];
    const owner = options.owner ?? config.platform.github.owner ?? envOwner;
    const repo = options.repo ?? config.platform.github.repo ?? envRepo;
    const pr = options.pr ?? event?.pull_request?.number;
    if (!owner || !repo || !Number.isInteger(pr) || !pr) {
        throw new ScmError(`GitHub review requires owner, repo and pull request number. ` +
            `Pass --owner --repo --pr, or run inside a pull_request workflow.`);
    }
    const tokenEnv = config.platform.github.tokenEnv ?? "GITHUB_TOKEN";
    return new GitHubAdapter({
        owner,
        repo,
        pullNumber: pr,
        token: process.env[tokenEnv] ?? process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN,
        apiBaseUrl: config.platform.github.apiBaseUrl,
    });
}
/**
 * Build the Azure DevOps adapter from flags, config and Azure Pipelines
 * variables. Returns null (after a warning) when an Azure Pipelines build was
 * auto-detected but is not a pull-request validation build, so the caller
 * falls back to a local review instead of failing the job.
 */
function createAzureDevOpsAdapter(config, gitRepo, options) {
    const env = azurePipelinesEnv();
    const settings = config.platform.azureDevops;
    const auto = options.ci === "auto";
    const pullRequestId = options.pr ?? env.pullRequestId;
    if (!pullRequestId) {
        if (auto && env.isPipeline) {
            options.onWarning?.("Azure Pipelines build without a pull request (SYSTEM_PULLREQUEST_PULLREQUESTID is not set): " +
                "this is not a PR validation build, so the review runs locally against the base ref.");
            return null;
        }
        throw new ScmError(`Azure DevOps review requires the organization URL, project, repository and pull request id. ` +
            `Pass --org --project --repo --pr, or run inside an Azure Pipelines pull request validation build.`);
    }
    const explicitRepo = options.repo ?? settings.repository;
    if (auto && !explicitRepo && env.repositoryProvider && env.repositoryProvider !== "TfsGit") {
        options.onWarning?.(`Azure Pipelines build for a ${env.repositoryProvider} repository, not Azure Repos: ` +
            `the Azure DevOps adapter cannot comment on it, so the review runs locally.`);
        return null;
    }
    const organizationUrl = options.org ?? settings.organizationUrl ?? env.organizationUrl;
    const project = options.project ?? settings.project ?? env.project;
    const repositoryId = explicitRepo ?? env.repository;
    const missing = [
        !organizationUrl && "--org <url> (or SYSTEM_TEAMFOUNDATIONCOLLECTIONURI)",
        !project && "--project <name> (or SYSTEM_TEAMPROJECT)",
        !repositoryId && "--repo <name|guid> (or BUILD_REPOSITORY_ID)",
    ].filter((item) => Boolean(item));
    if (!organizationUrl || !project || !repositoryId) {
        throw new ScmError(`Azure DevOps review is missing: ${missing.join(", ")}.`);
    }
    if (!/^https?:\/\//i.test(organizationUrl)) {
        throw new ScmError(`Azure DevOps organization URL must be absolute, e.g. https://dev.azure.com/acme (got "${organizationUrl}").`);
    }
    const { token, kind } = azureDevOpsToken(config);
    const buildUrl = env.organizationUrl && project && process.env.BUILD_BUILDID
        ? `${env.organizationUrl.replace(/\/+$/, "")}/${encodeURIComponent(project)}/_build/results?buildId=${process.env.BUILD_BUILDID}`
        : undefined;
    return new AzureDevOpsAdapter({
        organizationUrl,
        project,
        repositoryId,
        pullRequestId,
        token,
        tokenKind: kind,
        apiVersion: settings.apiVersion,
        git: gitRepo,
        vote: settings.vote.enabled,
        status: settings.status,
        statusTargetUrl: buildUrl,
    });
}
function detectCiMode(config) {
    if (config.platform.provider === "github")
        return "github";
    if (config.platform.provider === "azure-devops")
        return "azure-devops";
    if (process.env.GITHUB_EVENT_PATH && process.env.GITHUB_EVENT_NAME === "pull_request") {
        return "github";
    }
    // Azure Pipelines: TF_BUILD=True on every job; the PR id (and the fallback
    // when it is absent) is handled in createAzureDevOpsAdapter.
    if (!process.env.GITHUB_ACTIONS && azurePipelinesEnv().isPipeline)
        return "azure-devops";
    return "local";
}
//# sourceMappingURL=detect.js.map