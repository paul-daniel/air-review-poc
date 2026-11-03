import type { AirReviewConfig } from "../config/schema.js";
import type { ModelProvider } from "../contracts/model.js";
import type { Finding, ReviewSummary } from "../contracts/review.js";
import type { ComplexityTier } from "../contracts/routing.js";
import type { ScmAdapter } from "../contracts/scm.js";
import type { GitRepository } from "../context/repository.js";
import type { LocalCache } from "../cache/local.js";
import { type ModelOverrides, type RoleModels } from "../model/router.js";
import type { CiMode } from "../scm/detect.js";
export interface ProgressEvent {
    phase: "analyze" | "triage" | "review" | "verify" | "publish" | "done";
    detail?: string;
}
export interface ReviewOptions {
    ci: CiMode;
    publish: boolean;
    force: boolean;
    deterministicOnly: boolean;
    skipLlmVerifier: boolean;
    noCache: boolean;
    /** Force the complexity tier instead of letting triage decide. */
    tier?: ComplexityTier;
    base?: string;
    owner?: string;
    repo?: string;
    pr?: number;
    /** Azure DevOps organization URL (`--org`). */
    org?: string;
    /** Azure DevOps project (`--project`). */
    project?: string;
    modelOverrides: ModelOverrides;
    onProgress?: (event: ProgressEvent) => void;
}
export interface ReviewOutcome {
    summary: ReviewSummary;
    findings: Finding[];
    skipped: boolean;
    stale: boolean;
    published: boolean;
    warnings: string[];
    gateFailed: boolean;
    incomplete: boolean;
    /** Where the per-run observability report was written, when it was. */
    report?: {
        markdown: string;
        json: string;
    };
}
interface PipelineDeps {
    config: AirReviewConfig;
    provider: ModelProvider;
    /** Configured (standard-tier) role models; the triage step may swap reviewer/verifier per run. */
    models: RoleModels;
    scm: ScmAdapter;
    git: GitRepository;
    cache: LocalCache;
}
export declare function runReview(options: ReviewOptions, deps: PipelineDeps): Promise<ReviewOutcome>;
export {};
