import { type AirReviewConfig } from "./schema.js";
export interface LoadedConfig {
    config: AirReviewConfig;
    /** Absolute path of the file the config was loaded from, when any. */
    path: string | null;
}
export declare function applyEnvOverrides(config: AirReviewConfig): AirReviewConfig;
export declare function loadConfig(explicitPath?: string): LoadedConfig;
