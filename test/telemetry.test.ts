import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appendRunLog, estimateCost, formatCost } from "../src/telemetry/run-log.js";
import type { RoleUsageMap } from "../src/contracts/review.js";

function roleUsage(overrides: Partial<RoleUsageMap> = {}): RoleUsageMap {
  const base = { model: "m", inputTokens: 0, outputTokens: 0, modelCalls: 0, cacheHits: 0 };
  return {
    planner: { ...base, model: "small" },
    reviewer: { ...base },
    verifier: { ...base },
    ...overrides,
  };
}

describe("telemetry", () => {
  it("estimates cost only for priced models", () => {
    const usage = roleUsage({
      reviewer: { model: "big", inputTokens: 1_000_000, outputTokens: 500_000, modelCalls: 1, cacheHits: 0 },
      verifier: {
        model: "small",
        inputTokens: 2_000_000,
        outputTokens: 1_000_000,
        modelCalls: 1,
        cacheHits: 0,
      },
    });
    const cost = estimateCost(usage, {
      big: { input: 2, output: 8 },
      small: { input: 0.5, output: 1.5 },
    });
    // 1M in * 2 + 0.5M out * 8 = 6 ; 2M in * 0.5 + 1M out * 1.5 = 2.5
    expect(cost).toBeCloseTo(8.5, 6);
  });

  it("returns zero when there were no model calls", () => {
    expect(estimateCost(roleUsage(), {})).toBe(0);
  });

  it("formats small costs readably", () => {
    expect(formatCost(undefined)).toBe("n/a");
    expect(formatCost(0)).toBe("$0");
    expect(formatCost(0.0042)).toBe("~$0.0042");
    expect(formatCost(0.42)).toBe("~$0.420");
  });

  it("appends one JSON line per run and never throws on bad paths", () => {
    const dir = mkdtempSync(join(tmpdir(), "ar-telemetry-"));
    try {
      const file = join(dir, "nested", "telemetry.jsonl");
      const record = {
        timestamp: new Date().toISOString(),
        tool: "air-review",
        version: "0.1.0",
        repository: "o/r",
        pullRequest: 1,
        fromSha: "a",
        headSha: "b",
        skipped: false,
        gatePassed: true,
        counts: {},
        findings: { open: 0, resolved: 0 },
        usage: {
          byRole: roleUsage(),
          inputTokens: 0,
          outputTokens: 0,
          modelCalls: 0,
          cacheHits: 0,
        },
        durationMs: 1,
        models: { reviewer: "m" },
      };
      appendRunLog(file, record);
      appendRunLog(file, { ...record, skipped: true });
      const lines = readFileSync(file, "utf8").trim().split("\n");
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[1]!).skipped).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("cost completeness and provider cache", () => {
  const active = {
    model: "m",
    inputTokens: 1000,
    cachedInputTokens: 400,
    outputTokens: 200,
    reasoningTokens: 80,
    modelCalls: 1,
    cacheHits: 0,
  };
  it("charges cached input separately and reasoning only once", () => {
    expect(estimateCost({ reviewer: active }, { m: { input: 2, cachedInput: 0.5, output: 8 } })).toBe(0.003);
  });
  it("does not label a partial price sum as total cost", () => {
    expect(
      estimateCost(
        { reviewer: active, verifier: { ...active, model: "unknown" } },
        { m: { input: 2, cachedInput: 0.5, output: 8 } },
      ),
    ).toBeUndefined();
  });
  it("requires the cache rate when the provider reports cached tokens", () => {
    expect(estimateCost({ reviewer: active }, { m: { input: 2, output: 8 } })).toBeUndefined();
  });
  it("does not invent a cost from absent usage", () => {
    expect(
      estimateCost(
        { reviewer: { ...active, usageIncomplete: true } },
        { m: { input: 2, cachedInput: 0.5, output: 8 } },
      ),
    ).toBeUndefined();
  });
});
