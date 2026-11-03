import type { ModelProvider } from "../contracts/model.js";
import type { AirReviewConfig } from "../config/schema.js";
import { OpenAICompatibleProvider } from "./openai-compatible.js";
import { FoundryProvider } from "./foundry.js";
import { FoundryAgentProvider } from "./foundry-agent.js";
import { MockProvider } from "./mock.js";
import { resolveEndpoint } from "./resolve.js";

/** Presets served by the official Microsoft Foundry SDKs rather than the generic HTTP client. */
export const FOUNDRY_PRESETS = new Set(["azure-foundry", "azure-openai"]);

/**
 * One provider per process. Which concrete class is used depends only on the
 * `provider` preset; everything else (models per role and per tier) is routing
 * done by the engine, never by the provider.
 */
export function createProvider(config: AirReviewConfig): ModelProvider {
  const endpoint = resolveEndpoint(config);

  if (endpoint.providerId === "mock") return new MockProvider();

  if (FOUNDRY_PRESETS.has(endpoint.providerId)) {
    return new FoundryProvider({
      endpoint: endpoint.baseUrl,
      apiKey: endpoint.apiKey,
      apiKeyEnv: endpoint.apiKeyEnv,
      auth: config.endpoint.auth,
      api: endpoint.api,
      timeoutMs: endpoint.timeoutMs,
      maxTokensParameter: endpoint.maxTokensParameter,
      headers: endpoint.headers,
    });
  }

  if (endpoint.providerId === "azure-foundry-agent") {
    return new FoundryAgentProvider({
      projectEndpoint: endpoint.baseUrl,
      apiKey: endpoint.apiKey,
      apiKeyEnv: endpoint.apiKeyEnv,
      auth: config.endpoint.auth,
      timeoutMs: endpoint.timeoutMs,
    });
  }

  return new OpenAICompatibleProvider({
    api: endpoint.api,
    temperature: endpoint.temperature,
    maxTokensParameter: endpoint.maxTokensParameter,
    providerId: endpoint.providerId,
    baseUrl: endpoint.baseUrl,
    apiKey: endpoint.apiKey,
    apiKeyEnv: endpoint.apiKeyEnv,
    apiKeyHeader: endpoint.apiKeyHeader,
    apiKeyPrefix: endpoint.apiKeyPrefix,
    chatPath: endpoint.chatPath,
    modelsPath: endpoint.modelsPath,
    listModels: endpoint.listModels,
    timeoutMs: endpoint.timeoutMs,
    headers: endpoint.headers,
    onRetry: ({ attempt, status, delayMs }) => {
      const reason = status === 429 ? "rate limited" : status ? `HTTP ${status}` : "timed out";
      process.stderr.write(
        `\rnote: ${endpoint.preset.label} ${reason}; retrying in ${Math.ceil(delayMs / 1000)} s (attempt ${attempt + 1})\n`,
      );
    },
  });
}
