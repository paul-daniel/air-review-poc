import { describe, expect, it, vi } from "vitest";
import { ADO_VOTE, AzureDevOpsAdapter, voteForVerdict } from "../src/scm/azure-devops.js";
import { findingMarker } from "../src/state/finding-comment.js";
import type { GitRepository } from "../src/context/repository.js";
import type { Finding, ReviewSummary } from "../src/contracts/review.js";

/**
 * air-review as a real Azure DevOps reviewer: no duplicate threads, a vote
 * that follows the verdict, and an optional pull-request status.
 */

interface Recorded {
  method: string;
  url: string;
  body: unknown;
}

function fakeFetch(route: (request: Recorded) => unknown) {
  const calls: Recorded[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request: Recorded = {
      method: init?.method ?? "GET",
      url: String(input),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(request);
    return new Response(JSON.stringify(route(request) ?? {}), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
}

const PR = {
  pullRequestId: 7,
  title: "Returns",
  sourceRefName: "refs/heads/feature/returns",
  targetRefName: "refs/heads/main",
  lastMergeSourceCommit: { commitId: "head-sha" },
  lastMergeTargetCommit: { commitId: "base-sha" },
  repository: { id: "repo-guid", name: "atlas-shop", project: { name: "Shop" } },
};

const finding: Finding = {
  id: "arf_dedup1",
  ruleId: "angular.subscription-lifecycle",
  ruleOrigin: "FRAMEWORK",
  severity: "MAJOR",
  confidence: 0.9,
  scope: "IN_PR",
  category: "correctness",
  title: "Subscription may outlive its component",
  summary: "No teardown path.",
  anchor: { file: "apps/web/src/app/x.component.ts", startLine: 12, endLine: 12 },
  evidence: [],
  fingerprint: "fp",
  status: "OPEN",
};

function summary(
  verdict: ReviewSummary["verdict"],
  gatePassed = verdict !== "request-changes",
): ReviewSummary {
  return {
    pr: { owner: "Shop", repo: "atlas-shop", number: 7 },
    reviewedHeadSha: "head-sha",
    gatePassed,
    verdict,
    counts: { BLOCKER: 0, CRITICAL: 0, MAJOR: verdict === "approve" ? 0 : 1, MINOR: 0, INFO: 0 },
    open: verdict === "approve" ? 0 : 1,
    resolved: 0,
    metrics: {
      inputTokens: 1,
      outputTokens: 1,
      modelCalls: 1,
      contextRequests: 0,
      cacheHits: 0,
      durationMs: 1,
      deterministicFindings: 0,
      llmFindings: 0,
      verifiedFindings: 0,
      incomplete: verdict === "comment",
    },
    warnings: [],
  };
}

function adapter(
  threads: unknown[],
  options: { vote?: boolean; status?: { enabled: boolean; genre: string; name: string } } = {},
) {
  const { calls, fetchImpl } = fakeFetch((request) => {
    if (request.method === "GET" && request.url.endsWith("/pullRequests/7?api-version=7.1")) return PR;
    if (request.method === "GET" && request.url.includes("/threads?")) return { value: threads };
    if (request.method === "GET" && request.url.includes("connectionData")) {
      return { authenticatedUser: { id: "me-guid" } };
    }
    if (request.method === "POST" && request.url.includes("/threads?")) {
      return { id: 900, comments: [{ id: 1 }] };
    }
    return {};
  });
  const scm = new AzureDevOpsAdapter({
    organizationUrl: "https://dev.azure.com/acme",
    project: "Shop",
    repositoryId: "atlas-shop",
    pullRequestId: 7,
    token: "pat",
    git: {} as unknown as GitRepository,
    fetch: fetchImpl,
    ...options,
  });
  return { scm, calls };
}

describe("thread de-duplication", () => {
  it("updates the existing thread carrying the finding marker instead of creating a second one", async () => {
    const existing = {
      id: 42,
      status: "fixed",
      comments: [{ id: 1, content: `${findingMarker(finding.id)}\nold body` }],
      threadContext: { filePath: "/apps/web/src/app/x.component.ts" },
    };
    const { scm, calls } = adapter([existing]);
    await scm.getPullRequest();
    const ref = await scm.createInlineFinding(finding);

    expect(ref).toEqual({ platform: "azure-devops", id: "42:1" });
    expect(calls.filter((c) => c.method === "POST" && c.url.includes("/threads?"))).toHaveLength(0);
    const patch = calls.find((c) => c.method === "PATCH" && c.url.includes("/threads/42/comments/1"));
    expect(patch).toBeDefined();
    expect((patch!.body as { content: string }).content).toContain(findingMarker(finding.id));
    // A resolved thread that gets the finding back is reactivated.
    expect(calls.find((c) => c.method === "PATCH" && c.url.includes("/threads/42?"))?.body).toEqual({
      status: "active",
    });
  });

  it("creates the thread when no marker exists", async () => {
    const { scm, calls } = adapter([]);
    await scm.getPullRequest();
    const ref = await scm.createInlineFinding(finding);
    expect(ref.id).toBe("900:1");
    const post = calls.find((c) => c.method === "POST" && c.url.includes("/threads?"));
    expect(post).toBeDefined();
    expect((post!.body as { threadContext: { filePath: string } }).threadContext.filePath).toBe(
      "/apps/web/src/app/x.component.ts",
    );
  });
});

describe("reviewer vote and status", () => {
  it("maps verdicts to Azure DevOps vote values", () => {
    expect(voteForVerdict("approve")).toBe(ADO_VOTE.approved);
    expect(voteForVerdict("approve-with-suggestions")).toBe(ADO_VOTE.approvedWithSuggestions);
    expect(voteForVerdict("request-changes")).toBe(ADO_VOTE.waitingForAuthor);
    expect(voteForVerdict("comment")).toBe(ADO_VOTE.noVote);
    expect([ADO_VOTE.approved, ADO_VOTE.approvedWithSuggestions, ADO_VOTE.waitingForAuthor]).toEqual([
      10, 5, -5,
    ]);
  });

  it.each([
    ["approve", 10],
    ["approve-with-suggestions", 5],
    ["request-changes", -5],
  ] as const)("casts %s as vote %i for the authenticated identity", async (verdict, vote) => {
    const { scm, calls } = adapter([]);
    await scm.getPullRequest();
    await scm.castVote(summary(verdict));
    const put = calls.find((c) => c.method === "PUT");
    expect(put?.url).toContain("/reviewers/me-guid?api-version=7.1");
    expect(put?.body).toEqual({ vote, id: "me-guid" });
    expect(calls.some((c) => c.url.includes("/statuses"))).toBe(false);
  });

  it("posts a pull-request status for a Status branch policy when enabled", async () => {
    const { scm, calls } = adapter([], { status: { enabled: true, genre: "air-review", name: "gate" } });
    await scm.getPullRequest();
    await scm.castVote(summary("request-changes"));
    const status = calls.find((c) => c.method === "POST" && c.url.includes("/statuses?api-version=7.1"));
    expect(status?.body).toMatchObject({ state: "failed", context: { genre: "air-review", name: "gate" } });
    await scm.castVote(summary("approve"));
    const ok = calls.filter((c) => c.method === "POST" && c.url.includes("/statuses")).at(-1);
    expect(ok?.body).toMatchObject({ state: "succeeded" });
  });

  it("skips the vote when disabled and never votes on an incomplete review", async () => {
    const silent = adapter([], { vote: false });
    await silent.scm.getPullRequest();
    await silent.scm.castVote(summary("approve"));
    expect(silent.calls.some((c) => c.method === "PUT")).toBe(false);

    const incomplete = adapter([]);
    await incomplete.scm.getPullRequest();
    await incomplete.scm.castVote(summary("comment", true));
    expect(incomplete.calls.find((c) => c.method === "PUT")?.body).toEqual({ vote: 0, id: "me-guid" });
  });
});

describe("continuing a finding thread", () => {
  it("replies in the existing thread with the remaining change and reactivates it", async () => {
    const { scm, calls } = adapter([]);
    await scm.getPullRequest();
    await scm.replyToFinding(
      { platform: "azure-devops", id: "42:1" },
      { ...finding, changedSinceLastReview: true, suggestion: "Pipe the stream through takeUntilDestroyed." },
    );
    const reply = calls.find((c) => c.method === "POST" && c.url.includes("/threads/42/comments?"));
    expect(reply).toBeDefined();
    expect(reply!.body).toMatchObject({ parentCommentId: 1, commentType: "text" });
    const content = (reply!.body as { content: string }).content;
    expect(content).toContain("After the latest change");
    expect(content).toContain("**Next step:** Pipe the stream through takeUntilDestroyed.");
    expect(content).not.toContain("air-review:finding:"); // the thread's own marker stays on the first comment
    expect(calls.find((c) => c.method === "PATCH" && c.url.includes("/threads/42?"))?.body).toEqual({
      status: "active",
    });
    expect(calls.filter((c) => c.method === "POST" && c.url.includes("/threads?"))).toHaveLength(0);
  });
});
