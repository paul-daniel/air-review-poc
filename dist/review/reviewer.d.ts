import type { ModelProvider, Usage } from "../contracts/model.js";
import type { CandidateFinding } from "../framework/rules.js";
import { type ReviewerPromptInput } from "./prompts.js";
export interface LlmReviewResult {
    findings: CandidateFinding[];
    usage: Usage;
    warnings: string[];
}
/**
 * The strong review pass: one model call with the evidence bundle. Structured
 * output is parsed and individually validated so a single bad entry does not
 * kill the whole run.
 */
export declare function runReviewer(provider: ModelProvider, model: string, input: ReviewerPromptInput): Promise<LlmReviewResult>;
