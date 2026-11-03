import type { ModelProvider } from "../contracts/model.js";
export interface ProbeResult {
    model: string;
    ok: boolean;
    /** Round-trip time of the probe request. */
    durationMs: number;
    /** Tokens the probe consumed, when the provider reports them. */
    inputTokens?: number;
    outputTokens?: number;
    error?: string;
    /** Set when the deployment answered but spent the probe budget on hidden reasoning. */
    note?: string;
}
/**
 * Prove that a deployment answers before a review pays for it.
 *
 * Azure endpoints have no `/models` listing, so the only way to validate the
 * key, the URL and a deployment name is to ask it something. The probe is the
 * cheapest possible request (a one-word answer, a handful of tokens) and is
 * sent once per distinct model, so a config where all roles share one
 * deployment costs a single call.
 */
export declare function probeModels(provider: ModelProvider, models: string[]): Promise<ProbeResult[]>;
export declare function probeModel(provider: ModelProvider, model: string): Promise<ProbeResult>;
