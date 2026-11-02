import { describe, expect, it, vi } from "vitest";
import { GitHubAdapter } from "../src/scm/github.js";
import { STATE_MARKER_OPEN, encodeState } from "../src/state/ledger.js";
import { SUMMARY_MARKER_OPEN } from "../src/state/summary.js";
import { emptyState } from "../src/contracts/state.js";

function adapter(calls: Record<string, ReturnType<typeof vi.fn>>) {
  return new GitHubAdapter({
    owner: "acme",
    repo: "storefront",
    pullNumber: 42,
    token: "test-token",
    octokit: {
      rest: {
        pulls: {
          get: calls.pullsGet,
          createReviewComment: calls.createReviewComment,
          updateReviewComment: calls.updateReviewComment,
        },
        repos: { compareCommits: calls.compareCommits },
        issues: {
          listComments: calls.listComments,
          createComment: calls.createComment,
          updateComment: calls.updateComment,
        },
      },
    } as never,
  });
}

describe("GitHubAdapter", () => {
  it("allows unauthenticated reads but refuses writes without a token", async () => {
    const calls = {
      pullsGet: vi.fn().mockResolvedValue({
        data: {
          number: 42,
          title: "t",
          base: { ref: "main", sha: "b" },
          head: { ref: "feat/x", sha: "h" },
        },
      }),
    } as never;
    const scm = new GitHubAdapter({
      owner: "acme",
      repo: "storefront",
      pullNumber: 42,
      octokit: { rest: { pulls: { get: calls.pullsGet } } } as never,
    });
    await expect(scm.getPullRequest()).resolves.toMatchObject({ number: 42 });
    await expect(
      scm.createInlineFinding({
        id: "arf_abc123",
        ruleId: "r",
        ruleOrigin: "FRAMEWORK",
        severity: "MAJOR",
        confidence: 0.9,
        scope: "IN_PR",
        title: "t",
        summary: "s",
        anchor: { file: "a.ts", startLine: 1, endLine: 1 },
        evidence: [],
        fingerprint: "f",
        status: "OPEN",
      }),
    ).rejects.toThrow(/no GitHub token/i);
  });

  it("maps a GitHub PR to the internal snapshot", async () => {
    const calls = {
      pullsGet: vi.fn().mockResolvedValue({
        data: {
          number: 42,
          title: "Add widget",
          base: { ref: "main", sha: "base-sha" },
          head: { ref: "feat/x", sha: "head-sha", label: "acme:feat/x" },
        },
      }),
    } as never;
    const snapshot = await adapter(calls).getPullRequest();
    expect(snapshot).toMatchObject({
      owner: "acme",
      repo: "storefront",
      number: 42,
      baseSha: "base-sha",
      headSha: "head-sha",
      headRef: "feat/x",
    });
  });

  it("requests the diff media type and parses it", async () => {
    const diff = [
      "diff --git a/a.ts b/a.ts",
      "index 1..2 100644",
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -1,0 +1,1 @@",
      "+new line",
    ].join("\n");
    const calls = {
      compareCommits: vi.fn().mockResolvedValue({ data: diff }),
    } as never;
    const delta = await adapter(calls).getDelta("from", "to");
    expect(calls.compareCommits).toHaveBeenCalledWith({
      owner: "acme",
      repo: "storefront",
      base: "from",
      head: "to",
      mediaType: { format: "diff" },
    });
    expect(delta.files).toHaveLength(1);
    expect(delta.files[0]?.addedLines).toEqual([1]);
  });

  it("finds and updates the state comment, and creates it when missing", async () => {
    const state = emptyState("acme/storefront", { number: 42, baseSha: "b", headSha: "h" }, "cfg", {
      planner: "m",
      reviewer: "m",
      verifier: "m",
    });

    const listWithState = vi.fn().mockResolvedValue({
      data: [{ id: 7, body: `prefix ${encodeState(state)} suffix` }],
    });
    const update = vi.fn().mockResolvedValue({});
    const updateAdapter = adapter({
      listComments: listWithState,
      updateComment: update,
    } as never);
    const found = await updateAdapter.listState();
    expect(found).toContain(STATE_MARKER_OPEN);
    await updateAdapter.writeState(encodeState(state));
    expect(update).toHaveBeenCalledWith({
      owner: "acme",
      repo: "storefront",
      comment_id: 7,
      body: expect.stringContaining(STATE_MARKER_OPEN),
    });

    const create = vi.fn().mockResolvedValue({});
    const createAdapter = adapter({
      listComments: vi.fn().mockResolvedValue({ data: [] }),
      createComment: create,
    } as never);
    expect(await createAdapter.listState()).toBeNull();
    await createAdapter.writeState(encodeState(state));
    expect(create).toHaveBeenCalledWith({
      owner: "acme",
      repo: "storefront",
      issue_number: 42,
      body: expect.stringContaining(STATE_MARKER_OPEN),
    });
  });

  it("publishes inline findings against the PR head", async () => {
    const calls = {
      pullsGet: vi.fn().mockResolvedValue({
        data: {
          number: 42,
          title: "t",
          base: { ref: "main", sha: "b" },
          head: { ref: "feat/x", sha: "h" },
        },
      }),
      createReviewComment: vi.fn().mockResolvedValue({ data: { id: 99 } }),
    } as never;
    const scm = adapter(calls);
    await scm.getPullRequest();
    const ref = await scm.createInlineFinding({
      id: "arf_abc123",
      ruleId: "r",
      ruleOrigin: "FRAMEWORK",
      severity: "MAJOR",
      confidence: 0.9,
      scope: "IN_PR",
      title: "t",
      summary: "s",
      anchor: { file: "a.ts", startLine: 3, endLine: 3 },
      evidence: [],
      fingerprint: "f",
      status: "OPEN",
    });
    expect(ref).toEqual({ platform: "github", id: "99" });
    expect(calls.createReviewComment).toHaveBeenCalledWith(
      expect.objectContaining({
        commit_id: "h",
        path: "a.ts",
        line: 3,
        side: "RIGHT",
        body: expect.stringContaining("air-review-id: arf_abc123"),
      }),
    );
  });

  it("upserts the summary comment in place", async () => {
    const update = vi.fn().mockResolvedValue({});
    const scm = adapter({
      listComments: vi.fn().mockResolvedValue({
        data: [{ id: 3, body: `old ${SUMMARY_MARKER_OPEN}\nold-content\n<!-- /air-review:summary:v1 -->` }],
      }),
      updateComment: update,
    } as never);
    await scm.upsertSummary({
      pr: { owner: "acme", repo: "storefront", number: 42 },
      reviewedHeadSha: "h",
      gatePassed: true,
      counts: { BLOCKER: 0, CRITICAL: 0, MAJOR: 0, MINOR: 0, INFO: 0 },
      open: 0,
      resolved: 0,
      metrics: {
        inputTokens: 0,
        outputTokens: 0,
        modelCalls: 0,
        contextRequests: 0,
        cacheHits: 0,
        durationMs: 0,
        deterministicFindings: 0,
        llmFindings: 0,
        verifiedFindings: 0,
      },
      warnings: [],
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        comment_id: 3,
        body: expect.stringContaining("Air Review"),
      }),
    );
  });
});

describe("GitHubAdapter interaction findings", () => {
  it("publishes a finding on unchanged code as a general PR comment and updates it through the issues API", async () => {
    const calls = {
      pullsGet: vi.fn().mockResolvedValue({
        data: { number: 42, title: "t", base: { ref: "main", sha: "b" }, head: { ref: "feat/x", sha: "h" } },
      }),
      createReviewComment: vi.fn(),
      createComment: vi.fn().mockResolvedValue({ data: { id: 777 } }),
      updateComment: vi.fn().mockResolvedValue({}),
      updateReviewComment: vi.fn(),
    } as never;
    const scm = adapter(calls);
    await scm.getPullRequest();
    const finding = {
      id: "arf_fol1ow",
      ruleId: "ripple-radius",
      ruleOrigin: "HEURISTIC" as const,
      severity: "MINOR" as const,
      confidence: 0.7,
      scope: "FOLLOW_UP" as const,
      title: "Ripple radius ignores custom thumb width",
      summary: "s",
      anchor: { file: "slider.ts", startLine: 120, endLine: 120, inDiff: false },
      evidence: [],
      fingerprint: "f",
      status: "OPEN" as const,
    };
    const ref = await scm.createInlineFinding(finding);
    expect(ref).toEqual({ platform: "github", id: "issue:777" });
    expect(calls.createReviewComment).not.toHaveBeenCalled();
    expect(calls.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        issue_number: 42,
        body: expect.stringContaining("air-review-id: arf_fol1ow"),
      }),
    );
    await scm.updateFinding(ref, { ...finding, summary: "updated" });
    await scm.resolveFinding(ref);
    expect(calls.updateComment).toHaveBeenCalledTimes(2);
    expect(calls.updateComment).toHaveBeenLastCalledWith(
      expect.objectContaining({ comment_id: 777, body: expect.stringContaining("Resolved") }),
    );
    expect(calls.updateReviewComment).not.toHaveBeenCalled();
  });

  it("falls back to a general PR comment when GitHub rejects the diff anchor with 422", async () => {
    const calls = {
      pullsGet: vi.fn().mockResolvedValue({
        data: { number: 42, title: "t", base: { ref: "main", sha: "b" }, head: { ref: "feat/x", sha: "h" } },
      }),
      createReviewComment: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error("line must be part of the diff"), { status: 422 })),
      createComment: vi.fn().mockResolvedValue({ data: { id: 778 } }),
    } as never;
    const scm = adapter(calls);
    await scm.getPullRequest();
    const ref = await scm.createInlineFinding({
      id: "arf_abc123",
      ruleId: "r",
      ruleOrigin: "FRAMEWORK",
      severity: "MAJOR",
      confidence: 0.9,
      scope: "IN_PR",
      title: "t",
      summary: "s",
      anchor: { file: "a.ts", startLine: 3, endLine: 3 },
      evidence: [],
      fingerprint: "f",
      status: "OPEN",
    });
    expect(ref.id).toBe("issue:778");
  });
});
