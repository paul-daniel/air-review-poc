import type { AirReviewConfig } from "./schema.js";
import type { RoleModels } from "../model/router.js";
/**
 * Hash of the effective review configuration, used for cache/incremental keys.
 * `resolvedModels` are the *configured* role models (standard tier), not the
 * ones a particular run was routed to: a light follow-up push must still be
 * reviewed incrementally against a heavy first review.
 */
export declare function configHash(config: AirReviewConfig, resolvedModels: RoleModels): string;
