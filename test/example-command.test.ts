import { describe, expect, it } from "vitest";
import { renderExamples, EXAMPLE_TOPICS } from "../src/cli/commands/example.js";
import { VISIBLE_PRESET_IDS } from "../src/model/presets.js";
import { ConfigError } from "../src/errors.js";

describe("air-review example", () => {
  it("defaults to a short provider overview with topic pointers", () => {
    const output = renderExamples();
    expect(output).toContain("Providers");
    expect(output).toContain("docs/providers.md");
    expect(output).toContain("Topics:");
    // Gatekeeping: the default view must stay compact.
    expect(output.split("\n").length).toBeLessThan(40);
  });

  it("renders a vendor-specific snippet with config and env equivalents", () => {
    const output = renderExamples("azure-openai");
    expect(output).toContain("apiKeyHeader: api-key");
    expect(output).toContain('apiKeyPrefix: ""');
    expect(output).toContain("AIR_REVIEW_PROVIDER=azure-openai");
    expect(output).toContain("air-review doctor");
  });

  it("covers CI, config and local flows", () => {
    expect(renderExamples("ci-github")).toContain("github.token");
    expect(renderExamples("ci-azure")).toContain("SYSTEM_ACCESSTOKEN: $(System.AccessToken)");
    expect(renderExamples("ci-azure")).toContain("fetchDepth: 0");
    expect(renderExamples("ci-azure")).toContain("Contribute to pull requests");
    expect(renderExamples("config")).toContain("air-review config set");
    expect(renderExamples("local")).toContain("merge base");
  });

  it("--all includes every visible provider preset", () => {
    const output = renderExamples(undefined, true);
    for (const preset of VISIBLE_PRESET_IDS) {
      expect(output, `missing ${preset}`).toContain(`provider: ${preset}`);
    }
  });

  it("rejects unknown topics with the available list", () => {
    expect(() => renderExamples("kubernetes")).toThrow(ConfigError);
    expect(() => renderExamples("kubernetes")).toThrow(/Available: providers/);
    expect(EXAMPLE_TOPICS).toContain("ci-github");
  });
});
