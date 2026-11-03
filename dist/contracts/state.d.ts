/**
 * Incremental review memory (the "PR ledger").
 *
 * This is the durable, compact state that survives between CI runs. It
 * stores facts, decisions and fingerprints - never internal model reasoning.
 */
import type { Finding } from "./review.js";
export interface AirReviewState {
    schemaVersion: number;
    tool: {
        name: string;
        version: string;
    };
    repository: {
        id: string;
    };
    pullRequest: {
        number: number | null;
        baseSha: string;
        headSha: string;
        previousReviewedSha?: string;
    };
    configuration: {
        hash: string;
        models: Record<string, string>;
    };
    runs: {
        lastCompleted: string;
        runId: string;
        /** Routing of the last run that called a model: tier and reviewer actually used. */
        routing?: {
            tier: string;
            reviewerModel: string;
            verifierModel: string;
            method: string;
        };
        verdict?: string;
    };
    findings: Finding[];
    /** Compact event journal: appeared / resolved / reopened / severity change. */
    history: Array<{
        at: string;
        sha: string;
        event: string;
        findingId: string;
        detail?: string;
    }>;
    metrics: {
        inputTokens: number;
        outputTokens: number;
        contextRequests: number;
        cacheHits: number;
    };
}
export declare function emptyState(repoId: string, pr: {
    number: number | null;
    baseSha: string;
    headSha: string;
}, configHash: string, models: Record<string, string>): AirReviewState;
