import { describe, expect, it } from "vitest";
import stringWidth from "string-width";
import { renderReviewReport, type ReportOptions } from "../src/cli/report.js";
import { renderFindingComment } from "../src/state/finding-comment.js";
import { outcome, sources } from "./fixtures/terminal-outcome.js";
import type { ReviewOutcome } from "../src/review/pipeline.js";

interface Case {
  name: string;
  change?: (value: ReviewOutcome) => void;
  options?: ReportOptions;
}
const cases: Case[] = [
  { name: "one finding" },
  {
    name: "multiple findings",
    change: (r) => {
      r.findings.push({
        ...r.findings[0]!,
        id: "arf_second",
        severity: "MINOR",
        title: "Handle an empty response",
        summary: "An empty response reaches the success handler without a value.",
        suggestion: "Return early when the response is empty.",
      });
    },
  },
  {
    name: "no findings",
    change: (r) => {
      r.findings = [];
      r.summary.open = 0;
      r.summary.counts.MAJOR = 0;
    },
  },
  {
    name: "blocking finding",
    change: (r) => {
      r.findings[0]!.severity = "CRITICAL";
      r.summary.gatePassed = false;
      r.gateFailed = true;
    },
  },
  {
    name: "non-blocking advisory",
    change: (r) => {
      r.findings[0]!.severity = "MINOR";
      r.findings[0]!.scope = "FOLLOW_UP";
    },
  },
  { name: "narrow 32 columns", options: { width: 32 } },
  { name: "wide 112 columns", options: { width: 112 } },
  { name: "color disabled", options: { color: false, plain: false } },
  {
    name: "long path",
    change: (r) => {
      r.findings[0]!.anchor.file =
        "src/features/customers/components/forms/a-very-long-customer-name.component.ts";
    },
  },
  {
    name: "multiline source range",
    change: (r) => {
      r.findings[0]!.anchor.startLine = 2;
      r.findings[0]!.anchor.endLine = 4;
    },
  },
  {
    name: "suggested code",
    change: (r) => {
      r.findings[0]!.suggestedCode = {
        language: "typescript",
        code: "this.events$\n  .pipe(takeUntilDestroyed(this.destroyRef))\n  .subscribe(value => console.log(value));",
      };
    },
  },
  {
    name: "missing optional evidence and recommendation",
    change: (r) => {
      r.findings[0]!.evidence = [];
      delete r.findings[0]!.suggestion;
    },
  },
  {
    name: "high confidence",
    change: (r) => {
      r.findings[0]!.confidence = 0.99;
    },
  },
  {
    name: "low confidence",
    change: (r) => {
      r.findings[0]!.confidence = 0.53;
    },
  },
  { name: "ASCII fallback", options: { ascii: true, plain: false } },
];

describe("terminal golden reports", () => {
  it.each(cases)("$name", ({ change, options }) => {
    const review = structuredClone(outcome);
    change?.(review);
    const opts = { width: 80, plain: true, local: true, sources, ...options };
    const before = structuredClone(review);
    const text = renderReviewReport(review, opts);
    expect(text).toMatchSnapshot();
    expect(review).toEqual(before); // Presentation never mutates machine data.
    for (const line of text.split("\n")) expect(stringWidth(line), line).toBeLessThanOrEqual(opts.width);
  });
  it("wraps wide glyphs, combining marks and emoji without breaking terminal width", () => {
    const r = structuredClone(outcome);
    r.findings[0]!.title = "客戶 e\u0301 👩🏽‍💻".repeat(12);
    r.findings[0]!.anchor.file = "src/客戶/👩🏽‍💻.ts";
    const text = renderReviewReport(r, {
      width: 32,
      color: true,
      sources: new Map([[r.findings[0]!.anchor.file, "a\nb\n" + "中文 👩🏽‍💻".repeat(20)]]),
    });
    for (const line of text.split("\n")) expect(stringWidth(line), line).toBeLessThanOrEqual(32);
  });
  it("keeps recommendation prose distinct from code in Markdown", () => {
    const finding = structuredClone(outcome.findings[0]!);
    finding.suggestedCode = { language: "typescript", code: "const example = `value`;" };
    const text = renderFindingComment(finding);
    expect(text).toContain("\nUse takeUntilDestroyed(this.destroyRef).\n");
    expect(text).toContain("```typescript\nconst example = `value`;\n```");
    expect(text).not.toContain("```ts\nUse");
  });
});
