/**
 * Provider presets: one id per vendor, filling in the endpoint conventions
 * (base URL shape, key header, paths) that each API expects. Everything a
 * preset sets can be overridden in the `endpoint` config section.
 */
export interface ProviderPreset {
    id: string;
    label: string;
    /** Default base URL. A "<...>" placeholder must be replaced by the user. */
    baseUrl?: string;
    /** Default environment variable holding the API key. */
    apiKeyEnv?: string;
    apiKeyHeader: string;
    apiKeyPrefix: string;
    chatPath: string;
    modelsPath: string;
    listModels: boolean;
    docsUrl?: string;
    note?: string;
    hidden?: boolean;
    /** Suggested role models, used by `init` when the names are unambiguous. */
    models?: {
        planner: string;
        reviewer: string;
        verifier: string;
        triage?: string;
    };
}
export declare const PROVIDER_PRESETS: Record<string, ProviderPreset>;
export declare const PRESET_IDS: string[];
export declare const VISIBLE_PRESET_IDS: string[];
