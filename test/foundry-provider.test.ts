import { describe, expect, it, vi } from "vitest";
import { FoundryProvider, foundryBaseUrls, splitDeployment } from "../src/model/foundry.js";
import { FoundryAgentProvider } from "../src/model/foundry-agent.js";
import { resolveAzureCredential } from "../src/model/azure-credential.js";
import { createProvider } from "../src/model/provider.js";
import { defaultConfig } from "../src/config/defaults.js";
import { ModelError } from "../src/errors.js";

/** Fake SDK doors: record what the provider sends, answer like the real services. */
function fakeDoors(options: { unsupportedChat?: boolean } = {}) {
  const calls: Array<{ door: string; body: Record<string, unknown>; options?: unknown }> = [];
  const openai = {
    chat: {
      completions: {
        create: vi.fn(async (body: Record<string, unknown>) => {
          calls.push({ door: "chat", body });
          if (options.unsupportedChat) {
            throw Object.assign(new Error("400 The requested operation is unsupported."), { status: 400 });
          }
          return {
            choices: [{ message: { content: '{"findings":[]}' } }],
            usage: {
              prompt_tokens: 120,
              completion_tokens: 8,
              prompt_tokens_details: { cached_tokens: 100 },
            },
          };
        }),
      },
    },
    responses: {
      create: vi.fn(async (body: Record<string, unknown>, opts?: unknown) => {
        calls.push({ door: "responses", body, options: opts });
        return {
          status: "completed",
          output: [{ type: "message", content: [{ type: "output_text", text: '{"verdicts":[]}' }] }],
          usage: { input_tokens: 50, output_tokens: 20, output_tokens_details: { reasoning_tokens: 12 } },
        };
      }),
    },
  };
  const anthropic = {
    messages: {
      create: vi.fn(async (body: Record<string, unknown>) => {
        calls.push({ door: "anthropic", body });
        return {
          content: [
            { type: "text", text: 'Here you go:\n{"tier":"light","confidence":0.9,"reasons":["tiny"]}' },
          ],
          usage: { input_tokens: 40, output_tokens: 15, cache_read_input_tokens: 10 },
          stop_reason: "end_turn",
        };
      }),
    },
  };
  return { calls, openai, anthropic };
}

describe("Foundry endpoint shapes", () => {
  it("derives the OpenAI and Anthropic doors from any documented endpoint", () => {
    expect(foundryBaseUrls("https://res.services.ai.azure.com")).toEqual({
      openai: "https://res.services.ai.azure.com/openai/v1",
      anthropic: "https://res.services.ai.azure.com/anthropic",
      resource: "https://res.services.ai.azure.com",
    });
    expect(foundryBaseUrls("https://res.openai.azure.com/openai/v1/").openai).toBe(
      "https://res.openai.azure.com/openai/v1",
    );
    expect(foundryBaseUrls("https://res.services.ai.azure.com/api/projects/p")).toMatchObject({
      openai: "https://res.services.ai.azure.com/api/projects/p/openai/v1",
      anthropic: "https://res.services.ai.azure.com/anthropic",
    });
  });

  it("recognises Claude deployments by prefix or by name", () => {
    expect(splitDeployment("claude:my-haiku")).toEqual({ door: "anthropic", deployment: "my-haiku" });
    expect(splitDeployment("claude-sonnet-4-5")).toEqual({
      door: "anthropic",
      deployment: "claude-sonnet-4-5",
    });
    expect(splitDeployment("gpt-5-mini")).toEqual({ door: "openai", deployment: "gpt-5-mini" });
  });
});

describe("Azure credential resolution", () => {
  it("prefers an API key, then a provided access token", async () => {
    expect(await resolveAzureCredential({ apiKey: "k", apiKeyEnv: "AZURE_AI_API_KEY" })).toMatchObject({
      kind: "api-key",
      apiKey: "k",
    });
    const token = await resolveAzureCredential({
      apiKey: "eyJ.tok",
      apiKeyEnv: "AIR_REVIEW_ACCESS_TOKEN",
      auth: "bearer",
    });
    expect(token.kind).toBe("access-token");
    expect(await token.tokenProvider!()).toBe("eyJ.tok");
    expect((await token.credential!.getToken("https://ai.azure.com/.default"))?.token).toBe("eyJ.tok");
  });

  it("falls back to keyless Microsoft Entra ID (DefaultAzureCredential)", async () => {
    const keyless = await resolveAzureCredential({});
    expect(keyless.kind).toBe("entra-id");
    expect(keyless.description).toMatch(/DefaultAzureCredential/);
    expect(typeof keyless.tokenProvider).toBe("function");
  });
});

describe("FoundryProvider", () => {
  function provider(
    doors: ReturnType<typeof fakeDoors>,
    api: "auto" | "chat-completions" | "responses" = "auto",
  ) {
    return new FoundryProvider({
      endpoint: "https://res.services.ai.azure.com",
      apiKey: "key",
      apiKeyEnv: "AZURE_AI_API_KEY",
      api,
      timeoutMs: 1000,
      clients: { openai: doors.openai, anthropic: doors.anthropic },
    });
  }

  it("calls the OpenAI door with the deployment name and maps usage", async () => {
    const doors = fakeDoors();
    const result = await provider(doors).structured({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: "policy" },
        { role: "user", content: "diff" },
      ],
      shapeHint: "review findings",
      parse: (raw) => raw as { findings: unknown[] },
    });
    expect(doors.calls[0]).toMatchObject({
      door: "chat",
      body: { model: "gpt-5-mini", response_format: { type: "json_object" } },
    });
    expect(result.usage).toMatchObject({ inputTokens: 120, outputTokens: 8, cachedInputTokens: 100 });
    expect(result.data.findings).toEqual([]);
  });

  it("switches a deployment to the Responses API after a 400 'unsupported' (auto mode)", async () => {
    const doors = fakeDoors({ unsupportedChat: true });
    const p = provider(doors);
    const result = await p.generate({
      model: "gpt-5-codex",
      messages: [{ role: "user", content: "hi" }],
      maxOutputTokens: 500,
    });
    expect(doors.calls.map((c) => c.door)).toEqual(["chat", "responses"]);
    expect(doors.calls[1]!.body).toMatchObject({
      model: "gpt-5-codex",
      max_output_tokens: 500,
      store: false,
    });
    expect(result.usage).toMatchObject({ inputTokens: 50, outputTokens: 20, reasoningTokens: 12 });
    // Learned once: the next call goes straight to /responses.
    await p.generate({ model: "gpt-5-codex", messages: [{ role: "user", content: "again" }] });
    expect(doors.calls.map((c) => c.door)).toEqual(["chat", "responses", "responses"]);
  });

  it("calls the Anthropic door for Claude deployments, with the system prompt apart and JSON extracted from prose", async () => {
    const doors = fakeDoors();
    const result = await provider(doors).structured({
      model: "claude:claude-haiku-4-5",
      messages: [
        { role: "system", content: "You are the Triage role." },
        { role: "user", content: "pre-assessment: light" },
      ],
      maxOutputTokens: 400,
      shapeHint: "triage decision",
      parse: (raw) => raw as { tier: string },
    });
    expect(doors.calls[0]).toMatchObject({
      door: "anthropic",
      body: { model: "claude-haiku-4-5", system: "You are the Triage role.", max_tokens: 400 },
    });
    expect((doors.calls[0]!.body.messages as unknown[]).length).toBe(1);
    expect(result.data.tier).toBe("light");
    expect(result.usage).toMatchObject({ inputTokens: 40, outputTokens: 15, cachedInputTokens: 10 });
  });

  it("explains auth and deployment errors in Foundry terms", async () => {
    const doors = fakeDoors();
    doors.openai.chat.completions.create.mockRejectedValueOnce(
      Object.assign(new Error("Unauthorized"), { status: 401 }),
    );
    await expect(provider(doors).generate({ model: "gpt-5", messages: [] })).rejects.toThrow(
      /Azure AI User|az login/,
    );
    doors.openai.chat.completions.create.mockRejectedValueOnce(
      Object.assign(new Error("not found"), { status: 404 }),
    );
    await expect(provider(doors).generate({ model: "typo", messages: [] })).rejects.toThrow(
      /Unknown deployment name/,
    );
  });

  it("is selected for the Foundry presets by the factory", () => {
    const config = defaultConfig();
    config.provider = "azure-foundry";
    config.endpoint.baseUrl = "https://res.services.ai.azure.com";
    expect(createProvider(config)).toBeInstanceOf(FoundryProvider);
    config.provider = "azure-openai";
    config.endpoint.baseUrl = "https://res.openai.azure.com";
    expect(createProvider(config)).toBeInstanceOf(FoundryProvider);
  });
});

describe("FoundryAgentProvider", () => {
  it("invokes the named prompt agent through the project's OpenAI client with an agent_reference", async () => {
    const doors = fakeDoors();
    const p = new FoundryAgentProvider({
      projectEndpoint: "https://res.services.ai.azure.com/api/projects/reviews/",
      apiKey: "eyJ.tok",
      auth: "bearer",
      timeoutMs: 1000,
      clients: {
        openai: doors.openai,
        listAgents: async () => ["air-review-reviewer", "air-review-verifier"],
      },
    });
    expect((await p.listModels()).map((m) => m.name)).toEqual(["air-review-reviewer", "air-review-verifier"]);
    const result = await p.structured({
      model: "air-review-verifier",
      messages: [
        { role: "system", content: "verifier policy" },
        { role: "user", content: "findings" },
      ],
      shapeHint: "verifier verdicts",
      parse: (raw) => raw as { verdicts: unknown[] },
    });
    const call = doors.calls[0]!;
    expect(call.door).toBe("responses");
    expect(call.options).toEqual({
      body: { agent_reference: { name: "air-review-verifier", type: "agent_reference" } },
    });
    expect((call.body.input as Array<{ role: string }>).map((m) => m.role)).toEqual(["user", "user"]);
    expect(result.data.verdicts).toEqual([]);
  });

  it("refuses a non-project endpoint", () => {
    expect(
      () => new FoundryAgentProvider({ projectEndpoint: "https://res.services.ai.azure.com", timeoutMs: 1 }),
    ).toThrow(ModelError);
  });
});
