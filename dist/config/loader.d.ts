import { type AirReviewConfig } from "./schema.js";
export interface LoadedConfig {
    config: AirReviewConfig;
    /** Absolute path of the file the config was loaded from, when any. */
    path: string | null;
}
/**
 * Apply documented environment overrides on top of the file config:
 * AIR_REVIEW_PROVIDER, AIR_REVIEW_MODEL[_TRIAGE|_PLANNER|_REVIEWER|_VERIFIER],
 * AIR_REVIEW_MODEL_{REVIEWER,VERIFIER}_{LIGHT,HEAVY}, AIR_REVIEW_ROUTING_MODE,
 * AIR_REVIEW_BASE_URL, AIR_REVIEW_API_KEY, AIR_REVIEW_ACCESS_TOKEN, AIR_REVIEW_PRICING.
 */
export declare function applyEnvOverrides(config: AirReviewConfig): AirReviewConfig;
export declare function loadConfig(explicitPath?: string): LoadedConfig;
