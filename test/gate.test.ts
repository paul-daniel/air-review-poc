import { describe, expect, it } from "vitest";
import { evaluateGate } from "../src/review/gate.js";
import { defaultConfig } from "../src/config/defaults.js";
import type { Finding } from "../src/contracts/review.js";

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "arf_test01",
    ruleId: "r",
    ruleOrigin: "FRAMEWORK",
    severity: "CRITICAL",
    confidence: 0.95,
    scope: "IN_PR",
    title: "t",
    summary: "s",
    anchor: { file: "a.ts", startLine: 1, endLine: 1 },
    evidence: [],
    fingerprint: "sha256:x",
    status: "OPEN",
    ...overrides,
  };
}

describe("evaluateGate", () => {
  it("blocks only gated severities above the confidence threshold", () => {
    const config = defaultConfig();
    const findings = [
      finding(),
      finding({ id: "arf_test02", confidence: 0.5 }),
      finding({ id: "arf_test03", severity: "MAJOR" }),
      finding({ id: "arf_test04", status: "RESOLVED" }),
    ];
    const result = evaluateGate(config, findings);
    expect(result.passed).toBe(false);
    expect(result.blocking.map((f) => f.id)).toEqual(["arf_test01"]);
  });
});

describe("evaluateGate scope", () => {
  it("never blocks on FOLLOW_UP or REPO_WIDE findings, however severe", () => {
    const config = defaultConfig();
    const result = evaluateGate(config, [
      finding({
        id: "arf_test05",
        scope: "FOLLOW_UP",
        anchor: { file: "a.ts", startLine: 1, endLine: 1, inDiff: false },
      }),
      finding({ id: "arf_test06", scope: "REPO_WIDE" }),
    ]);
    expect(result.passed).toBe(true);
    expect(result.blocking).toEqual([]);
  });
});
