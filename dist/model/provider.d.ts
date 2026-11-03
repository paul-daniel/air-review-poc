import type { ModelProvider } from "../contracts/model.js";
import type { AirReviewConfig } from "../config/schema.js";
/** Presets served by the official Microsoft Foundry SDKs rather than the generic HTTP client. */
export declare const FOUNDRY_PRESETS: Set<string>;
/**
 * One provider per process. Which concrete class is used depends only on the
 * `provider` preset; everything else (models per role and per tier) is routing
 * done by the engine, never by the provider.
 */
export declare function createProvider(config: AirReviewConfig): ModelProvider;
