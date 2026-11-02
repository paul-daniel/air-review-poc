import type { ModelProvider } from "../contracts/model.js";
import type { AirReviewConfig } from "../config/schema.js";
import { ConfigError } from "../errors.js";
import { OllamaProvider } from "./ollama.js";
import { OpenAICompatibleProvider } from "./openai-compatible.js";
import { resolveEndpoint } from "./resolve.js";

export function createProvider(config: AirReviewConfig): ModelProvider {
  if (config.provider === "ollama") {
    if (!config.features.ollama) {
      throw new ConfigError(
        `The "ollama" provider is not available in this build. ` +
          `Configure an API-key provider instead: provider "openai" with a baseUrl and apiKeyEnv.`,
      );
    }
    const apiKey = config.ollama.apiKeyEnv ? process.env[config.ollama.apiKeyEnv] : undefined;
    return new OllamaProvider({
      baseUrl: config.ollama.baseUrl,
      timeoutMs: config.ollama.timeoutMs,
      numCtx: config.ollama.numCtx,
      keepAlive: config.ollama.keepAlive,
      apiKey,
      headers: config.ollama.headers,
    });
  }

  const endpoint = resolveEndpoint(config);
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
