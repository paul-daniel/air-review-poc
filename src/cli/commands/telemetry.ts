import { existsSync, readFileSync } from "node:fs";
import { printJson, printTable, c, formatTokens } from "../output.js";
import { formatCost } from "../../telemetry/run-log.js";

export interface TelemetryRow {
  timestamp: string;
  repository: string;
  pullRequest: number | null;
  skipped: boolean;
  gatePassed: boolean;
  open: number;
  resolved: number;
  inputTokens: number;
  outputTokens: number;
  modelCalls: number;
  estimatedCostUsd?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  incomplete?: boolean;
  durationMs: number;
}

/** Read the local run log, tolerating a missing file and partial lines. */
export function readTelemetry(logPath: string, last = 10): TelemetryRow[] {
  if (!existsSync(logPath)) return [];
  const rows: TelemetryRow[] = [];
  for (const line of readFileSync(logPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line) as {
        timestamp?: string;
        repository?: string;
        pullRequest?: number | null;
        skipped?: boolean;
        incomplete?: boolean;
        gatePassed?: boolean;
        findings?: { open?: number; resolved?: number };
        usage?: {
          inputTokens?: number;
          outputTokens?: number;
          modelCalls?: number;
          estimatedCostUsd?: number;
          cachedInputTokens?: number;
          reasoningTokens?: number;
        };
        durationMs?: number;
      };
      rows.push({
        timestamp: record.timestamp ?? "?",
        repository: record.repository ?? "?",
        pullRequest: record.pullRequest ?? null,
        skipped: Boolean(record.skipped),
        gatePassed: record.gatePassed !== false,
        open: record.findings?.open ?? 0,
        resolved: record.findings?.resolved ?? 0,
        inputTokens: record.usage?.inputTokens ?? 0,
        outputTokens: record.usage?.outputTokens ?? 0,
        modelCalls: record.usage?.modelCalls ?? 0,
        estimatedCostUsd: record.usage?.estimatedCostUsd,
        cachedInputTokens: record.usage?.cachedInputTokens,
        reasoningTokens: record.usage?.reasoningTokens,
        incomplete: record.incomplete,
        durationMs: record.durationMs ?? 0,
      });
    } catch {
      /* skip malformed line */
    }
  }
  return rows.slice(-last);
}

export function runTelemetry(logPath: string, options: { last: number; json: boolean }): void {
  const rows = readTelemetry(logPath, options.last);
  if (options.json) {
    printJson({ log: logPath, runs: rows });
    return;
  }
  if (rows.length === 0) {
    process.stdout.write(`${c.dim(`No runs recorded yet in ${logPath}. Run "air-review review" first.`)}\n`);
    return;
  }
  process.stdout.write(`${c.bold("recent runs")} ${c.dim(logPath)}\n\n`);
  printTable(
    [
      "when",
      "repository",
      "pr",
      "findings",
      "tokens",
      "cached",
      "reasoning",
      "calls",
      "cost",
      "time",
      "gate",
    ],
    rows.map((row) => [
      row.timestamp.slice(0, 19).replace("T", " "),
      row.repository,
      row.pullRequest ?? "-",
      `${row.open} open / ${row.resolved} fixed`,
      `${formatTokens(row.inputTokens)}↓/${formatTokens(row.outputTokens)}↑`,
      row.cachedInputTokens ?? "n/a",
      row.reasoningTokens ?? "n/a",
      row.modelCalls,
      formatCost(row.estimatedCostUsd),
      `${(row.durationMs / 1000).toFixed(1)}s`,
      row.incomplete
        ? c.yellow("incomplete")
        : row.skipped
          ? c.dim("skipped")
          : row.gatePassed
            ? c.green("pass")
            : c.red("fail"),
    ]),
  );
}
