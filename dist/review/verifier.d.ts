import type { ModelProvider, Usage } from "../contracts/model.js";
import type { AirReviewConfig } from "../config/schema.js";
import type { CandidateFinding } from "../framework/rules.js";
export interface VerificationPass {
    findings: CandidateFinding[];
    dropped: Array<{
        finding: CandidateFinding;
        reason: string;
    }>;
    usage: Usage;
}
export declare function deterministicVerify(config: AirReviewConfig, candidates: CandidateFinding[], addedLinesByFile: Map<string, Set<number>>, strictAnchor?: (finding: CandidateFinding) => boolean): {
    findings: CandidateFinding[];
    dropped: Array<{
        finding: CandidateFinding;
        reason: string;
    }>;
};
/**
 * LLM verification pass: asks a (usually cheaper) model to confirm, drop or
 * recalibrate each candidate. On failure the deterministic pass still stands.
 */
/** System prompt of the Verifier role; also the instructions of the `air-review-verifier` Foundry agent. */
export declare const VERIFIER_SYSTEM_PROMPT: string;
export interface LlmVerifyOptions {
    /** Read the reviewed (head) content of a file; "" when unavailable. Enables the code excerpt. */
    readHead?: (path: string) => string;
    /**
     * Findings produced by deterministic rules. They are facts decided by software,
     * so the model may not drop or recalibrate them; when a model finding duplicates
     * one, the model finding is the one to drop.
     */
    locked?: (finding: CandidateFinding) => boolean;
}
export declare function llmVerify(provider: ModelProvider, model: string, candidates: CandidateFinding[], options?: LlmVerifyOptions): Promise<{
    findings: CandidateFinding[];
    dropped: Array<{
        finding: CandidateFinding;
        reason: string;
    }>;
    usage: Usage;
}>;
