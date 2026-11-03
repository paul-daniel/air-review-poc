import { describe, expect, it } from "vitest";
import { decideApproval } from "../src/cli/commands/approve.js";
import { defaultConfig } from "../src/config/defaults.js";
import { emptyState } from "../src/contracts/state.js";
import { encodeState } from "../src/state/ledger.js";
import type { Finding } from "../src/contracts/review.js";

function finding(overrides: Partial<Finding>): Finding {
  return {
    id: "arf_000001",
    ruleId: "r",
    ruleOrigin: "HEURISTIC",
    severity: "MAJOR",
    confidence: 0.9,
    scope: "IN_PR",
    title: "t",
    summary: "s",
    anchor: { file: "a.ts", startLine: 1, endLine: 1 },
    evidence: [],
    fingerprint: "fp",
    status: "OPEN",
    ...overrides,
  };
}

function state(findings: Finding[], headSha = "head") {
  const s = emptyState("Shop/atlas", { number: 7, baseSha: "base", headSha }, "cfg", { reviewer: "m" });
  s.findings = findings;
  return encodeState(s);
}

const pr = { owner: "Shop", repo: "atlas", number: 7, headSha: "head" };

describe("air-review approve", () => {
  const config = defaultConfig();

  it("approves when nothing is open", () => {
    const decision = decideApproval(config, state([finding({ status: "RESOLVED" })]), pr);
    expect(decision.action).toBe("approve");
    expect(decision.summary?.verdict).toBe("approve");
  });

  it("approves with suggestions when only nitpicks remain", () => {
    const decision = decideApproval(
      config,
      state([finding({ severity: "NITPICK" }), finding({ id: "arf_000002", severity: "INFO" })]),
      pr,
    );
    expect(decision.action).toBe("approve-with-suggestions");
    expect(decision.reason).toMatch(/2 non-blocking/);
  });

  it("refuses while a MINOR or worse finding is open", () => {
    const decision = decideApproval(config, state([finding({ severity: "MINOR", confidence: 0.8 })]), pr);
    expect(decision.action).toBe("refuse");
    expect(decision.reason).toMatch(/1 blocking/);
  });

  it("never approves a head the review did not examine, nor a pull request without review", () => {
    expect(decideApproval(config, state([], "older"), pr).action).toBe("stale");
    expect(decideApproval(config, null, pr).action).toBe("no-review");
  });
});
