import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { RoleUsageMap } from "../contracts/review.js";

export interface RunRecord {
  timestamp: string;
  tool: string;
  version: string;
  repository: string;
  pullRequest: number | null;
  fromSha: string;
  headSha: string;
  skipped: boolean;
  gatePassed: boolean;
  counts: Record<string, number>;
  findings: { open: number; resolved: number };
  usage: {
    byRole: RoleUsageMap;
    inputTokens: number;
    outputTokens: number;
    modelCalls: number;
    cacheHits: number;
    estimatedCostUsd?: number;
    cachedInputTokens?: number;
    reasoningTokens?: number;
    usageIncomplete?: boolean;
  };
  incomplete?: boolean;
  durationMs: number;
  models: Record<string, string>;
}

/** Append one JSON line per run; telemetry stays local, nothing is shipped. */
export function appendRunLog(path: string, record: RunRecord): void {
  try {
    const file = resolve(path);
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify(record)}\n`);
  } catch {
    // Telemetry must never fail a review.
  }
}

export interface PricingTable {
  [model: string]: { input: number; output: number; cachedInput?: number };
}

/**
 * Estimate the run cost from an optional price table (USD per 1M tokens).
 * Returns undefined if an active model is unpriced or usage is incomplete.
 * A run without API calls costs zero.
 */
export function estimateCost(byRole: Partial<RoleUsageMap>, pricing: PricingTable): number | undefined {
  let cost = 0;
  for (const usage of Object.values(byRole)) {
    if (usage.usageIncomplete) return undefined;
    if (usage.modelCalls === 0 && usage.inputTokens === 0 && usage.outputTokens === 0) continue;
    const model = usage.model;
    if (!model || !pricing[model]) return undefined;
    const price = pricing[model]!;
    const cached = usage.cachedInputTokens ?? 0;
    if (cached > 0 && price.cachedInput === undefined) return undefined;
    cost += ((usage.inputTokens - cached) / 1_000_000) * price.input;
    cost += (cached / 1_000_000) * (price.cachedInput ?? price.input);
    cost += (usage.outputTokens / 1_000_000) * price.output;
  }
  return Number(cost.toFixed(8));
}

export function formatCost(cost: number | undefined): string {
  if (cost === undefined) return "n/a";
  if (cost === 0) return "$0";
  if (cost < 0.01) return `~$${cost.toFixed(4)}`;
  return `~$${cost.toFixed(3)}`;
}
