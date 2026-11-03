import { ConfigError } from "../errors.js";
import { PROVIDER_PRESETS, PRESET_IDS } from "./presets.js";
function pick(...values) {
    return values.find((value) => value !== undefined);
}
/**
 * Users paste endpoints straight from the Azure portal. Accept every documented
 * Microsoft Foundry shape and make it an OpenAI v1 base URL:
 *   https://<res>.openai.azure.com                    -> .../openai/v1
 *   https://<res>.services.ai.azure.com               -> .../openai/v1
 *   https://<res>.services.ai.azure.com/api/projects/<p> -> .../api/projects/<p>/openai/v1
 *   https://<res>.cognitiveservices.azure.com         -> .../openai/v1
 * A URL that already ends in /openai/v1 is returned unchanged. Other providers
 * are only stripped of trailing slashes.
 */
export function normalizeBaseUrl(baseUrl, providerId) {
    let trimmed = baseUrl.replace(/\/+$/, "");
    if (!providerId.startsWith("azure-") || providerId === "azure-foundry-agent")
        return trimmed;
    // The New Foundry portal prints "https://<res>.services.ai.azure.com/api/projects/" for a
    // resource that has no project yet: that is the resource endpoint, not a project one.
    trimmed = trimmed.replace(/\/api\/projects$/i, "");
    if (/\/openai\/v1$/i.test(trimmed))
        return trimmed;
    if (/\/openai$/i.test(trimmed))
        return `${trimmed}/v1`;
    if (/^https:\/\/[^/]+\.(openai\.azure\.com|services\.ai\.azure\.com|cognitiveservices\.azure\.com)(\/api\/projects\/[^/?#]+)?$/i.test(trimmed)) {
        return `${trimmed}/openai/v1`;
    }
    return trimmed;
}
/** Merge preset defaults with the `endpoint` section of the config. */
export function resolveEndpoint(config) {
    const preset = PROVIDER_PRESETS[config.provider];
    if (!preset) {
        throw new ConfigError(`Unknown provider "${config.provider}". Available providers: ${PRESET_IDS.join(", ")}.`);
    }
    const endpoint = config.endpoint;
    const apiKeyEnv = pick(endpoint.apiKeyEnv, preset.apiKeyEnv);
    const fromEnv = apiKeyEnv ? process.env[apiKeyEnv] : undefined;
    // An unexpanded pipeline macro (`$(NAME)`) is not a credential.
    const apiKey = pick(endpoint.apiKey, fromEnv && !/^\$\([^)]*\)$/.test(fromEnv.trim()) ? fromEnv : undefined);
    const baseUrl = pick(endpoint.baseUrl, preset.baseUrl);
    if (preset.id === "mock") {
        return {
            api: "chat-completions",
            temperature: undefined,
            maxTokensParameter: "max_tokens",
            providerId: preset.id,
            preset,
            baseUrl: "mock://air-review",
            apiKey: undefined,
            apiKeyEnv: undefined,
            apiKeyHeader: "authorization",
            apiKeyPrefix: "",
            chatPath: preset.chatPath,
            modelsPath: preset.modelsPath,
            listModels: true,
            timeoutMs: endpoint.timeoutMs,
            headers: {},
        };
    }
    if (!baseUrl) {
        throw new ConfigError(`Provider "${config.provider}" needs an endpoint URL. ` +
            `Set endpoint.baseUrl in the config or AIR_REVIEW_BASE_URL in the environment.`);
    }
    if (baseUrl.includes("<")) {
        throw new ConfigError(`Provider "${config.provider}" needs a concrete endpoint URL: "${baseUrl}". ` +
            `${preset.note ?? ""} See ${preset.docsUrl ?? "the provider docs"}.`.trim());
    }
    // "bearer" overrides the preset's header convention: Entra ID tokens and OAuth
    // gateways always expect `Authorization: Bearer <token>`, even on Azure hosts.
    const bearer = endpoint.auth === "bearer";
    return {
        api: endpoint.api ?? "auto",
        temperature: endpoint.temperature !== undefined
            ? endpoint.temperature
            : config.provider.startsWith("azure-")
                ? null
                : undefined,
        maxTokensParameter: endpoint.maxTokensParameter ??
            (config.provider.startsWith("azure-") ? "max_completion_tokens" : "max_tokens"),
        providerId: preset.id,
        preset,
        baseUrl: normalizeBaseUrl(baseUrl, preset.id),
        apiKey,
        apiKeyEnv,
        apiKeyHeader: bearer
            ? "authorization"
            : (pick(endpoint.apiKeyHeader, preset.apiKeyHeader) ?? "authorization"),
        apiKeyPrefix: bearer ? "Bearer " : (pick(endpoint.apiKeyPrefix, preset.apiKeyPrefix) ?? "Bearer "),
        chatPath: pick(endpoint.chatPath, preset.chatPath) ?? "/chat/completions",
        modelsPath: pick(endpoint.modelsPath, preset.modelsPath) ?? "/models",
        listModels: pick(endpoint.listModels, preset.listModels) ?? true,
        timeoutMs: endpoint.timeoutMs,
        headers: { ...endpoint.headers },
    };
}
//# sourceMappingURL=resolve.js.map