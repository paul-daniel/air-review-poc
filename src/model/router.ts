import { ConfigError } from "../errors.js";
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
  light: { reviewer: string; verifier: string };
  standard: { reviewer: string; verifier: string };
  heavy: { reviewer: string; verifier: string };
}

/**
 * Standard role models: explicit role, then `models.default`, then the next
 * cheaper role. The reviewer is the only role that must be strong; the three
 * others default to whatever cheap model is configured.
 */
export function resolveRoleModels(
  config: AirReviewConfig,
  overrides: ModelOverrides,
): Record<ModelRole, string | undefined> {
  const roles = config.models.roles;

  const reviewer = overrides.model ?? overrides.reviewer ?? roles.reviewer ?? config.models.default;
  const planner = overrides.planner ?? roles.planner ?? config.models.default ?? reviewer;
  const verifier = overrides.verifier ?? roles.verifier ?? roles.planner ?? config.models.default ?? reviewer;
  const triage =
    overrides.triage ?? roles.triage ?? roles.planner ?? roles.verifier ?? config.models.default ?? reviewer;

  return { triage, planner, reviewer, verifier };
}

export function requireRoleModels(models: Record<ModelRole, string | undefined>): RoleModels {
  const missing = Object.entries(models)
    .filter(([, value]) => !value)
    .map(([role]) => role);

  if (missing.length > 0) {
    throw new ConfigError(
      `No model configured for role(s): ${missing.join(", ")}. ` +
        `Set "models.default" or "models.roles" in your config, or pass --model. ` +
        `Use "air-review models" to see what the endpoint offers.`,
    );
  }

  return models as RoleModels;
}

/**
 * Per-tier reviewer/verifier models. A tier that names no model uses the
 * standard role model, so routing never fails for lack of configuration: it
 * only saves money when a cheaper (or spends it when a stronger) model exists.
 */
export function resolveTierModels(config: AirReviewConfig, models: RoleModels): TierModels {
  const standard = { reviewer: models.reviewer, verifier: models.verifier };
  const tiers = config.models.tiers;
  return {
    light: {
      reviewer: tiers.light.reviewer ?? standard.reviewer,
      verifier: tiers.light.verifier ?? standard.verifier,
    },
    standard,
    heavy: {
      reviewer: tiers.heavy.reviewer ?? standard.reviewer,
      verifier: tiers.heavy.verifier ?? standard.verifier,
    },
  };
}

/** Role models for one run, once the triage step has picked a tier. */
export function modelsForTier(models: RoleModels, tiers: TierModels, tier: ComplexityTier): RoleModels {
  return { ...models, reviewer: tiers[tier].reviewer, verifier: tiers[tier].verifier };
}
