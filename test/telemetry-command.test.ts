import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readTelemetry, runTelemetry } from "../src/cli/commands/telemetry.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function logFile(lines: unknown[]): string {
  const dir = mkdtempSync(join(tmpdir(), "ar-tel-"));
  dirs.push(dir);
  const file = join(dir, "telemetry.jsonl");
  writeFileSync(file, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`);
  return file;
}

const record = (overrides: Record<string, unknown> = {}) => ({
  timestamp: "2026-10-05T20:00:00.000Z",
  repository: "acme/storefront",
  pullRequest: 42,
  skipped: false,
  gatePassed: true,
  verdict: "approve",
  findings: { open: 2, resolved: 1 },
  usage: { inputTokens: 3200, outputTokens: 900, modelCalls: 2, estimatedCostUsd: 0.0042 },
  durationMs: 8300,
  ...overrides,
});

describe("telemetry viewer", () => {
  it("returns an empty list for a missing log", () => {
    expect(readTelemetry(join(tmpdir(), "does-not-exist.jsonl"))).toEqual([]);
  });

  it("parses records, skips malformed lines and honors --last", () => {
    const file = logFile([
      record({ pullRequest: 1 }),
      "not-json",
      record({ pullRequest: 2 }),
      record({ pullRequest: 3 }),
    ]);
    const rows = readTelemetry(file, 2);
    expect(rows.map((row) => row.pullRequest)).toEqual([2, 3]);
    expect(rows[0]?.estimatedCostUsd).toBe(0.0042);
  });

  it("prints a table and a JSON view", () => {
    const file = logFile([record()]);
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    runTelemetry(file, { last: 10, json: false });
    expect(writes.join("")).toContain("acme/storefront");
    expect(writes.join("")).toContain("~$0.0042");

    writes.length = 0;
    runTelemetry(file, { last: 10, json: true });
    const parsed = JSON.parse(writes.join(""));
    expect(parsed.runs[0].pullRequest).toBe(42);
  });

  it("explains what to do when there is no log yet", () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    });
    runTelemetry(join(tmpdir(), "missing-telemetry.jsonl"), { last: 5, json: false });
    expect(writes.join("")).toContain("No runs recorded yet");
  });
});
