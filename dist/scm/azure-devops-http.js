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
/** What to do about 401/403 (and the HTML sign-in page Azure DevOps returns as 203). */
export const AZURE_AUTH_HINT = "Grant the build service identity 'Contribute to pull requests' on the repository " +
    "(Project settings → Repositories → Security), keep `persistCredentials: true` on the checkout step, " +
    "and pass the job token: `env: SYSTEM_ACCESSTOKEN: $(System.AccessToken)`. " +
    "For manual runs set a PAT with Code (Read & Write) scope in SYSTEM_ACCESSTOKEN or AZURE_DEVOPS_EXT_PAT.";
/** An HTTP-level failure from Azure DevOps, with the status and the server's own message. */
export class AzureDevOpsHttpError extends ScmError {
    status;
    constructor(message, status, options) {
        super(message, options);
        this.status = status;
    }
}
/** Hard stop for continuation loops so a misbehaving server cannot spin forever. */
const MAX_PAGES = 200;
export class AzureDevOpsClient {
    baseUrl;
    apiVersion;
    authenticated;
    fetchImpl;
    authorization;
    /** Organisation root, e.g. https://dev.azure.com/acme (no trailing slash). */
    organizationUrl;
    constructor(options) {
        const org = options.organizationUrl.replace(/\/+$/, "");
        this.organizationUrl = org;
        this.baseUrl =
            `${org}/${encodeURIComponent(options.project)}/_apis/git/repositories/` +
                `${encodeURIComponent(options.repositoryId)}/pullRequests/${options.pullRequestId}`;
        this.apiVersion = options.apiVersion ?? "7.1";
        this.fetchImpl = options.fetch ?? globalThis.fetch;
        this.authenticated = Boolean(options.token);
        this.authorization = options.token
            ? authorizationHeader(options.token, options.tokenKind ?? "basic")
            : null;
    }
    /** Absolute URL for a path relative to the pull request, with `api-version` appended. */
    url(path, query = {}) {
        const params = new URLSearchParams({ ...query, "api-version": this.apiVersion });
        return `${this.baseUrl}${path}?${params.toString()}`;
    }
    /** One JSON request. Throws `AzureDevOpsHttpError` on any non-2xx (or sign-in) response. */
    async request(method, path, body, query) {
        const response = await this.send(method, this.url(path, query), body);
        return (await this.parse(response, method, path));
    }
    /** Same, for an organisation-level path such as `/_apis/connectionData`. */
    async requestOrg(method, path, body, apiVersion = this.apiVersion) {
        const params = new URLSearchParams({ "api-version": apiVersion });
        const response = await this.send(method, `${this.organizationUrl}${path}?${params.toString()}`, body);
        return (await this.parse(response, method, path));
    }
    /**
     * GET a list endpoint and follow `x-ms-continuationtoken` when the server
     * pages the result. Thread lists are not paged today; this guards the day
     * they are.
     */
    async list(path) {
        const items = [];
        let continuation;
        for (let page = 0; page < MAX_PAGES; page += 1) {
            const query = continuation ? { continuationToken: continuation } : {};
            const response = await this.send("GET", this.url(path, query), undefined);
            const envelope = (await this.parse(response, "GET", path)) ?? {};
            items.push(...(envelope.value ?? []));
            const next = response.headers.get("x-ms-continuationtoken") ?? undefined;
            if (!next || next === continuation)
                return items;
            continuation = next;
        }
        throw new ScmError(`Azure DevOps GET ${path} did not stop paginating after ${MAX_PAGES} pages.`);
    }
    async send(method, url, body) {
        if (!this.authorization) {
            throw new ScmError(`Cannot call Azure DevOps (${method} ${url}): no token available. ` +
                `Set SYSTEM_ACCESSTOKEN (or the configured platform.azureDevops.tokenEnv), ` +
                `AZURE_DEVOPS_EXT_PAT or AZURE_DEVOPS_TOKEN, or pass --ci local for a local review.`);
        }
        const headers = {
            Authorization: this.authorization,
            Accept: "application/json",
        };
        if (body !== undefined)
            headers["Content-Type"] = "application/json";
        try {
            return await this.fetchImpl(url, {
                method,
                headers,
                ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
            });
        }
        catch (error) {
            throw new ScmError(`Azure DevOps request failed: ${method} ${url}: ${error.message}`, {
                cause: error,
            });
        }
    }
    async parse(response, method, path) {
        const text = await response.text();
        // Azure DevOps answers a rejected token with "203 Non-Authoritative Information"
        // and an HTML sign-in page instead of a 401. Treat both the same way.
        const signInPage = response.status === 203 || /^\s*<!DOCTYPE html|^\s*<html/i.test(text);
        if (response.status === 401 || response.status === 403 || signInPage) {
            throw new AzureDevOpsHttpError(`Azure DevOps ${method} ${path} was refused (${response.status}): ${serverMessage(text) || "not authorized"}. ` +
                AZURE_AUTH_HINT, response.status);
        }
        if (!response.ok) {
            throw new AzureDevOpsHttpError(`Azure DevOps ${method} ${path} returned ${response.status}: ${serverMessage(text) || response.statusText || "no details"}`, response.status);
        }
        if (!text.trim())
            return undefined;
        try {
            return JSON.parse(text);
        }
        catch (error) {
            throw new ScmError(`Azure DevOps ${method} ${path} returned a non-JSON body.`, { cause: error });
        }
    }
}
/** `Basic base64(":" + token)` works for PATs and for System.AccessToken alike. */
export function authorizationHeader(token, kind) {
    if (kind === "bearer")
        return `Bearer ${token}`;
    return `Basic ${Buffer.from(`:${token}`, "utf8").toString("base64")}`;
}
/** Azure DevOps error bodies look like `{ "message": "...", "typeKey": "...", ... }`. */
function serverMessage(text) {
    if (!text)
        return "";
    try {
        const parsed = JSON.parse(text);
        if (typeof parsed.message === "string")
            return parsed.message;
    }
    catch {
        /* not JSON */
    }
    const plain = text
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    return plain.length > 300 ? `${plain.slice(0, 300)}…` : plain;
}
//# sourceMappingURL=azure-devops-http.js.map