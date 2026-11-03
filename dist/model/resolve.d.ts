import type { AirReviewConfig } from "../config/schema.js";
import { type ProviderPreset } from "./presets.js";
export interface ResolvedEndpoint {
    api: "auto" | "chat-completions" | "responses";
    temperature?: number | null;
    maxTokensParameter: "max_tokens" | "max_completion_tokens";
    providerId: string;
    preset: ProviderPreset;
    baseUrl: string;
    apiKey?: string;
    apiKeyEnv?: string;
    apiKeyHeader: string;
    apiKeyPrefix: string;
    chatPath: string;
    modelsPath: string;
    listModels: boolean;
    timeoutMs: number;
    headers: Record<string, string>;
}
/**
 * Users paste endpoints straight from the Azure portal. Accept every documented
 * Microsoft Foundry shape and make it an OpenAI v1 base URL:
 *   https://<res>.openai.azure.com                    -> .../openai/v1
 *   https://<res>.services.ai.azure.com               -> .../openai/v1
 *   https://<res>.services.ai.azure.com/api/projects/<p> -> .../api/projects/<p>/openai/v1
 *   https://<res>.cognitiveservices.azure.com         -> .../openai/v1
 * A URL that already ends in /openai/v1 is returned unchanged. Other providers
 * are only stripped of trailing slashes.
 */
export declare function normalizeBaseUrl(baseUrl: string, providerId: string): string;
/** Merge preset defaults with the `endpoint` section of the config. */
export declare function resolveEndpoint(config: AirReviewConfig): ResolvedEndpoint;
