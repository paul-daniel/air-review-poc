import { describe, expect, it } from "vitest";
import { deterministicVerify } from "../src/review/verifier.js";
import type { AirReviewConfig } from "../src/config/schema.js";
import { defaultConfig } from "../src/config/defaults.js";
import type { CandidateFinding } from "../src/framework/rules.js";

function candidate(overrides: Partial<CandidateFinding> = {}): CandidateFinding {
  return {
    ruleId: "test.rule",
    ruleOrigin: "FRAMEWORK",
    severity: "MAJOR",
    confidence: 0.9,
    scope: "IN_PR",
    title: "Test finding",
    summary: "A reasonably long summary of the finding for tests.",
    anchor: { file: "a.ts", startLine: 5, endLine: 5 },
    evidence: [],
    ...overrides,
  };
}

const config: AirReviewConfig = defaultConfig();

describe("deterministicVerify", () => {
  it("keeps a model finding on unchanged lines of a changed file as a FOLLOW_UP interaction finding", () => {
    const added = new Map([["a.ts", new Set([10])]]);
    const result = deterministicVerify(config, [candidate()], added, () => true);
    expect(result.dropped).toHaveLength(0);
    expect(result.findings[0]).toMatchObject({ scope: "FOLLOW_UP", anchor: { startLine: 5, inDiff: false } });
    expect(result.findings[0]?.evidence.at(-1)?.label).toMatch(/unchanged code/);
  });

  it("keeps deterministic findings anchored to context lines of a changed file", () => {
    const added = new Map([["a.ts", new Set([10])]]);
    const result = deterministicVerify(config, [candidate()], added, () => false);
    expect(result.findings).toHaveLength(1);
  });

  it("deduplicates by file, line and rule", () => {
    const added = new Map([["a.ts", new Set([5])]]);
    const result = deterministicVerify(
      config,
      [candidate(), candidate({ summary: "Another one, same place." })],
      added,
    );
    expect(result.findings).toHaveLength(1);
  });

  it("filters severities not in the publish list", () => {
    const added = new Map([["a.ts", new Set([5])]]);
    const result = deterministicVerify(config, [candidate({ severity: "INFO" })], added);
    expect(result.findings).toHaveLength(0);
  });
});

describe("llmVerify", () => {
  const base = (over: Partial<CandidateFinding>): CandidateFinding => ({
    ruleId: "r",
    ruleOrigin: "HEURISTIC",
    severity: "MAJOR",
    confidence: 0.8,
    scope: "IN_PR",
    title: "t",
    summary: "s",
    anchor: { file: "a.ts", startLine: 7, endLine: 7 },
    evidence: [],
    ...over,
  });

  it("never drops or recalibrates a locked deterministic finding, and quotes code to the model", async () => {
    const { llmVerify } = await import("../src/review/verifier.js");
    const deterministic = base({
      ruleId: "angular.subscription-lifecycle",
      ruleOrigin: "FRAMEWORK",
      confidence: 0.94,
    });
    const fromModel = base({ ruleId: "subscription-leak", title: "Subscription not cleaned up" });
    let prompt = "";
    const provider = {
      id: "fake",
      capabilities: async () => ({ toolCalling: false, jsonMode: true, jsonSchema: false, streaming: false }),
      listModels: async () => [],
      generate: async () => ({ text: "", usage: { inputTokens: 0, outputTokens: 0 }, model: "m" }),
      structured: async <T>(request: {
        messages: Array<{ content: string }>;
        parse: (raw: unknown) => T;
      }) => {
        prompt = request.messages[1]?.content ?? "";
        return {
          data: request.parse({
            verdicts: [
              { index: 0, verdict: "drop", reason: "duplicate of 1", severity: "INFO", confidence: 0.1 },
              { index: 1, verdict: "keep", severity: "MINOR", confidence: 0.5 },
            ],
          }),
          usage: { inputTokens: 1, outputTokens: 1 },
          model: "m",
        };
      },
    };
    const pass = await llmVerify(provider, "m", [deterministic, fromModel], {
      readHead: () => "l1\nl2\nl3\nl4\nl5\nl6\nthis.api.events$.subscribe();\nl8",
      locked: (f) => f === deterministic,
    });
    expect(pass.dropped).toEqual([]);
    expect(pass.findings[0]).toMatchObject({
      ruleId: "angular.subscription-lifecycle",
      severity: "MAJOR",
      confidence: 0.94,
    });
    expect(pass.findings[1]).toMatchObject({
      ruleId: "subscription-leak",
      severity: "MINOR",
      confidence: 0.5,
    });
    expect(prompt).toContain("source: deterministic rule");
    expect(prompt).toContain("> 7 | this.api.events$.subscribe();");
  });
});

describe("deterministicVerify dedupes model findings against deterministic ones", () => {
  it("drops a model finding that overlaps a deterministic finding's lines, keeps the deterministic one", () => {
    const config = defaultConfig();
    const base = (over: Partial<CandidateFinding>): CandidateFinding => ({
      ruleId: "r",
      ruleOrigin: "HEURISTIC",
      severity: "MAJOR",
      confidence: 0.8,
      scope: "IN_PR",
      title: "t",
      summary: "s",
      anchor: { file: "w.ts", startLine: 7, endLine: 7 },
      evidence: [],
      ...over,
    });
    const deterministic = base({
      ruleId: "angular.subscription-lifecycle",
      ruleOrigin: "FRAMEWORK",
      confidence: 0.94,
    });
    const modelDuplicate = base({
      ruleId: "missing-subscription-cleanup",
      anchor: { file: "w.ts", startLine: 6, endLine: 8 },
    });
    const modelElsewhere = base({
      ruleId: "other-issue",
      anchor: { file: "w.ts", startLine: 12, endLine: 12 },
    });
    const added = new Map([["w.ts", new Set([5, 6, 7, 8, 9, 10, 11, 12])]]);
    const result = deterministicVerify(
      config,
      [deterministic, modelDuplicate, modelElsewhere],
      added,
      (f) => f !== deterministic,
    );
    expect(result.findings.map((f) => f.ruleId)).toEqual(["angular.subscription-lifecycle", "other-issue"]);
    expect(result.dropped[0]).toMatchObject({
      finding: { ruleId: "missing-subscription-cleanup" },
      reason: expect.stringMatching(/deterministic/),
    });
  });
});

describe("taste remarks never block", () => {
  it("caps heuristic maintainability/consistency/tests/docs findings at NITPICK", async () => {
    const { deterministicVerify } = await import("../src/review/verifier.js");
    const { defaultConfig } = await import("../src/config/defaults.js");
    const base = {
      ruleId: "r",
      confidence: 0.9,
      scope: "IN_PR" as const,
      title: "Could be clearer",
      summary: "Naming could be clearer.",
      anchor: { file: "a.ts", startLine: 3, endLine: 3 },
      evidence: [],
    };
    const result = deterministicVerify(
      defaultConfig(),
      [
        { ...base, ruleId: "r1", severity: "MINOR", ruleOrigin: "HEURISTIC", category: "maintainability" },
        {
          ...base,
          ruleId: "r2",
          severity: "MAJOR",
          ruleOrigin: "HEURISTIC",
          category: "correctness",
          title: "Wrong unit",
        },
        {
          ...base,
          ruleId: "r3",
          severity: "MINOR",
          ruleOrigin: "REPO_CONVENTION",
          category: "consistency",
          title: "Convention",
        },
      ],
      new Map([["a.ts", new Set([3])]]),
    );
    const bySeverity = result.findings.map((f) => `${f.title}:${f.severity}`).sort();
    expect(bySeverity).toEqual(["Convention:MINOR", "Could be clearer:NITPICK", "Wrong unit:MAJOR"]);
  });
});
