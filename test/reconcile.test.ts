import { describe, expect, it } from "vitest";
import { reconcile } from "../src/review/reconcile.js";
import type { Finding } from "../src/contracts/review.js";
import type { CandidateFinding } from "../src/framework/rules.js";
import type { RepositoryDelta } from "../src/contracts/scm.js";

function previous(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "arf_aaaaaa",
    ruleId: "angular.container-presenter",
    ruleOrigin: "REPO_CONVENTION",
    severity: "MAJOR",
    confidence: 0.9,
    scope: "IN_PR",
    title: "t",
    summary: "s",
    anchor: { file: "a.ts", startLine: 4, endLine: 4, symbol: "Widget" },
    evidence: [],
    fingerprint: "sha256:old",
    status: "OPEN",
    ...overrides,
  };
}

function candidate(overrides: Partial<CandidateFinding> = {}): CandidateFinding {
  return {
    ruleId: "angular.container-presenter",
    ruleOrigin: "REPO_CONVENTION",
    severity: "MAJOR",
    confidence: 0.9,
    scope: "IN_PR",
    title: "t",
    summary: "s",
    anchor: { file: "a.ts", startLine: 7, endLine: 7, symbol: "Widget" },
    evidence: [],
    ...overrides,
  };
}

function delta(files: string[]): RepositoryDelta {
  return {
    fromSha: "a",
    toSha: "b",
    diff: "",
    files: files.map((path) => ({ path, status: "modified", addedLines: [7], removedLines: [] })),
  };
}

describe("reconcile", () => {
  it("keeps the finding id and thread ref when lines shift", () => {
    const old = previous({ threadRef: { platform: "github", id: "42" } });
    const result = reconcile([old], [candidate()], delta([]), "sha256:cfg", "head");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.id).toBe("arf_aaaaaa");
    expect(result.findings[0]?.anchor.startLine).toBe(7);
    expect(result.findings[0]?.threadRef?.id).toBe("42");
  });

  it("resolves findings whose changed file no longer emits them", () => {
    const old = previous();
    const changed = delta(["a.ts"]);
    changed.files[0]!.removedLines = [4];
    const result = reconcile([old], [], changed, "sha256:cfg", "head");
    expect(result.findings[0]?.status).toBe("RESOLVED");
    expect(result.events).toContainEqual(
      expect.objectContaining({ event: "resolved", findingId: "arf_aaaaaa" }),
    );
  });

  it("reopens a resolved finding that reappears", () => {
    const old = previous({ status: "RESOLVED" });
    const result = reconcile([old], [candidate()], delta([]), "sha256:cfg", "head");
    expect(result.findings[0]?.status).toBe("REOPENED");
    expect(result.events).toContainEqual(
      expect.objectContaining({ event: "reopened", findingId: "arf_aaaaaa" }),
    );
  });

  it("carries untouched findings forward unchanged", () => {
    const old = previous();
    const result = reconcile([old], [], delta(["other.ts"]), "sha256:cfg", "head");
    expect(result.findings[0]?.status).toBe("OPEN");
    expect(result.findings[0]?.lastCheckedSha).toBe("head");
  });

  it("does not resolve a finding when an unrelated line in the same file changes", () => {
    const result = reconcile([previous()], [], delta(["a.ts"]), "cfg", "head");
    expect(result.findings[0]?.status).toBe("OPEN");
  });
});

describe("reconcile in full re-review mode", () => {
  it("does not shift carried-over anchors when the diff starts at the base", () => {
    const old: Finding = {
      id: "arf_e18efd",
      ruleId: "angular.subscription-lifecycle",
      ruleOrigin: "FRAMEWORK",
      severity: "MAJOR",
      confidence: 0.94,
      scope: "IN_PR",
      title: "Subscription may outlive its component",
      summary: "no teardown",
      anchor: { file: "src/app/widget.component.ts", startLine: 7, endLine: 7, symbol: "Widget#sub1" },
      evidence: [],
      fingerprint: "sha256:old",
      status: "OPEN",
    };
    // A brand-new 9-line file in a base…head diff: every line is "added".
    const fullDelta: RepositoryDelta = {
      fromSha: "base",
      toSha: "head",
      diff: "",
      files: [
        {
          path: "src/app/widget.component.ts",
          status: "added",
          addedLines: [1, 2, 3, 4, 5, 6, 7, 8, 9],
          removedLines: [],
        },
      ],
    };
    // Not re-emitted by a full re-review: resolved, anchor untouched.
    const full = reconcile([old], [], fullDelta, "sha256:cfg", "head", { incremental: false });
    expect(full.findings[0]?.anchor.startLine).toBe(7);
    expect(full.findings[0]?.status).toBe("RESOLVED");
    expect(full.events[0]?.detail).toBe("not reported by the full re-review");

    // Re-emitted by the full re-review: stays open with the same id.
    const again = reconcile([old], [{ ...old, anchor: { ...old.anchor } }], fullDelta, "sha256:cfg", "head", {
      incremental: false,
    });
    expect(again.findings[0]).toMatchObject({ id: "arf_e18efd", status: "OPEN", anchor: { startLine: 7 } });

    // The same delta read incrementally would legitimately shift the anchor.
    const incremental = reconcile([old], [], fullDelta, "sha256:cfg", "head", { incremental: true });
    expect(incremental.findings[0]?.anchor.startLine).toBe(16);
  });
});

describe("model findings with unstable rule names", () => {
  it("keeps the earlier id when a model finding reappears nearby under a different rule name", () => {
    const old: Finding = {
      id: "arf_04e56d",
      ruleId: "discount-percent-calculation",
      ruleOrigin: "HEURISTIC",
      severity: "CRITICAL",
      confidence: 0.9,
      scope: "IN_PR",
      title: "discountedPrice subtracts the raw percent value",
      summary: "s",
      anchor: { file: "src/app/price.ts", startLine: 3, endLine: 3 },
      evidence: [],
      fingerprint: "sha256:old",
      status: "OPEN",
    };
    const renamed: CandidateFinding = {
      ruleId: "discount-percent-misuse",
      ruleOrigin: "HEURISTIC",
      severity: "CRITICAL",
      confidence: 0.85,
      scope: "IN_PR",
      title: "discountedPrice treats percentages as whole numbers",
      summary: "s2",
      anchor: { file: "src/app/price.ts", startLine: 2, endLine: 4 },
      evidence: [],
    };
    const deterministic: CandidateFinding = {
      ...renamed,
      ruleId: "angular.subscription-lifecycle",
      ruleOrigin: "FRAMEWORK",
    };
    const fullDelta: RepositoryDelta = {
      fromSha: "base",
      toSha: "head",
      diff: "",
      files: [{ path: "src/app/price.ts", status: "added", addedLines: [1, 2, 3, 4], removedLines: [] }],
    };
    const isDeterministicRule = (id: string) => id.startsWith("angular.");

    const result = reconcile([old], [renamed], fullDelta, "sha256:cfg", "head", {
      incremental: false,
      isDeterministicRule,
    });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      id: "arf_04e56d",
      status: "OPEN",
      ruleId: "discount-percent-misuse",
      title: renamed.title,
    });
    expect(result.events).toEqual([]);

    // A deterministic rule never inherits a model finding's id, and vice versa.
    const separate = reconcile([old], [deterministic], fullDelta, "sha256:cfg", "head", {
      incremental: false,
      isDeterministicRule,
    });
    expect(separate.findings.map((f) => f.status).sort()).toEqual(["OPEN", "RESOLVED"]);
    expect(separate.findings.find((f) => f.status === "OPEN")?.id).not.toBe("arf_04e56d");
  });
});

describe("proximity match prefers an open finding over a resolved one", () => {
  it("continues the open thread instead of reopening the resolved duplicate", () => {
    const mk = (id: string, status: Finding["status"], ruleId: string): Finding => ({
      id,
      ruleId,
      ruleOrigin: "HEURISTIC",
      severity: "CRITICAL",
      confidence: 0.9,
      scope: "IN_PR",
      title: "t",
      summary: "s",
      anchor: { file: "src/app/price.ts", startLine: 3, endLine: 3 },
      evidence: [],
      fingerprint: "sha256:x",
      status,
    });
    const resolvedFirst = mk("arf_old", "RESOLVED", "discount-a");
    const open = mk("arf_open", "OPEN", "discount-b");
    const candidate: CandidateFinding = {
      ruleId: "discount-c",
      ruleOrigin: "HEURISTIC",
      severity: "CRITICAL",
      confidence: 0.9,
      scope: "IN_PR",
      title: "t3",
      summary: "s3",
      anchor: { file: "src/app/price.ts", startLine: 3, endLine: 3 },
      evidence: [],
    };
    const delta: RepositoryDelta = { fromSha: "b", toSha: "h", diff: "", files: [] };
    const result = reconcile([resolvedFirst, open], [candidate], delta, "sha256:cfg", "h", {
      incremental: false,
      isDeterministicRule: () => false,
    });
    expect(result.findings.find((f) => f.id === "arf_open")?.status).toBe("OPEN");
    expect(result.findings.find((f) => f.id === "arf_old")?.status).toBe("RESOLVED");
    expect(result.events).toEqual([]);
  });
});

describe("reconcile: partial fixes", () => {
  it("flags an open finding whose code the push touched but did not settle", () => {
    const old = previous({ threadRef: { platform: "azure-devops", id: "12:1" } });
    // The author edited line 5, next to the anchored line 4, and the rule still fires.
    const touched: RepositoryDelta = {
      fromSha: "a",
      toSha: "b",
      diff: "",
      files: [{ path: "a.ts", status: "modified", addedLines: [5], removedLines: [5] }],
    };
    const result = reconcile(
      [old],
      [candidate({ anchor: { file: "a.ts", startLine: 4, endLine: 4, symbol: "Widget" } })],
      touched,
      "sha256:cfg",
      "head",
      { incremental: true },
    );
    expect(result.findings[0]).toMatchObject({
      id: "arf_aaaaaa",
      status: "OPEN",
      changedSinceLastReview: true,
    });
    expect(result.events).toContainEqual({
      event: "updated",
      findingId: "arf_aaaaaa",
      detail: "code changed, finding still open",
    });
  });

  it("does not flag a finding when the push changed other parts of the file", () => {
    const old = previous();
    const far: RepositoryDelta = {
      fromSha: "a",
      toSha: "b",
      diff: "",
      files: [{ path: "a.ts", status: "modified", addedLines: [80], removedLines: [] }],
    };
    const result = reconcile(
      [old],
      [candidate({ anchor: { file: "a.ts", startLine: 4, endLine: 4, symbol: "Widget" } })],
      far,
      "sha256:cfg",
      "head",
      { incremental: true },
    );
    expect(result.findings[0]?.changedSinceLastReview).toBeUndefined();
    expect(result.events).toEqual([]);
  });
});

describe("reconcile: reviewer dismissals", () => {
  it("keeps a WONT_FIX finding dismissed when the rule reports it again", () => {
    const old = previous({ status: "WONT_FIX", threadRef: { platform: "azure-devops", id: "9:1" } });
    const result = reconcile([old], [candidate()], delta(["a.ts"]), "sha256:cfg", "head", {
      incremental: true,
    });
    expect(result.findings[0]).toMatchObject({ id: "arf_aaaaaa", status: "WONT_FIX" });
    expect(result.events).toEqual([]);
    expect(result.newOrReopened).toEqual([]);
  });
});
