import type { ModelOverrides } from "../../model/router.js";
import type { ComplexityTier } from "../../contracts/routing.js";
import type { CiMode } from "../../scm/detect.js";
import type { CliContext } from "../context.js";
export interface ReviewCliOptions {
    ci: CiMode;
    publish?: boolean;
    dryRun: boolean;
    force: boolean;
    deterministicOnly: boolean;
    noVerifier: boolean;
    noCache: boolean;
    tier?: ComplexityTier;
    base?: string;
    owner?: string;
    repo?: string;
    pr?: number;
    org?: string;
    project?: string;
    modelOverrides: ModelOverrides;
    json: boolean;
}
export declare function runReviewCommand(ctx: CliContext, options: ReviewCliOptions): Promise<number>;
