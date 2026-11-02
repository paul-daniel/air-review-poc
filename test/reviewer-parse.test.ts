import { describe, expect, it } from "vitest";
import { runReviewer } from "../src/review/reviewer.js";
import type { ModelProvider, StructuredRequest } from "../src/contracts/model.js";

/**
 * Regression test from a real run: small models sometimes copy the enum list
 * into a field ("reference|convention|..."), write enum values in lowercase,
 * or send numbers as strings. None of that may discard the whole response.
 */
function providerReturning(payload: unknown): ModelProvider {
  return {
    id: "stub",
    capabilities: async () => ({
      toolCalling: false,
      jsonMode: true,
      jsonSchema: true,
      streaming: false,
    }),
    listModels: async () => [],
    generate: async () => ({ text: "", usage: { inputTokens: 0, outputTokens: 0 }, model: "stub" }),
    structured: async <T>(request: StructuredRequest<T>) => ({
      data: request.parse(payload),
      usage: { inputTokens: 1, outputTokens: 1 },
      model: "stub",
    }),
  };
}

const input = {
  pr: {
    owner: "o",
    repo: "r",
    number: 1,
    title: "t",
    baseRef: "main",
    headRef: "feat",
    baseSha: "a",
    headSha: "b",
  },
  delta: {
    fromSha: "a",
    toSha: "b",
    diff: "diff",
    files: [{ path: "src/app/x.ts", status: "modified" as const, addedLines: [12], removedLines: [] }],
  },
  evidence: {
    files: [],
    conventions: [],
    projectFacts: { strict: true, standaloneDefault: true },
    warnings: [],
  },
  previousFindings: [],
  maxFindings: 10,
};

describe("reviewer response parsing", () => {
  it.each([null, { language: "typescript", code: "stream.pipe(cleanup()).subscribe(handler);" }])(
    "keeps optional fix examples as structured data",
    async (suggestedCode) => {
      const result = await runReviewer(
        providerReturning({
          findings: [
            {
              severity: "MAJOR",
              confidence: 0.94,
              scope: "IN_PR",
              ruleOrigin: "FRAMEWORK",
              ruleId: "test.rule",
              title: "Missing stream cleanup",
              summary: "This stream continues after the component is destroyed.",
              suggestion: "Tie the subscription to the component lifecycle.",
              suggestedCode,
              file: "src/app/x.ts",
              startLine: 12,
              endLine: 12,
              evidence: [],
            },
          ],
        }),
        "stub",
        input as never,
      );
      expect(result.warnings).toEqual([]);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]!.suggestedCode).toEqual(suggestedCode ?? undefined);
    },
  );
  it("normalizes common model mistakes instead of dropping the batch", async () => {
    const result = await runReviewer(
      providerReturning({
        findings: [
          {
            severity: "major",
            confidence: "0.8",
            scope: "in_pr",
            ruleOrigin: "framework",
            ruleId: "test.rule",
            title: "A tolerated finding",
            summary: "The model used lowercase enums and string numbers everywhere.",
            file: "src/app/x.ts",
            startLine: "12",
            endLine: 12,
            symbol: null,
            evidence: [{ kind: "reference|convention|config|history|framework", label: "enum list copied" }],
          },
        ],
      }),
      "stub",
      input as never,
    );

    expect(result.findings).toHaveLength(1);
    const finding = result.findings[0]!;
    expect(finding.severity).toBe("MAJOR");
    expect(finding.confidence).toBe(0.8);
    expect(finding.scope).toBe("IN_PR");
    expect(finding.ruleOrigin).toBe("FRAMEWORK");
    expect(finding.anchor.startLine).toBe(12);
    expect(finding.evidence[0]?.kind).toBe("reference");
  });

  it("drops only the malformed item and keeps the valid ones", async () => {
    const result = await runReviewer(
      providerReturning({
        findings: [
          { title: "missing everything else" },
          {
            severity: "MINOR",
            confidence: 0.6,
            scope: "IN_PR",
            ruleOrigin: "HEURISTIC",
            ruleId: "test.rule",
            title: "A valid finding",
            summary: "This item is complete and must survive the malformed sibling.",
            file: "src/app/x.ts",
            startLine: 12,
            endLine: 12,
            evidence: [],
          },
        ],
      }),
      "stub",
      input as never,
    );

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.title).toBe("A valid finding");
    expect(result.warnings.some((w) => w.includes("Dropped malformed finding"))).toBe(true);
  });
});
