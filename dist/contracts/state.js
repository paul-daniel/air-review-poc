/**
 * Incremental review memory (the "PR ledger").
 *
 * This is the durable, compact state that survives between CI runs. It
 * stores facts, decisions and fingerprints - never internal model reasoning.
 */
import { TOOL } from "../version.js";
export function emptyState(repoId, pr, configHash, models) {
    return {
        schemaVersion: 1,
        tool: { name: TOOL.name, version: TOOL.version },
        repository: { id: repoId },
        pullRequest: {
            number: pr.number,
            baseSha: pr.baseSha,
            headSha: pr.headSha,
        },
        configuration: { hash: configHash, models },
        runs: { lastCompleted: new Date().toISOString(), runId: "" },
        findings: [],
        history: [],
        metrics: { inputTokens: 0, outputTokens: 0, contextRequests: 0, cacheHits: 0 },
    };
}
//# sourceMappingURL=state.js.map