import { describe, expect, it } from "vitest";
import { redactConfig } from "../src/config/redact.js";

describe("redactConfig", () => {
  it("masks secret-like keys and keeps a short tail for identification", () => {
    const redacted = redactConfig({
      endpoint: { apiKey: "sk-1234567890abcdef", baseUrl: "https://api.example.com" },
      platform: { github: { tokenEnv: "GITHUB_TOKEN" } },
    }) as Record<string, Record<string, unknown>>;
    expect(redacted.endpoint?.apiKey).toBe("***cdef");
    expect(redacted.endpoint?.baseUrl).toBe("https://api.example.com");
  });

  it("masks nested and array values without touching normal strings", () => {
    const redacted = redactConfig({
      headers: { authorization: "Bearer abcdefgh" },
      models: { roles: { reviewer: "gpt-4.1" } },
    }) as Record<string, Record<string, unknown>>;
    expect(redacted.headers?.authorization).toBe("***efgh");
    expect(redacted.models?.roles).toEqual({ reviewer: "gpt-4.1" });
  });

  it("masks very short secrets completely", () => {
    const redacted = redactConfig({ apiKey: "abc" }) as Record<string, unknown>;
    expect(redacted.apiKey).toBe("***");
  });
});
