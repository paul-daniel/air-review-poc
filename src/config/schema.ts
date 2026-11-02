import { z } from "zod";
import { PRESET_IDS } from "../model/presets.js";

export const SEVERITY_LEVEL = z.enum(["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "INFO"]);

export const PROVIDER_KIND = z.string().refine((value) => PRESET_IDS.includes(value), {
  message: `Unknown provider. Available: ${PRESET_IDS.join(", ")}`,
});

const endpointSchema = z.object({
  temperature: z.number().min(0).max(2).nullable().optional(),
  maxTokensParameter: z.enum(["max_tokens", "max_completion_tokens"]).optional(),
  baseUrl: z.string().optional(),
  /**
   * How the credential travels. "api-key" uses the preset header (Azure: `api-key`,
   * others: `Authorization: Bearer`). "bearer" forces `Authorization: Bearer <token>`,
   * which is what a Microsoft Entra ID access token or any OAuth gateway expects.
   */
  auth: z.enum(["api-key", "bearer"]).optional(),
  /**
   * Wire protocol. "chat-completions" is what every vendor shares; "responses"
   * is OpenAI's newer API, required by some deployments (gpt-5-codex on Azure).
   * "auto" (default) starts with chat completions and switches a model to the
   * Responses API when the endpoint reports the operation as unsupported.
   */
  api: z.enum(["auto", "chat-completions", "responses"]).optional(),
  apiKeyEnv: z.string().optional(),
  /** Direct key value; prefer apiKeyEnv so secrets stay in the environment. */
  apiKey: z.string().optional(),
  /** Header used to carry the key: "authorization" (default) or "api-key" (Azure). */
  apiKeyHeader: z.string().optional(),
  /** Prefix for the key value: "Bearer " (default) or "" (Azure). */
  apiKeyPrefix: z.string().optional(),
  /** Chat completion path; preset defaults, override for unusual gateways. */
  chatPath: z.string().optional(),
  /** Model listing path; ignored when listModels is false. */
  modelsPath: z.string().optional(),
  /** Some endpoints (Azure OpenAI) do not expose a compatible /models route. */
  listModels: z.boolean().optional(),
  timeoutMs: z.number().int().positive().default(120_000),
  headers: z.record(z.string()).default({}),
});

const ollamaSchema = z.object({
  baseUrl: z.string().url().default("http://127.0.0.1:11434"),
  timeoutMs: z.number().int().positive().default(180_000),
  numCtx: z.number().int().positive().optional(),
  keepAlive: z.union([z.string(), z.number()]).optional(),
  /** Bearer token for authenticated/remote Ollama (e.g. Ollama Cloud). */
  apiKeyEnv: z.string().optional(),
  /** Extra headers (proxies, gateways). */
  headers: z.record(z.string()).default({}),
});

const openaiSchema = z.object({
  baseUrl: z.string().url().optional(),
  apiKeyEnv: z.string().optional(),
  /** Direct key value; prefer apiKeyEnv so secrets stay in the environment. */
  apiKey: z.string().optional(),
  /** Header used to carry the key: "authorization" (default) or "api-key" (Azure). */
  apiKeyHeader: z.string().optional(),
  /** Prefix for the key value: "Bearer " (default) or "" (Azure). */
  apiKeyPrefix: z.string().optional(),
  /** Chat completion path; override for deployment-style URLs (Azure OpenAI). */
  chatPath: z.string().optional(),
  /** Model listing path; ignored when listModels is false. */
  modelsPath: z.string().optional(),
  /** Some endpoints (Azure OpenAI) do not expose a compatible /models route. */
  listModels: z.boolean().optional(),
  headers: z.record(z.string()).default({}),
});

const featuresSchema = z.object({
  /**
   * Reserved, unsupported for now. The local-model provider stays behind this
   * flag so it is not reachable from normal configuration.
   */
  ollama: z.boolean().default(false),
});

const telemetrySchema = z.object({
  /** Append one JSON line per run to this file. */
  log: z.string().default(".air-review/telemetry.jsonl"),
  enabled: z.boolean().default(true),
  /** Optional prices in USD per 1M tokens, keyed by model name. */
  pricing: z
    .record(
      z.object({
        input: z.number().min(0),
        output: z.number().min(0),
        cachedInput: z.number().min(0).optional(),
      }),
    )
    .default({}),
});

const modelsSchema = z.object({
  default: z.string().optional(),
  roles: z
    .object({
      planner: z.string().optional(),
      reviewer: z.string().optional(),
      verifier: z.string().optional(),
    })
    .default({}),
});

const contextSchema = z.object({
  strategy: z.enum(["structural-selective"]).default("structural-selective"),
  semanticFallback: z.boolean().default(false),
  maxContextRequests: z.number().int().min(1).max(200).default(20),
  maxEvidenceTokens: z.number().int().min(1_000).max(500_000).default(30_000),
});

const reviewSchema = z.object({
  severities: z
    .object({
      publish: z.array(SEVERITY_LEVEL).default(["BLOCKER", "CRITICAL", "MAJOR", "MINOR"]),
    })
    .default({}),
  gate: z
    .object({
      severities: z.array(SEVERITY_LEVEL).default(["BLOCKER", "CRITICAL"]),
      minimumConfidence: z.number().min(0).max(1).default(0.9),
    })
    .default({}),
  maxFindings: z.number().int().min(1).max(100).default(40),
  /**
   * Output budget of the reviewer call. Reasoning models (gpt-5, o-series,
   * DeepSeek-R) spend most of it on hidden reasoning, so 4k is not enough for
   * a real pull request; 16k keeps the worst-case output cost around a few
   * cents while leaving room for the findings JSON.
   */
  maxOutputTokens: z.number().int().min(1_000).max(128_000).default(16_384),
});

const memorySchema = z.object({
  backend: z.enum(["pr-ledger", "local", "none"]).default("pr-ledger"),
});

const cacheSchema = z.object({
  enabled: z.boolean().default(true),
  dir: z.string().default(".air-review/cache"),
});

const privacySchema = z.object({
  redactSecrets: z.boolean().default(true),
  sendFullFiles: z.boolean().default(false),
});

const platformSchema = z.object({
  provider: z.enum(["github", "azure-devops", "local"]).default("local"),
  publish: z.boolean().default(false),
  github: z
    .object({
      owner: z.string().optional(),
      repo: z.string().optional(),
      tokenEnv: z.string().default("GITHUB_TOKEN"),
      apiBaseUrl: z.string().url().optional(),
    })
    .default({}),
  azureDevops: z
    .object({
      /** Organization URL, e.g. https://dev.azure.com/acme; detected from SYSTEM_TEAMFOUNDATIONCOLLECTIONURI in Azure Pipelines. */
      organizationUrl: z.string().url().optional(),
      /** Project name or id; detected from SYSTEM_TEAMPROJECT. */
      project: z.string().optional(),
      /** Repository name or GUID; detected from BUILD_REPOSITORY_ID. */
      repository: z.string().optional(),
      /** Env var holding the PAT or $(System.AccessToken); AZURE_DEVOPS_EXT_PAT and AZURE_DEVOPS_TOKEN are fallbacks. */
      tokenEnv: z.string().default("SYSTEM_ACCESSTOKEN"),
      /** REST api-version the adapter was written against. */
      apiVersion: z.string().default("7.1"),
    })
    .default({}),
  local: z
    .object({
      base: z.string().optional(),
    })
    .default({}),
});

export const configSchema = z
  .object({
    version: z.literal(1).default(1),
    frameworks: z.array(z.string().min(1)).default(["angular"]),
    provider: PROVIDER_KIND.default("openai"),
    endpoint: endpointSchema.default({}),
    models: modelsSchema.default({}),
    ollama: ollamaSchema.default({}),
    openai: openaiSchema.default({}),
    features: featuresSchema.default({}),
    telemetry: telemetrySchema.default({}),
    context: contextSchema.default({}),
    review: reviewSchema.default({}),
    memory: memorySchema.default({}),
    cache: cacheSchema.default({}),
    privacy: privacySchema.default({}),
    platform: platformSchema.default({}),
  })
  .strict();

export type AirReviewConfig = z.output<typeof configSchema>;

export const CONFIG_FILE_NAMES = ["air-review.yaml", "air-review.yml", "air-review.json", "air-review.toml"];
