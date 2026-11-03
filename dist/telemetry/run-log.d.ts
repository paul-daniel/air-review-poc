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
    verdict?: string;
    routing?: {
        tier: string;
        reviewerModel: string;
        method: string;
    };
    counts: Record<string, number>;
    findings: {
        open: number;
        resolved: number;
    };
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
    /** Compact per-step trace (duration, model, tokens, cost). */
    steps?: Array<{
        id: string;
        status: string;
        durationMs: number;
        model?: string;
        inputTokens?: number;
        outputTokens?: number;
        estimatedCostUsd?: number;
    }>;
    incomplete?: boolean;
    durationMs: number;
    models: Record<string, string>;
}
/** Append one JSON line per run; telemetry stays local, nothing is shipped. */
export declare function appendRunLog(path: string, record: RunRecord): void;
export interface PricingTable {
    [model: string]: {
        input: number;
        output: number;
        cachedInput?: number;
    };
}
/**
 * Estimate the run cost from an optional price table (USD per 1M tokens).
 * Returns undefined if an active model is unpriced or usage is incomplete.
 * A run without API calls costs zero.
 */
export declare function estimateCost(byRole: Partial<RoleUsageMap>, pricing: PricingTable): number | undefined;
export declare function formatCost(cost: number | undefined): string;
