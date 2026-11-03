/**
 * Minimal Azure DevOps REST client over the global `fetch`.
 *
 * Every call targets one pull request of one repository, so the base URL is
 * fixed at construction time:
 *
 *   {organizationUrl}/{project}/_apis/git/repositories/{repositoryId}/pullRequests/{pullRequestId}
 *
 * The individual endpoint shapes are quoted in azure-devops.ts next to each
 * call, with their Microsoft Learn reference URLs.
 */
import { ScmError } from "../errors.js";
export type FetchLike = typeof globalThis.fetch;
export interface AzureDevOpsClientOptions {
    /** Organization (collection) URL, e.g. `https://dev.azure.com/acme`. */
    organizationUrl: string;
    /** Project name or id. */
    project: string;
    /** Repository name or GUID. */
    repositoryId: string;
    pullRequestId: number;
    /** PAT or `$(System.AccessToken)`. Azure DevOps rejects every unauthenticated call. */
    token?: string;
    /** `basic` (default, works for PATs and System.AccessToken) or `bearer` (Entra ID / OAuth tokens). */
    tokenKind?: "basic" | "bearer";
    /** REST api-version; 7.1 is the version the adapter was written against. */
    apiVersion?: string;
    /** Inject for tests; production uses `globalThis.fetch`. */
    fetch?: FetchLike;
}
/** What to do about 401/403 (and the HTML sign-in page Azure DevOps returns as 203). */
export declare const AZURE_AUTH_HINT: string;
/** An HTTP-level failure from Azure DevOps, with the status and the server's own message. */
export declare class AzureDevOpsHttpError extends ScmError {
    readonly status: number;
    constructor(message: string, status: number, options?: ErrorOptions);
}
type Method = "GET" | "POST" | "PATCH" | "PUT";
export declare class AzureDevOpsClient {
    readonly baseUrl: string;
    readonly apiVersion: string;
    readonly authenticated: boolean;
    private readonly fetchImpl;
    private readonly authorization;
    /** Organisation root, e.g. https://dev.azure.com/acme (no trailing slash). */
    readonly organizationUrl: string;
    constructor(options: AzureDevOpsClientOptions);
    /** Absolute URL for a path relative to the pull request, with `api-version` appended. */
    url(path: string, query?: Record<string, string>): string;
    /** One JSON request. Throws `AzureDevOpsHttpError` on any non-2xx (or sign-in) response. */
    request<T>(method: Method, path: string, body?: unknown, query?: Record<string, string>): Promise<T>;
    /** Same, for an organisation-level path such as `/_apis/connectionData`. */
    requestOrg<T>(method: Method, path: string, body?: unknown, apiVersion?: string): Promise<T>;
    /**
     * GET a list endpoint and follow `x-ms-continuationtoken` when the server
     * pages the result. Thread lists are not paged today; this guards the day
     * they are.
     */
    list<T>(path: string): Promise<T[]>;
    private send;
    private parse;
}
/** `Basic base64(":" + token)` works for PATs and for System.AccessToken alike. */
export declare function authorizationHeader(token: string, kind: "basic" | "bearer"): string;
export {};
