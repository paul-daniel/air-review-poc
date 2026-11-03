import { createHash } from "node:crypto";
import { VERSION } from "../version.js";
/**
 * Hash of the effective review configuration, used for cache/incremental keys.
 * `resolvedModels` are the *configured* role models (standard tier), not the
 * ones a particular run was routed to: a light follow-up push must still be
 * reviewed incrementally against a heavy first review.
 */
export function configHash(config, resolvedModels) {
    const canonical = JSON.stringify({
        version: VERSION,
        frameworks: config.frameworks,
        provider: config.provider,
        models: resolvedModels,
        tiers: config.models.tiers,
        routing: config.routing,
        endpoint: {
            baseUrl: config.endpoint.baseUrl,
            chatPath: config.endpoint.chatPath,
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
//# sourceMappingURL=hash.js.map