export interface TelemetryRow {
    timestamp: string;
    repository: string;
    pullRequest: number | null;
    skipped: boolean;
    gatePassed: boolean;
    verdict?: string;
    /** Complexity tier and reviewer model chosen by the triage step. */
    routing?: {
        tier: string;
        reviewerModel: string;
        method: string;
    };
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
export declare function readTelemetry(logPath: string, last?: number): TelemetryRow[];
export declare function runTelemetry(logPath: string, options: {
    last: number;
    json: boolean;
}): void;
