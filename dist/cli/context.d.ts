import { type AirReviewConfig } from "../config/index.js";
import { type ModelOverrides } from "../model/index.js";
import type { ModelProvider, ModelRole } from "../contracts/model.js";
import { GitRepository } from "../context/repository.js";
import { type ScmOptions } from "../scm/detect.js";
import type { ScmAdapter } from "../contracts/scm.js";
import { LocalCache } from "../cache/local.js";
export interface CliContext {
    config: AirReviewConfig;
    configPath: string | null;
    provider: ModelProvider;
    git: GitRepository;
    scm: ScmAdapter;
    cache: LocalCache;
    models: Record<ModelRole, string | undefined>;
}
export interface ContextOptions extends ScmOptions {
    configPath?: string;
    modelOverrides?: ModelOverrides;
    cacheDir?: string;
    /** Validate that every role has a model (review/doctor default true). */
    requireModels?: boolean;
}
export declare function buildContext(options: ContextOptions): Promise<CliContext>;
