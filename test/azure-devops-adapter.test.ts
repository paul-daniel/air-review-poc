import { describe, expect, it, vi } from "vitest";
import { AzureDevOpsAdapter, parseThreadRef } from "../src/scm/azure-devops.js";
import { AzureDevOpsHttpError, authorizationHeader } from "../src/scm/azure-devops-http.js";
import { ScmError } from "../src/errors.js";
import { STATE_MARKER_OPEN, encodeState } from "../src/state/ledger.js";
import { SUMMARY_MARKER_OPEN } from "../src/state/summary.js";
import { findingMarker } from "../src/state/finding-comment.js";
import { emptyState } from "../src/contracts/state.js";
import type { GitRepository } from "../src/context/repository.js";
import type { Finding, ReviewSummary } from "../src/contracts/review.js";

interface Recorded {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

interface Reply {
  status?: number;
  json?: unknown;
  text?: string;
  headers?: Record<string, string>;
}

/** A fetch double that records every request and answers from a routing function. */
function fakeFetch(route: (request: Recorded) => Reply | undefined) {
  const calls: Recorded[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request: Recorded = {
      method: init?.method ?? "GET",
      url: String(input),
      headers: { ...((init?.headers ?? {}) as Record<string, string>) },
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(request);
    const reply = route(request) ?? { json: {} };
    return new Response(reply.text ?? JSON.stringify(reply.json ?? {}), {
      status: reply.status ?? 200,
      headers: { "content-type": "application/json", ...(reply.headers ?? {}) },
    });
  });
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
}

const PR = {
  pullRequestId: 483,
  title: "Add widget",
  sourceRefName: "refs/heads/feature/widget",
  targetRefName: "refs/heads/main",
  lastMergeSourceCommit: { commitId: "head-sha" },
  lastMergeTargetCommit: { commitId: "base-sha" },
  repository: { id: "3411ebc1-d5aa-464f-9615-0b527bc66719", name: "storefront", project: { name: "Shop" } },
};

const BASE = "https://dev.azure.com/acme/Shop/_apis/git/repositories/storefront/pullRequests/483";

const DIFF = [
  "diff --git a/src/a.ts b/src/a.ts",
  "index 1..2 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1,0 +1,1 @@",
  "+new line",
].join("\n");

function fakeGit(
  overrides: Partial<Record<"mergeBase" | "diff", ReturnType<typeof vi.fn>>> = {},
): GitRepository {
  return {
    mergeBase: overrides.mergeBase ?? vi.fn().mockResolvedValue("merge-base-sha"),
    diff: overrides.diff ?? vi.fn().mockResolvedValue(DIFF),
  } as unknown as GitRepository;
}

function adapter(
  route: (request: Recorded) => Reply | undefined,
  options: { token?: string | null; tokenKind?: "basic" | "bearer"; git?: GitRepository } = {},
) {
  const { calls, fetchImpl } = fakeFetch(route);
  const scm = new AzureDevOpsAdapter({
    organizationUrl: "https://dev.azure.com/acme/",
    project: "Shop",
    repositoryId: "storefront",
    pullRequestId: 483,
    ...(options.token === null ? {} : { token: options.token ?? "pat-123" }),
    tokenKind: options.tokenKind,
    git: options.git ?? fakeGit(),
    fetch: fetchImpl,
  });
  return { scm, calls };
}

const finding: Finding = {
  id: "arf_abc123",
  ruleId: "angular/subscription-leak",
  ruleOrigin: "FRAMEWORK",
  severity: "MAJOR",
  confidence: 0.9,
  scope: "IN_PR",
  title: "Subscription is never torn down",
  summary: "The subscription created in ngOnInit is not released.",
  anchor: { file: "src/app/widget.component.ts", startLine: 12, endLine: 15, symbol: "WidgetComponent" },
  evidence: [],
  fingerprint: "fp",
  status: "OPEN",
};

function summaryOf(gatePassed: boolean): ReviewSummary {
  return {
    pr: { owner: "Shop", repo: "storefront", number: 483 },
    reviewedHeadSha: "head-sha",
    gatePassed,
    verdict: gatePassed ? "approve" : "request-changes",
    counts: { BLOCKER: 0, CRITICAL: gatePassed ? 0 : 1, MAJOR: 0, MINOR: 0, INFO: 0 },
    open: gatePassed ? 0 : 1,
    resolved: 0,
    metrics: {
      inputTokens: 10,
      outputTokens: 5,
      modelCalls: 2,
      contextRequests: 1,
      cacheHits: 0,
      durationMs: 1200,
      deterministicFindings: 0,
      llmFindings: 1,
      verifiedFindings: 1,
    },
    warnings: [],
  };
}

const prRoute = (request: Recorded): Reply | undefined =>
  request.method === "GET" && request.url === `${BASE}?api-version=7.1` ? { json: PR } : undefined;

describe("AzureDevOpsAdapter", () => {
  it("maps a pull request to the internal snapshot", async () => {
    const { scm, calls } = adapter(prRoute);
    const snapshot = await scm.getPullRequest();
    expect(snapshot).toEqual({
      owner: "Shop",
      repo: "storefront",
      number: 483,
      title: "Add widget",
      baseRef: "main",
      headRef: "feature/widget",
      baseSha: "base-sha",
      headSha: "head-sha",
    });
    expect(calls[0]?.url).toBe(`${BASE}?api-version=7.1`);
  });

  it("authenticates with Basic base64(':' + token), or Bearer when asked", async () => {
    const basic = adapter(prRoute);
    await basic.scm.getPullRequest();
    expect(basic.calls[0]?.headers.Authorization).toBe(`Basic ${Buffer.from(":pat-123").toString("base64")}`);
    expect(authorizationHeader("pat-123", "basic")).toBe(
      `Basic ${Buffer.from(":pat-123").toString("base64")}`,
    );

    const bearer = adapter(prRoute, { token: "eyJ-token", tokenKind: "bearer" });
    await bearer.scm.getPullRequest();
    expect(bearer.calls[0]?.headers.Authorization).toBe("Bearer eyJ-token");
  });

  it("refuses to call the API without a token", async () => {
    const { scm, calls } = adapter(prRoute, { token: null });
    expect(scm.authenticated).toBe(false);
    await expect(scm.getPullRequest()).rejects.toThrow(/no token available/i);
    expect(calls).toHaveLength(0);
  });

  it("computes the delta locally from the merge base", async () => {
    const mergeBase = vi.fn().mockResolvedValue("merge-base-sha");
    const diff = vi.fn().mockResolvedValue(DIFF);
    const { scm, calls } = adapter(prRoute, { git: fakeGit({ mergeBase, diff }) });
    const delta = await scm.getDelta("base-sha", "head-sha");
    expect(mergeBase).toHaveBeenCalledWith("base-sha", "head-sha");
    expect(diff).toHaveBeenCalledWith("merge-base-sha", "head-sha");
    expect(delta.fromSha).toBe("merge-base-sha");
    expect(delta.files.map((f) => f.path)).toEqual(["src/a.ts"]);
    expect(delta.files[0]?.addedLines).toEqual([1]);
    expect(calls, "the diff never hits the REST API").toHaveLength(0);
  });

  it("explains shallow clones when the merge base cannot be computed", async () => {
    const mergeBase = vi
      .fn()
      .mockRejectedValue(new ScmError("git merge-base failed: fatal: Not a valid commit"));
    const { scm } = adapter(prRoute, { git: fakeGit({ mergeBase }) });
    const error = await scm.getDelta("base-sha", "head-sha").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ScmError);
    expect((error as Error).message).toMatch(/fetchDepth: 0/);
  });

  it("publishes a finding as an inline thread on the right side of the file", async () => {
    const { scm, calls } = adapter((request) => {
      if (request.method === "POST" && request.url === `${BASE}/threads?api-version=7.1`) {
        return { json: { id: 148, status: "active", comments: [{ id: 1, parentCommentId: 0 }] } };
      }
      return prRoute(request);
    });
    await scm.getPullRequest();
    const ref = await scm.createInlineFinding(finding);
    expect(ref).toEqual({ platform: "azure-devops", id: "148:1" });

    const create = calls.find((c) => c.method === "POST")!;
    const body = create.body as {
      status: string;
      threadContext: unknown;
      comments: Array<{ content: string; parentCommentId: number; commentType: string }>;
    };
    expect(body.status).toBe("active");
    expect(body.threadContext).toEqual({
      filePath: "/src/app/widget.component.ts",
      rightFileStart: { line: 12, offset: 1 },
      rightFileEnd: { line: 15, offset: 1 },
    });
    expect(body.comments).toHaveLength(1);
    expect(body.comments[0]).toMatchObject({ parentCommentId: 0, commentType: "text" });
    expect(body.comments[0]?.content).toContain(findingMarker("arf_abc123"));
    expect(body.comments[0]?.content).toContain("MAJOR · Correctness — Subscription is never torn down");
    expect(create.headers["Content-Type"]).toBe("application/json");
  });

  it("updates a finding's first comment in place", async () => {
    const { scm, calls } = adapter(() => ({ json: {} }));
    await scm.updateFinding({ platform: "azure-devops", id: "148:1" }, { ...finding, severity: "CRITICAL" });
    expect(calls[0]).toMatchObject({
      method: "PATCH",
      url: `${BASE}/threads/148/comments/1?api-version=7.1`,
    });
    expect((calls[0]?.body as { content: string }).content).toContain("CRITICAL ·");
  });

  it("creates the state thread closed, then updates the comment in place", async () => {
    const state = emptyState("Shop/storefront", { number: 483, baseSha: "b", headSha: "h" }, "cfg", {
      planner: "m",
      reviewer: "m",
      verifier: "m",
    });
    const body = encodeState(state);

    const fresh = adapter((request) => {
      if (request.method === "GET" && request.url.includes("/threads?")) {
        return { json: { value: [], count: 0 } };
      }
      if (request.method === "POST") return { json: { id: 7, comments: [{ id: 3 }] } };
      return undefined;
    });
    expect(await fresh.scm.listState()).toBeNull();
    await fresh.scm.writeState(body);
    const create = fresh.calls.find((c) => c.method === "POST")!;
    expect(create.url).toBe(`${BASE}/threads?api-version=7.1`);
    expect(create.body).toEqual({
      comments: [{ parentCommentId: 0, content: body, commentType: "text" }],
      status: "closed",
    });

    const existing = adapter((request) => {
      if (request.method === "GET" && request.url.includes("/threads?")) {
        return {
          json: {
            value: [
              { id: 2, status: "active", comments: [{ id: 1, content: "Looks good!" }] },
              { id: 7, status: "closed", comments: [{ id: 3, content: body }] },
            ],
            count: 2,
          },
        };
      }
      return undefined;
    });
    expect(await existing.scm.listState()).toContain(STATE_MARKER_OPEN);
    await existing.scm.writeState(body.replace('"findings": []', '"findings": []'));
    const update = existing.calls.find((c) => c.method === "PATCH")!;
    expect(update.url).toBe(`${BASE}/threads/7/comments/3?api-version=7.1`);
    expect(update.body).toEqual({ content: expect.stringContaining(STATE_MARKER_OPEN) });
    expect(existing.calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("upserts the summary thread and tracks the gate with the thread status", async () => {
    const fresh = adapter((request) => {
      if (request.method === "GET" && request.url.includes("/threads?")) return { json: { value: [] } };
      if (request.method === "POST") return { json: { id: 9, comments: [{ id: 1 }] } };
      return undefined;
    });
    await fresh.scm.upsertSummary(summaryOf(false));
    const create = fresh.calls.find((c) => c.method === "POST")!;
    expect(create.body).toMatchObject({ status: "active" });
    expect((create.body as { comments: Array<{ content: string }> }).comments[0]?.content).toContain(
      SUMMARY_MARKER_OPEN,
    );
    expect((create.body as { comments: Array<{ content: string }> }).comments[0]?.content).toContain(
      "Changes requested",
    );

    const previous = `${SUMMARY_MARKER_OPEN}\nold\n<!-- /air-review:summary:v1 -->`;
    const existing = adapter((request) => {
      if (request.method === "GET" && request.url.includes("/threads?")) {
        return { json: { value: [{ id: 9, status: "active", comments: [{ id: 1, content: previous }] }] } };
      }
      return undefined;
    });
    await existing.scm.upsertSummary(summaryOf(true));
    const patches = existing.calls.filter((c) => c.method === "PATCH");
    expect(patches.map((c) => c.url)).toEqual([
      `${BASE}/threads/9/comments/1?api-version=7.1`,
      `${BASE}/threads/9?api-version=7.1`,
    ]);
    expect((patches[0]?.body as { content: string }).content).toContain("Approved");
    expect((patches[0]?.body as { content: string }).content).not.toContain("\nold\n");
    expect(patches[1]?.body).toEqual({ status: "closed" });
  });

  it("resolves a finding by replying and marking the thread fixed", async () => {
    const { scm, calls } = adapter((request) => (request.method === "GET" ? prRoute(request) : { json: {} }));
    await scm.getPullRequest();
    await scm.resolveFinding({ platform: "azure-devops", id: "148:1" });
    const writes = calls.filter((c) => c.method !== "GET");
    expect(writes[0]).toMatchObject({
      method: "POST",
      url: `${BASE}/threads/148/comments?api-version=7.1`,
      body: { parentCommentId: 1, commentType: "text", content: expect.stringContaining("head-sha") },
    });
    expect(writes[1]).toMatchObject({
      method: "PATCH",
      url: `${BASE}/threads/148?api-version=7.1`,
      body: { status: "fixed" },
    });
  });

  it("maps 401 to an ScmError carrying the status, the server message and the permission hint", async () => {
    const { scm } = adapter(() => ({
      status: 401,
      json: { message: "TF400813: The user is not authorized to access this resource." },
    }));
    const error = (await scm.getPullRequest().catch((e: unknown) => e)) as ScmError & { cause?: unknown };
    expect(error).toBeInstanceOf(ScmError);
    expect(error.message).toContain("TF400813");
    expect(error.message).toMatch(/Contribute to pull requests/);
    expect(error.message).toMatch(/System\.AccessToken/);
    expect(error.cause).toBeInstanceOf(AzureDevOpsHttpError);
    expect((error.cause as AzureDevOpsHttpError).status).toBe(401);
  });

  it("treats the HTML sign-in page (203) as an authentication failure", async () => {
    const { scm } = adapter(() => ({
      status: 203,
      text: "<!DOCTYPE html><html><body>Sign in</body></html>",
    }));
    await expect(scm.listState()).rejects.toThrow(/Contribute to pull requests/);
  });

  it("surfaces other HTTP failures with status and message", async () => {
    const { scm } = adapter(() => ({
      status: 404,
      json: { message: "TF401019: The Git repository does not exist." },
    }));
    await expect(scm.getPullRequest()).rejects.toThrow(/404.*TF401019/);
  });

  it("follows x-ms-continuationtoken when the thread list is paged", async () => {
    const stateBody = `${STATE_MARKER_OPEN}\n{}\n<!-- /air-review:state:v1 -->`;
    const { scm, calls } = adapter((request) => {
      if (request.method !== "GET") return undefined;
      if (request.url.includes("continuationToken=page-2")) {
        return { json: { value: [{ id: 50, comments: [{ id: 1, content: stateBody }] }] } };
      }
      return {
        json: { value: [{ id: 1, comments: [{ id: 1, content: "first page" }] }] },
        headers: { "x-ms-continuationtoken": "page-2" },
      };
    });
    expect(await scm.listState()).toBe(stateBody);
    expect(calls.map((c) => c.url)).toEqual([
      `${BASE}/threads?api-version=7.1`,
      `${BASE}/threads?continuationToken=page-2&api-version=7.1`,
    ]);
  });

  it("parses thread references and rejects malformed ones", () => {
    expect(parseThreadRef({ platform: "azure-devops", id: "148:2" })).toEqual({
      threadId: 148,
      commentId: 2,
    });
    expect(parseThreadRef({ platform: "azure-devops", id: "148" })).toEqual({ threadId: 148, commentId: 1 });
    expect(() => parseThreadRef({ platform: "azure-devops", id: "abc" })).toThrow(ScmError);
  });
});

describe("AzureDevOpsAdapter with threads authored by another identity", () => {
  const authorRefusal = {
    status: 403,
    json: {
      message: "Cannot update comment '1'. Only the comment author and project admins can edit a comment.",
    },
  };

  it("replaces a state thread it cannot edit and reads the newest state thread back", async () => {
    const stateBody = encodeState(
      emptyState("Shop/storefront", { number: 483, baseSha: "b", headSha: "h" }, "cfg", {}),
    );
    const { scm, calls } = adapter((request) => {
      if (request.url.endsWith("/threads?api-version=7.1") && request.method === "GET") {
        return {
          json: {
            value: [
              {
                id: 2,
                status: "closed",
                comments: [
                  { id: 1, content: `${STATE_MARKER_OPEN}\n{"old":true}\n<!-- /air-review:state:v1 -->` },
                ],
              },
              { id: 7, status: "closed", comments: [{ id: 1, content: stateBody }] },
            ],
          },
        };
      }
      if (request.method === "PATCH" && request.url.includes("/threads/7/comments/1")) return authorRefusal;
      if (request.method === "POST" && request.url.endsWith("/threads?api-version=7.1")) {
        return { json: { id: 9, comments: [{ id: 1, content: request.body.comments[0].content }] } };
      }
      return undefined;
    });
    // The newest marker thread (id 7) wins over the older one (id 2).
    expect(await scm.listState()).toBe(stateBody);
    await scm.writeState(stateBody.replace('"h"', '"h2"'));
    const created = calls.find((c) => c.method === "POST" && c.url.endsWith("/threads?api-version=7.1"));
    expect(created?.body).toMatchObject({ status: "closed" });
    expect(calls.some((c) => c.method === "PATCH" && c.url.includes("/threads/7?api-version"))).toBe(true);
  });

  it("appends a reply when it cannot edit a finding comment", async () => {
    const { scm, calls } = adapter((request) => {
      if (request.method === "PATCH" && request.url.includes("/threads/12/comments/1")) return authorRefusal;
      if (request.method === "POST" && request.url.includes("/threads/12/comments")) {
        return { json: { id: 3 } };
      }
      return undefined;
    });
    await scm.updateFinding({ platform: "azure-devops", id: "12:1" }, { ...finding, summary: "updated" });
    const reply = calls.find((c) => c.method === "POST" && c.url.includes("/threads/12/comments"));
    expect(reply?.body).toMatchObject({ parentCommentId: 1, commentType: "text" });
    expect(String((reply?.body as { content: string }).content)).toContain("updated");
  });

  it("still fails loudly on a 403 that is not about authorship", async () => {
    const { scm } = adapter((request) => {
      if (request.method === "PATCH") {
        return {
          status: 403,
          json: { message: "TF401027: You need the Git 'PullRequestContribute' permission" },
        };
      }
      return undefined;
    });
    await expect(scm.updateFinding({ platform: "azure-devops", id: "12:1" }, finding)).rejects.toBeInstanceOf(
      ScmError,
    );
  });
});
