import type { ModelRole } from "../contracts/model.js";
import type { ComplexityTier } from "../contracts/routing.js";
import type { AirReviewConfig } from "../config/schema.js";
export type RoleModels = Record<ModelRole, string>;
export interface ModelOverrides {
    model?: string;
    triage?: string;
    planner?: string;
    reviewer?: string;
    verifier?: string;
}
/** Reviewer/verifier models per complexity tier; `standard` is the role model itself. */
export interface TierModels {
    light: {
        reviewer: string;
        verifier: string;
    };
    standard: {
        reviewer: string;
        verifier: string;
    };
    heavy: {
        reviewer: string;
        verifier: string;
    };
}
/**
 * Standard role models: explicit role, then `models.default`, then the next
 * cheaper role. The reviewer is the only role that must be strong; the three
 * others default to whatever cheap model is configured.
 */
export declare function resolveRoleModels(config: AirReviewConfig, overrides: ModelOverrides): Record<ModelRole, string | undefined>;
export declare function requireRoleModels(models: Record<ModelRole, string | undefined>): RoleModels;
/**
 * Per-tier reviewer/verifier models. A tier that names no model uses the
 * standard role model, so routing never fails for lack of configuration: it
 * only saves money when a cheaper (or spends it when a stronger) model exists.
 */
export declare function resolveTierModels(config: AirReviewConfig, models: RoleModels): TierModels;
/** Role models for one run, once the triage step has picked a tier. */
export declare function modelsForTier(models: RoleModels, tiers: TierModels, tier: ComplexityTier): RoleModels;
