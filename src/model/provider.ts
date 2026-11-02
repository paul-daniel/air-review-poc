import type { ModelProvider } from "../contracts/model.js";
import type { AirReviewConfig } from "../config/schema.js";
import { OpenAICompatibleProvider } from "./openai-compatible.js";
import { FoundryAgentProvider } from "./foundry-agent.js";
import { MockProvider } from "./mock.js";
import { resolveEndpoint } from "./resolve.js";

/**
 * One provider per process. Which concrete class is used depends only on the
 * `provider` preset; everything else (models per role and per tier) is routing
 * done by the engine, never by the provider.
 */
export function createProvider(config: AirReviewConfig): ModelProvider {
  const endpoint = resolveEndpoint(config);
  const onRetry = ({ attempt, status, delayMs }: { attempt: number; status: number; delayMs: number }) => {
    const reason = status === 429 ? "rate limited" : status ? `HTTP ${status}` : "timed out";
    process.stderr.write(
      `\rnote: ${endpoint.preset.label} ${reason}; retrying in ${Math.ceil(delayMs / 1000)} s (attempt ${attempt + 1})\n`,
    );
  };

  if (endpoint.providerId === "mock") return new MockProvider();

  if (endpoint.providerId === "azure-foundry-agent") {
    return new FoundryAgentProvider({
      projectEndpoint: endpoint.baseUrl,
      token: endpoint.apiKey,
      tokenEnv: endpoint.apiKeyEnv,
      timeoutMs: endpoint.timeoutMs,
      headers: endpoint.headers,
      onRetry,
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
    onRetry,
  });
}
