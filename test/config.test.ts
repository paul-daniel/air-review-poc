import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/loader.js";
import { configGet, configSet } from "../src/config/access.js";
import { ConfigError } from "../src/errors.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "air-review-config-"));
  dirs.push(dir);
  return dir;
}

describe("config loader", () => {
  it("returns defaults when no file exists", () => {
    const dir = tempDir();
    const previousCwd = process.cwd();
    process.chdir(dir);
    try {
      const { config, path } = loadConfig();
      expect(path).toBeNull();
      expect(config.frameworks).toEqual(["angular"]);
      expect(config.provider).toBe("openai");
      expect(config.features.ollama).toBe(false);
      expect(config.ollama.baseUrl).toBe("http://127.0.0.1:11434");
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("parses yaml and applies documented defaults", () => {
    const dir = tempDir();
    const file = join(dir, "air-review.yaml");
    writeFileSync(file, "models:\n  roles:\n    reviewer: llama3.1\n");
    const { config } = loadConfig(file);
    expect(config.models.roles.reviewer).toBe("llama3.1");
    expect(config.provider).toBe("openai");
    expect(config.review.gate.minimumConfidence).toBe(0.9);
  });

  it("rejects unknown keys with a helpful message", () => {
    const dir = tempDir();
    const file = join(dir, "air-review.yaml");
    writeFileSync(file, "modells:\n  roles: {}\n");
    expect(() => loadConfig(file)).toThrow(ConfigError);
  });

  it("applies environment overrides on top of the file", () => {
    const previous = { ...process.env };
    process.env.AIR_REVIEW_MODEL = "env-model";
    process.env.OLLAMA_HOST = "http://example.test:11434";
    process.env.AIR_REVIEW_BASE_URL = "https://gateway.example.com/v1";
    process.env.AIR_REVIEW_API_KEY = "env-key";
    process.env.AIR_REVIEW_PROVIDER = "openai";
    try {
      const dir = tempDir();
      const previousCwd = process.cwd();
      process.chdir(dir);
      try {
        const { config } = loadConfig();
        expect(config.models.roles.reviewer).toBe("env-model");
        expect(config.ollama.baseUrl).toBe("http://example.test:11434");
        expect(config.endpoint.baseUrl).toBe("https://gateway.example.com/v1");
        expect(config.endpoint.apiKey).toBe("env-key");
        expect(config.provider).toBe("openai");
      } finally {
        process.chdir(previousCwd);
      }
    } finally {
      process.env = previous;
    }
  });

  it("get and set preserve comments in the file", () => {
    const dir = tempDir();
    const file = join(dir, "air-review.yaml");
    writeFileSync(file, "# keep me\nprovider: ollama\n");
    configSet(file, "models.roles.reviewer", "qwen3:14b");
    configSet(file, "review.gate.minimumConfidence", "0.95");
    configSet(file, "cache.enabled", "false");
    expect(configGet(loadConfig(file).config, "models.roles.reviewer")).toBe("qwen3:14b");
    expect(configGet(loadConfig(file).config, "cache.enabled")).toBe("false");
    expect(configGet(loadConfig(file).config, "review.gate.minimumConfidence")).toBe("0.95");
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, "utf8")).toContain("# keep me");
  });

  it("loads TOML configs", () => {
    const dir = tempDir();
    const file = join(dir, "air-review.toml");
    writeFileSync(
      file,
      [
        'provider = "openai"',
        "",
        "[openai]",
        'baseUrl = "https://llm.example.com/v1"',
        "",
        "[models.roles]",
        'reviewer = "big-model"',
        "",
      ].join("\n"),
    );
    const { config } = loadConfig(file);
    expect(config.provider).toBe("openai");
    expect(config.openai.baseUrl).toBe("https://llm.example.com/v1");
    expect(config.models.roles.reviewer).toBe("big-model");
  });

  it("edits TOML configs from the CLI helpers", () => {
    const dir = tempDir();
    const file = join(dir, "air-review.toml");
    writeFileSync(file, 'provider = "ollama"\n');
    configSet(file, "models.roles.reviewer", "qwen3:14b");
    configSet(file, "review.gate.minimumConfidence", "0.95");
    const reloaded = loadConfig(file).config;
    expect(reloaded.models.roles.reviewer).toBe("qwen3:14b");
    expect(reloaded.review.gate.minimumConfidence).toBe(0.95);
  });
});

describe("environment provider and pricing", () => {
  it.each(["azure-foundry", "azure-openai", "google", "bedrock", "openai-compatible"])(
    "accepts %s from environment",
    async (provider) => {
      const { applyEnvOverrides } = await import("../src/config/loader.js");
      const { defaultConfig } = await import("../src/config/defaults.js");
      const saved = { ...process.env };
      try {
        process.env.AIR_REVIEW_PROVIDER = provider;
        process.env.AIR_REVIEW_PRICING = '{"deployment":{"input":2,"cachedInput":0.5,"output":8}}';
        const config = applyEnvOverrides(defaultConfig());
        expect(config.provider).toBe(provider);
        expect(config.telemetry.pricing.deployment?.cachedInput).toBe(0.5);
      } finally {
        process.env = saved;
      }
    },
  );
  it("rejects an unknown provider and negative prices", async () => {
    const { applyEnvOverrides } = await import("../src/config/loader.js");
    const { defaultConfig } = await import("../src/config/defaults.js");
    const saved = { ...process.env };
    try {
      process.env.AIR_REVIEW_PROVIDER = "typo";
      expect(() => applyEnvOverrides(defaultConfig())).toThrow(ConfigError);
      process.env.AIR_REVIEW_PROVIDER = "azure-foundry";
      process.env.AIR_REVIEW_PRICING = '{"m":{"input":-1,"output":2}}';
      expect(() => applyEnvOverrides(defaultConfig())).toThrow(ConfigError);
    } finally {
      process.env = saved;
    }
  });
});
