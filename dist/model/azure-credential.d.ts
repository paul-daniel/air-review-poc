import type { TokenCredential } from "@azure/core-auth";
/** Scope of every Microsoft Foundry data-plane call (models, Claude, agents). */
export declare const FOUNDRY_SCOPE = "https://ai.azure.com/.default";
export type AzureCredentialKind = "api-key" | "access-token" | "entra-id";
export interface ResolvedAzureCredential {
    kind: AzureCredentialKind;
    /** Human-readable origin, for `doctor`. */
    description: string;
    /** Present for "api-key". */
    apiKey?: string;
    /** Returns a bearer token; present for "access-token" and "entra-id". */
    tokenProvider?: () => Promise<string>;
    /** Azure SDK credential object; present for "access-token" and "entra-id". */
    credential?: TokenCredential;
}
export interface AzureCredentialInput {
    /** API key, or a raw access token when `auth` is "bearer". */
    apiKey?: string;
    apiKeyEnv?: string;
    auth?: "api-key" | "bearer";
}
/**
 * Which credential a Foundry call uses, in Microsoft's recommended order of
 * preference reversed for convenience:
 *
 *   1. an explicit API key (config or AIR_REVIEW_API_KEY / AZURE_AI_API_KEY);
 *   2. an explicit access token (AIR_REVIEW_ACCESS_TOKEN) for jobs that fetch
 *      one themselves;
 *   3. otherwise keyless: `DefaultAzureCredential` finds the identity of the
 *      environment (az login on a laptop, managed identity or the pipeline's
 *      service connection in CI) and refreshes tokens on its own.
 */
export declare function resolveAzureCredential(input: AzureCredentialInput): Promise<ResolvedAzureCredential>;
