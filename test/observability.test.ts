import { describe, expect, it } from "vitest";
import { RunTrace, costOfUsage } from "../src/telemetry/trace.js";
import { renderWorkflowDiagram } from "../src/telemetry/workflow-diagram.js";
import { renderRunReport, renderStepTable } from "../src/telemetry/report.js";
import { renderSummaryMarkdown } from "../src/state/summary.js";
import { MockProvider } from "../src/model/mock.js";
import { decideVerdict } from "../src/review/verdict.js";
import type { ReviewSummary } from "../src/contracts/review.js";
import type { RoutingDecision } from "../src/contracts/routing.js";

const pricing = { big: { input: 2, output: 8, cachedInput: 0.5 }, small: { input: 0.1, output: 0.4 } };

function tracedSummary(): { summary: ReviewSummary; routing: RoutingDecision } {
  let now = 1_000;
  const trace = new RunTrace("ar_test", pricing, () => now);
  const load = trace.begin("state.load", "Load review memory");
  now += 50;
  load.end();
  const triage = trace.begin("triage", "Triage", { role: "triage" });
  now += 20;
  triage.end("done", { detail: "heavy tier via deterministic" });
  const review = trace.begin("review.model", "Reviewer (heavy)", { role: "reviewer", model: "big" });
  review.addUsage(
    { inputTokens: 10_000, outputTokens: 1_000, cachedInputTokens: 4_000, reasoningTokens: 200 },
    "big",
  );
  now += 4_200;
  review.end("done", { detail: "2 candidate finding(s)" });
  trace.skip("verify.model", "Verifier", "no candidate", { role: "verifier" });
  const gate = trace.begin("gate", "Policy gate");
  now += 5;
  gate.end();
  const routing: RoutingDecision = {
    tier: "heavy",
    reviewerModel: "big",
    verifierModel: "small",
    method: "deterministic",
    reasons: ["12 files ≥ 10"],
    signals: {
      files: 12,
      addedLines: 500,
      removedLines: 20,
      modules: ["apps/api", "apps/web", "libs/shared"],
      kinds: { code: 12 },
      nonCodeOnly: false,
      testsOnly: false,
      largestFileLines: 90,
      surfaceFiles: [],
    },
  };
  const metricsTrace = trace.summary();
  const summary: ReviewSummary = {
    pr: { owner: "Shop", repo: "atlas-shop", number: 7 },
    reviewedHeadSha: "abcdef0123456789",
    gatePassed: true,
    verdict: "approve-with-suggestions",
    counts: { BLOCKER: 0, CRITICAL: 0, MAJOR: 1, MINOR: 0, INFO: 0 },
    open: 1,
    resolved: 1,
    events: [{ event: "resolved", findingId: "arf_111111" }],
    metrics: {
      inputTokens: 10_000,
      outputTokens: 1_000,
      cachedInputTokens: 4_000,
      reasoningTokens: 200,
      modelCalls: 1,
      contextRequests: 3,
      cacheHits: 0,
      durationMs: metricsTrace.durationMs,
      deterministicFindings: 0,
      llmFindings: 2,
      verifiedFindings: 1,
      estimatedCostUsd: metricsTrace.totalEstimatedCostUsd,
      routing,
      trace: metricsTrace,
    },
    warnings: [],
  };
  summary.workflowDiagram = renderWorkflowDiagram(metricsTrace, routing);
  return { summary, routing };
}

describe("run trace", () => {
  it("prices usage from the table, cached tokens at their own rate", () => {
    expect(costOfUsage({ inputTokens: 1_000_000, outputTokens: 0 }, "big", pricing)).toBe(2);
    expect(
      costOfUsage({ inputTokens: 1_000_000, outputTokens: 0, cachedInputTokens: 1_000_000 }, "big", pricing),
    ).toBe(0.5);
    expect(costOfUsage({ inputTokens: 10, outputTokens: 10 }, "unknown", pricing)).toBeUndefined();
    expect(costOfUsage({ inputTokens: 0, outputTokens: 0 }, "unknown", pricing)).toBe(0);
  });

  it("records duration, tokens and cost per step and totals them", () => {
    const { summary } = tracedSummary();
    const trace = summary.metrics.trace!;
    const review = trace.steps.find((s) => s.id === "review.model")!;
    expect(review).toMatchObject({
      status: "done",
      role: "reviewer",
      model: "big",
      durationMs: 4_200,
      inputTokens: 10_000,
      outputTokens: 1_000,
    });
    expect(review.estimatedCostUsd).toBeCloseTo(
      (6_000 / 1e6) * 2 + (4_000 / 1e6) * 0.5 + (1_000 / 1e6) * 8,
      8,
    );
    expect(trace.steps.find((s) => s.id === "verify.model")).toMatchObject({
      status: "skipped",
      durationMs: 0,
    });
    expect(trace.totalEstimatedCostUsd).toBe(review.estimatedCostUsd);
    expect(trace.durationMs).toBe(4_275);
  });
});

describe("workflow diagram", () => {
  it("draws the path actually taken, with skipped steps and unused tiers greyed out", () => {
    const { summary } = tracedSummary();
    const diagram = summary.workflowDiagram!;
    expect(diagram.startsWith("flowchart TD")).toBe(true);
    expect(diagram).toContain("Reviewer (heavy)<br/>big<br/>4.2s · 10000→1000 tok");
    expect(diagram).toContain("-->|heavy|");
    expect(diagram).toMatch(/alt0\["reviewer \(light\)<br\/>not selected"\]/);
    expect(diagram).toMatch(/alt1\["reviewer \(standard\)<br\/>not selected"\]/);
    expect(diagram).toMatch(/class s3 skipped;/);
    expect(diagram).toContain("classDef skipped");
    expect(diagram).not.toMatch(/\["[^"]*"[^"\]]*"/); // no stray quotes inside a label
  });
});

describe("reports", () => {
  it("renders a per-step cost table with a total line", () => {
    const { summary } = tracedSummary();
    const table = renderStepTable(summary);
    expect(table).toContain("| Reviewer (heavy) | ✓ | reviewer · `big` | 4.2 s | 10,000 | 4,000 | 1,000 |");
    expect(table).toContain("| Verifier | – skipped | verifier | – |");
    expect(table).toContain("| **Total** | | 1 model call |");
  });

  it("renders the run report and the summary comment with routing, findings and diagram", () => {
    const { summary } = tracedSummary();
    const report = renderRunReport({ summary, findings: [], configuredModels: { reviewer: "big" } });
    expect(report).toContain("Verdict: ✅ Approved with suggestions");
    expect(report).toContain("**Tier:** `heavy` · **Reviewer:** `big`");
    expect(report).toContain("```mermaid");
    const comment = renderSummaryMarkdown(summary, { findings: [], mermaid: false });
    expect(comment.split("\n")[0]).toBe("## Air Review — ✅ Approved with suggestions");
    expect(comment).toContain("tier **heavy** (`big`)");
    expect(comment).toContain("### Since the last review");
    expect(comment).toContain("<details><summary>Cost and duration per step");
    expect(comment).toContain("Paste into https://mermaid.live");
  });
});

describe("verdict", () => {
  it("follows the gate and the open count, never votes on an incomplete run", () => {
    expect(
      decideVerdict({ open: 0, gatePassed: true, incomplete: false, approveWithSuggestions: true }),
    ).toBe("approve");
    expect(
      decideVerdict({ open: 2, gatePassed: true, incomplete: false, approveWithSuggestions: true }),
    ).toBe("approve-with-suggestions");
    expect(
      decideVerdict({ open: 2, gatePassed: true, incomplete: false, approveWithSuggestions: false }),
    ).toBe("comment");
    expect(
      decideVerdict({ open: 1, gatePassed: false, incomplete: false, approveWithSuggestions: true }),
    ).toBe("request-changes");
    expect(decideVerdict({ open: 0, gatePassed: true, incomplete: true, approveWithSuggestions: true })).toBe(
      "comment",
    );
  });
});

describe("mock provider", () => {
  it("turns air-review:expect markers into findings anchored on their line", async () => {
    const provider = new MockProvider();
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1,2 +1,4 @@",
      " const x = 1;",
      "+const y = 2;",
      "+// air-review:expect CRITICAL security sec.rule: Hardcoded token",
      " export {};",
    ].join("\n");
    const result = await provider.structured({
      model: "mock-large",
      messages: [{ role: "user", content: diff }],
      shapeHint: "review findings",
      parse: (raw) =>
        raw as { findings: Array<{ file: string; startLine: number; severity: string; category: string }> },
    });
    expect(result.data.findings).toHaveLength(1);
    expect(result.data.findings[0]).toMatchObject({
      file: "src/a.ts",
      startLine: 3,
      severity: "CRITICAL",
      category: "security",
    });
    expect(result.usage.inputTokens).toBeGreaterThan(0);
  });
});
