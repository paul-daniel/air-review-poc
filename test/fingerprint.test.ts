import { describe, expect, it } from "vitest";
import { findingFingerprint, findingId } from "../src/review/fingerprint.js";

describe("finding identity", () => {
  it("is stable when lines shift but the symbol stays the same", () => {
    const before = findingId({ ruleId: "angular.container-presenter", file: "a.ts", symbol: "Widget" });
    const after = findingId({ ruleId: "angular.container-presenter", file: "a.ts", symbol: "Widget" });
    expect(before).toBe(after);
    expect(before).toMatch(/^arf_[0-9a-f]{6}$/);
  });

  it("distinguishes findings by rule, file and symbol", () => {
    const a = findingId({ ruleId: "r", file: "a.ts", symbol: "X" });
    const b = findingId({ ruleId: "r", file: "a.ts", symbol: "Y" });
    const c = findingId({ ruleId: "r2", file: "a.ts", symbol: "X" });
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it("includes the effective configuration in the fingerprint", () => {
    const finding = {
      ruleId: "r",
      anchor: { file: "a.ts", startLine: 1, endLine: 1, symbol: "X" },
      severity: "MAJOR" as const,
      scope: "IN_PR" as const,
    };
    const f1 = findingFingerprint(finding, "sha256:aaa");
    const f2 = findingFingerprint(finding, "sha256:bbb");
    expect(f1).not.toBe(f2);
  });
});
