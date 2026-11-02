import { describe, expect, it } from "vitest";
import { encodeState, extractState, updateMarkerBlock } from "../src/state/ledger.js";
import { emptyState } from "../src/contracts/state.js";
import { findingIdFromBody, renderFindingComment } from "../src/state/finding-comment.js";
import { upsertSummaryBody } from "../src/state/summary.js";
import type { Finding } from "../src/contracts/review.js";

describe("PR ledger", () => {
  it("round-trips state through the comment marker envelope", () => {
    const state = emptyState("org/repo", { number: 1, baseSha: "a", headSha: "b" }, "sha256:cfg", {
      reviewer: "m",
      planner: "m",
      verifier: "m",
    });
    state.history.push({ at: "2026-01-01T00:00:00Z", sha: "b", event: "resolved", findingId: "arf_x" });
    const encoded = encodeState(state);
    expect(extractState(encoded)).toEqual(state);
    expect(extractState(`noise ${encoded} noise`)).toEqual(state);
  });

  it("returns null for unreadable or foreign-schema state", () => {
    expect(extractState("no marker")).toBeNull();
    expect(extractState("<!-- air-review:state:v1 --> {broken")).toBeNull();
  });

  it("updates a marker block in place", () => {
    const body = "intro\n<!-- air-review:state:v1 -->\nold\n<!-- /air-review:state:v1 -->\noutro";
    const updated = updateMarkerBlock(
      body,
      "<!-- air-review:state:v1 -->",
      "<!-- /air-review:state:v1 -->",
      "new",
    );
    expect(updated).toBe("intro\n<!-- air-review:state:v1 -->\nnew\n<!-- /air-review:state:v1 -->\noutro");
  });
});

describe("finding comments", () => {
  const finding: Finding = {
    id: "arf_abc123",
    ruleId: "angular.subscription-lifecycle",
    ruleOrigin: "FRAMEWORK",
    severity: "MAJOR",
    confidence: 0.94,
    scope: "IN_PR",
    title: "Subscription may outlive the component lifecycle",
    summary: "The subscription is not torn down with the component.",
    suggestion: "pipe(takeUntilDestroyed())",
    anchor: { file: "a.ts", startLine: 10, endLine: 10, symbol: "Widget" },
    evidence: [{ kind: "convention", label: "3 files use takeUntilDestroyed" }],
    fingerprint: "sha256:x",
    status: "OPEN",
  };

  it("renders a human + machine readable comment", () => {
    const body = renderFindingComment(finding);
    expect(findingIdFromBody(body)).toBe("arf_abc123");
    expect(body).toContain("[MAJOR]");
    expect(body).toContain("air-review-id: arf_abc123");
    expect(body).toContain("takeUntilDestroyed");
  });

  it("does not leak the id from unrelated comments", () => {
    expect(findingIdFromBody("ordinary comment")).toBeNull();
  });

  it("builds a summary block that can be upserted", () => {
    const summary = {
      pr: { owner: "o", repo: "r", number: 1 },
      reviewedHeadSha: "abc",
      gatePassed: true,
      counts: { BLOCKER: 0, CRITICAL: 0, MAJOR: 1, MINOR: 0, INFO: 0 },
      open: 1,
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
    };
    const once = upsertSummaryBody("", summary);
    const twice = upsertSummaryBody(once, {
      ...summary,
      open: 0,
      counts: { BLOCKER: 0, CRITICAL: 0, MAJOR: 0, MINOR: 0, INFO: 0 },
    });
    expect(twice).toContain("No open findings");
    expect(twice.match(/Air Review/g)?.length).toBe(1);
  });
});
