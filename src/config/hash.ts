import { createHash } from "node:crypto";
import { VERSION } from "../version.js";
import type { AirReviewConfig } from "./schema.js";
import type { RoleModels } from "../model/router.js";

/** Hash of the effective review configuration, used for cache/incremental keys. */
export function configHash(config: AirReviewConfig, resolvedModels: RoleModels): string {
  const canonical = JSON.stringify({
    version: VERSION,
    frameworks: config.frameworks,
    provider: config.provider,
    models: resolvedModels,
    endpoint: {
      baseUrl: config.endpoint.baseUrl ?? config.openai.baseUrl ?? config.ollama.baseUrl,
      chatPath: config.endpoint.chatPath ?? config.openai.chatPath,
      api: config.endpoint.api,
      temperature: config.endpoint.temperature,
      maxTokensParameter: config.endpoint.maxTokensParameter,
    },
    context: config.context,
    review: config.review,
    privacy: config.privacy,
  });
  return `sha256:${createHash("sha256").update(canonical).digest("hex").slice(0, 12)}`;
}
