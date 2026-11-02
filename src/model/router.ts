import { ConfigError } from "../errors.js";
import type { ModelRole } from "../contracts/model.js";
import type { AirReviewConfig } from "../config/schema.js";

export type RoleModels = Record<ModelRole, string>;

export interface ModelOverrides {
  model?: string;
  planner?: string;
  reviewer?: string;
  verifier?: string;
}

export function resolveRoleModels(
  config: AirReviewConfig,
  overrides: ModelOverrides,
): Record<ModelRole, string | undefined> {
  const roles = config.models.roles;

  const reviewer = overrides.model ?? overrides.reviewer ?? roles.reviewer ?? config.models.default;
  const planner = overrides.planner ?? roles.planner ?? config.models.default ?? reviewer;
  const verifier = overrides.verifier ?? roles.verifier ?? roles.planner ?? config.models.default ?? reviewer;

  return { planner, reviewer, verifier };
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
