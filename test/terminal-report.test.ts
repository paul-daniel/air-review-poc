import { describe, expect, it } from "vitest";
import { renderReviewReport, renderCodeBlock, terminalText } from "../src/cli/report.js";

import { outcome, sources } from "./fixtures/terminal-outcome.js";

describe("terminal review report", () => {
  it("shows actionable code, exact lines, explanation, fix and honest gate language", () => {
    const report = renderReviewReport(outcome, { sources, plain: true, local: true });
    expect(report).toContain("> 3 |     this.events$.subscribe");
    expect(report).not.toContain("Why it matters");
    expect(report).toContain("The event stream stays active");
    expect(report).not.toContain("Suggested fix");
    expect(report).toContain("Use takeUntilDestroyed");
    expect(report).toContain("94% confidence");
    expect(report).toContain("Policy gate passed: no issue meets the blocking threshold.");
    expect(report).toContain("500 from provider cache");
    expect(report).toContain("100 reasoning");
    expect(report).toContain("~$0.0042");
    expect(report).not.toContain("demo/demo");
    expect(report).not.toContain("\x1b");
  });
  it.each([40, 60, 80, 100])("wraps long paths, code and text within %i columns", (width) => {
    const long = structuredClone(outcome);
    long.findings[0]!.title = "LongIssue".repeat(30);
    const report = renderReviewReport(long, {
      width,
      sources: new Map([["src/widget.ts", "a\nb\n" + "x".repeat(250)]]),
      plain: true,
    });
    for (const line of report.split("\n")) expect(line.length, line).toBeLessThanOrEqual(width);
  });
  it("uses syntax color and contrasting code-panel backgrounds", () => {
    const report = renderReviewReport(outcome, { sources, color: true });
    expect(report).toContain("\x1b[36m");
    expect(report).not.toContain("\x1b[2m");
    expect(report).toContain("\x1b[48;5;235m");
    expect(report).toContain("\x1b[48;5;24m");
    expect(report).toContain("TypeScript");
  });
  it("prevents terminal injection and redacts secrets in displayed snippets", () => {
    const secret = "sk-" + "A".repeat(40);
    const report = renderReviewReport(outcome, {
      sources: new Map([["src/widget.ts", `a\nb\n\x1b[2J${secret}`]]),
      plain: true,
    });
    expect(report).not.toContain(secret);
    expect(report).not.toContain("\x1b");
    expect(terminalText("\x1b]0;fake title\x07visible")).toBe("visible");
  });
  it("keeps incomplete and skipped statuses unambiguous", () => {
    expect(renderReviewReport({ ...outcome, incomplete: true })).toContain("Incomplete review");
    expect(renderReviewReport({ ...outcome, incomplete: true })).not.toContain("Policy gate passed");
    expect(renderReviewReport({ ...outcome, skipped: true })).toContain("Already reviewed");
  });
  it("does not invent code when the reviewed revision is unavailable", () => {
    expect(renderReviewReport(outcome)).toContain("Code excerpt unavailable at this revision.");
  });
});

describe("code panels", () => {
  it("highlights the full multi-line range, including lines beyond the old four-line excerpt", () => {
    const block = renderCodeBlock(
      Array.from({ length: 14 }, (_, i) => `line${i + 1}`).join("\n"),
      "example.ts",
      3,
      10,
      { color: true, width: 60 },
    );
    const highlighted = block.filter((line) => line.includes("\x1b[48;5;24m"));
    expect(highlighted).toHaveLength(8);
    expect(terminalText(highlighted.at(-1)!)).toContain("> 10");
    expect(terminalText(block.join("\n"))).toContain("lines 3–10 highlighted");
    for (const line of block) expect(terminalText(line).length).toBeLessThanOrEqual(60);
  });
  it("keeps the block and language in plain mode without ANSI", () => {
    const block = renderCodeBlock("a\nb\nc", "index.py", 1, 2, { color: true, plain: true, width: 40 }).join(
      "\n",
    );
    expect(block).toContain("Python");
    expect(block).not.toContain("+---");
    expect(block).not.toContain("\x1b");
    expect(block).toContain("> 1");
    expect(block).toContain("> 2");
  });
  it("highlights every continuation of a wrapped active line", () => {
    const block = renderCodeBlock("x".repeat(130), "index.js", 1, 1, { color: true, width: 40 });
    expect(block.filter((line) => line.includes("\x1b[48;5;24m")).length).toBeGreaterThan(3);
    expect(terminalText(block.join("\n"))).toContain("JavaScript");
  });
});
