import { afterEach, describe, expect, it, vi } from "vitest";
import { createProvider } from "../src/model/provider.js";
import { defaultConfig } from "../src/config/defaults.js";
import { ConfigError } from "../src/errors.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("provider gating", () => {
  it("rejects the ollama provider while its feature flag is off", () => {
    const config = defaultConfig();
    config.provider = "ollama";
    expect(() => createProvider(config)).toThrow(ConfigError);
    expect(() => createProvider(config)).toThrow(/not available in this build/i);
  });

  it("keeps the ollama provider reachable behind the reserved flag", () => {
    const config = defaultConfig();
    config.provider = "ollama";
    config.features.ollama = true;
    expect(createProvider(config).id).toBe("ollama");
  });
});

describe("openai-compatible endpoint shapes", () => {
  function captureFetch() {
    const calls: Array<{ url: string; headers: Record<string, string>; body: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({
          url: String(url),
          headers: (init.headers ?? {}) as Record<string, string>,
          body: init.body ? JSON.parse(String(init.body)) : undefined,
        });
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"findings":[]}' } }],
            usage: { prompt_tokens: 5, completion_tokens: 5 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );
    return calls;
  }

  it("uses bearer auth and the preset paths (no doubled /v1)", async () => {
    process.env.TEST_PROVIDER_KEY = "secret-key";
    try {
      const config = defaultConfig();
      config.openai.baseUrl = "https://api.example.com/v1";
      config.openai.apiKeyEnv = "TEST_PROVIDER_KEY";
      const provider = createProvider(config);
      const calls = captureFetch();
      await provider.generate({ model: "m", messages: [{ role: "user", content: "hi" }] });
      expect(calls[0]?.url).toBe("https://api.example.com/v1/chat/completions");
      expect(calls[0]?.headers.authorization).toBe("Bearer secret-key");
    } finally {
      delete process.env.TEST_PROVIDER_KEY;
    }
  });

  it("resolves vendor presets without any endpoint section", async () => {
    process.env.GEMINI_API_KEY = "gemini-secret";
    try {
      const config = defaultConfig();
      config.provider = "google";
      const provider = createProvider(config);
      const calls = captureFetch();
      await provider.generate({ model: "gemini-3.8-flash", messages: [{ role: "user", content: "hi" }] });
      expect(calls[0]?.url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
      expect(calls[0]?.headers.authorization).toBe("Bearer gemini-secret");
    } finally {
      delete process.env.GEMINI_API_KEY;
    }
  });

  it("requires a concrete endpoint URL for placeholder presets", () => {
    const config = defaultConfig();
    config.provider = "azure-openai";
    expect(() => createProvider(config)).toThrow(/concrete endpoint URL|endpoint\.baseUrl/i);
  });

  it("supports Azure OpenAI style endpoints (api-key header, deployment path)", async () => {
    process.env.AZURE_OPENAI_KEY = "azure-secret";
    try {
      const config = defaultConfig();
      config.openai.baseUrl = "https://my-resource.openai.azure.com/openai/deployments/my-deployment";
      config.openai.chatPath = "/chat/completions?api-version=2024-10-21";
      config.openai.apiKeyEnv = "AZURE_OPENAI_KEY";
      config.openai.apiKeyHeader = "api-key";
      config.openai.apiKeyPrefix = "";
      config.openai.listModels = false;
      const provider = createProvider(config);
      const calls = captureFetch();
      await provider.generate({ model: "ignored", messages: [{ role: "user", content: "hi" }] });
      expect(calls[0]?.url).toBe(
        "https://my-resource.openai.azure.com/openai/deployments/my-deployment/chat/completions?api-version=2024-10-21",
      );
      expect(calls[0]?.headers["api-key"]).toBe("azure-secret");
      expect(calls[0]?.headers.authorization).toBeUndefined();
    } finally {
      delete process.env.AZURE_OPENAI_KEY;
    }
  });
});

describe("provider token detail reporting", () => {
  it("preserves usage before structured output validation fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              choices: [{ message: { content: "not JSON" } }],
              usage: {
                prompt_tokens: 100,
                completion_tokens: 50,
                prompt_tokens_details: { cached_tokens: 40 },
                completion_tokens_details: { reasoning_tokens: 20 },
              },
            }),
          ),
      ),
    );
    const onUsage = vi.fn();
    await expect(
      createProvider(defaultConfig()).structured({ model: "m", messages: [], parse: (x) => x, onUsage }),
    ).rejects.toThrow(/valid JSON/);
    expect(onUsage).toHaveBeenCalledWith({
      inputTokens: 100,
      outputTokens: 50,
      cachedInputTokens: 40,
      reasoningTokens: 20,
      usageIncomplete: false,
    });
  });
  it("distinguishes unknown cache counts from zero", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              choices: [{ message: { content: "{}" } }],
              usage: { prompt_tokens: 100, completion_tokens: 50 },
            }),
          ),
      ),
    );
    const result = await createProvider(defaultConfig()).generate({ model: "m", messages: [] });
    expect(result.usage.cachedInputTokens).toBeUndefined();
    expect(result.usage.reasoningTokens).toBeUndefined();
    expect(result.usage.usageIncomplete).toBe(false);
  });
});

describe("Microsoft Foundry endpoint shapes and bearer auth", () => {
  it("appends /openai/v1 to every documented Azure endpoint shape", async () => {
    const { normalizeBaseUrl } = await import("../src/model/resolve.js");
    expect(normalizeBaseUrl("https://res.openai.azure.com/", "azure-openai")).toBe(
      "https://res.openai.azure.com/openai/v1",
    );
    expect(normalizeBaseUrl("https://res.services.ai.azure.com", "azure-foundry")).toBe(
      "https://res.services.ai.azure.com/openai/v1",
    );
    expect(normalizeBaseUrl("https://res.services.ai.azure.com/api/projects/my-proj", "azure-foundry")).toBe(
      "https://res.services.ai.azure.com/api/projects/my-proj/openai/v1",
    );
    expect(normalizeBaseUrl("https://res.cognitiveservices.azure.com", "azure-foundry")).toBe(
      "https://res.cognitiveservices.azure.com/openai/v1",
    );
    // New Foundry prints this for a resource without a project.
    expect(normalizeBaseUrl("https://res.services.ai.azure.com/api/projects/", "azure-foundry")).toBe(
      "https://res.services.ai.azure.com/openai/v1",
    );
    expect(normalizeBaseUrl("https://res.services.ai.azure.com/openai/v1/", "azure-foundry")).toBe(
      "https://res.services.ai.azure.com/openai/v1",
    );
    expect(normalizeBaseUrl("https://gateway.example.com/llm/", "openai-compatible")).toBe(
      "https://gateway.example.com/llm",
    );
  });

  it("sends an Entra ID access token as Authorization: Bearer even on Azure presets", async () => {
    const { resolveEndpoint } = await import("../src/model/resolve.js");
    const config = defaultConfig();
    config.provider = "azure-foundry";
    config.endpoint.baseUrl = "https://res.services.ai.azure.com/api/projects/p";
    config.endpoint.apiKey = "eyJ-token";
    config.endpoint.auth = "bearer";
    const endpoint = resolveEndpoint(config);
    expect(endpoint.apiKeyHeader).toBe("authorization");
    expect(endpoint.apiKeyPrefix).toBe("Bearer ");
    expect(endpoint.baseUrl).toBe("https://res.services.ai.azure.com/api/projects/p/openai/v1");

    config.endpoint.auth = undefined;
    const keyed = resolveEndpoint(config);
    expect(keyed.apiKeyHeader).toBe("api-key");
    expect(keyed.apiKeyPrefix).toBe("");
  });

  it("maps AIR_REVIEW_ACCESS_TOKEN to bearer auth from the environment", async () => {
    const { applyEnvOverrides } = await import("../src/config/loader.js");
    vi.stubEnv("AIR_REVIEW_ACCESS_TOKEN", "tok");
    const config = applyEnvOverrides(defaultConfig());
    expect(config.endpoint.auth).toBe("bearer");
    expect(config.endpoint.apiKey).toBe("tok");
    vi.unstubAllEnvs();
  });
});

describe("Responses API transport", () => {
  it("auto mode switches a deployment to /responses after a 400 'unsupported' and maps its usage", async () => {
    const { OpenAICompatibleProvider } = await import("../src/model/openai-compatible.js");
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      calls.push({ url, body });
      if (url.endsWith("/chat/completions")) {
        return new Response(
          JSON.stringify({ error: { message: "The requested operation is unsupported." } }),
          { status: 400 },
        );
      }
      return new Response(
        JSON.stringify({
          status: "completed",
          output: [{ type: "message", content: [{ type: "output_text", text: '{"findings":[]}' }] }],
          usage: {
            input_tokens: 50,
            output_tokens: 20,
            input_tokens_details: { cached_tokens: 10 },
            output_tokens_details: { reasoning_tokens: 5 },
          },
        }),
        { status: 200 },
      );
    });
    const provider = new OpenAICompatibleProvider({
      baseUrl: "https://res.services.ai.azure.com/openai/v1",
      apiKey: "k",
      apiKeyHeader: "api-key",
      apiKeyPrefix: "",
      chatPath: "/chat/completions",
      timeoutMs: 5000,
      temperature: null,
      maxTokensParameter: "max_completion_tokens",
    });
    const first = await provider.generate({
      model: "codex",
      messages: [
        { role: "system", content: "policy" },
        { role: "user", content: "diff" },
      ],
      format: "json",
      maxOutputTokens: 100,
    });
    expect(first.text).toBe('{"findings":[]}');
    expect(first.usage).toEqual({
      inputTokens: 50,
      outputTokens: 20,
      cachedInputTokens: 10,
      reasoningTokens: 5,
      usageIncomplete: false,
    });
    expect(calls.map((c) => c.url)).toEqual([
      "https://res.services.ai.azure.com/openai/v1/chat/completions",
      "https://res.services.ai.azure.com/openai/v1/responses",
    ]);
    expect(calls[1]?.body).toMatchObject({
      model: "codex",
      instructions: "policy",
      input: [{ type: "message", role: "user", content: "diff" }],
      text: { format: { type: "json_object" } },
      max_output_tokens: 100,
      store: false,
    });
    expect(calls[1]?.body).not.toHaveProperty("temperature");
    expect(provider.apiFor("codex")).toBe("responses");

    // The second call goes straight to /responses.
    await provider.generate({ model: "codex", messages: [{ role: "user", content: "again" }] });
    expect(calls).toHaveLength(3);
    expect(calls[2]?.url).toMatch(/\/responses$/);
  });
});

describe("Responses API incomplete answers", () => {
  it("records billed usage and explains an exhausted output budget", async () => {
    const { OpenAICompatibleProvider } = await import("../src/model/openai-compatible.js");
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({
            status: "incomplete",
            incomplete_details: { reason: "max_output_tokens" },
            output: [{ type: "reasoning" }],
            usage: {
              input_tokens: 3000,
              output_tokens: 4096,
              output_tokens_details: { reasoning_tokens: 4096 },
            },
          }),
          { status: 200 },
        ),
    );
    const provider = new OpenAICompatibleProvider({
      api: "responses",
      baseUrl: "https://r.test/openai/v1",
      timeoutMs: 1000,
    });
    const seen: unknown[] = [];
    await expect(
      provider.generate({
        model: "codex",
        messages: [{ role: "user", content: "x" }],
        maxOutputTokens: 4096,
        onUsage: (u) => seen.push(u),
      }),
    ).rejects.toThrow(/max_output_tokens.*review\.maxOutputTokens/s);
    expect(seen[0]).toMatchObject({ inputTokens: 3000, outputTokens: 4096, reasoningTokens: 4096 });
  });
});
