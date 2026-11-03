import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config/defaults.js";
import { GitRepository } from "../src/context/repository.js";
import { LocalAdapter } from "../src/scm/local.js";
import { LocalCache } from "../src/cache/local.js";
import { MockProvider } from "../src/model/mock.js";
import type { ModelProvider, StructuredRequest } from "../src/contracts/model.js";
import { runReview, type ReviewOptions } from "../src/review/pipeline.js";

/**
 * Cache and incremental behaviour, end to end on a real Git repository with
 * the offline mock provider:
 *   - a first push is reviewed in full and routed;
 *   - the same head is never reviewed twice;
 *   - a docs-only push costs no model call and keeps the findings;
 *   - a code push is reviewed incrementally and resolves fixed findings;
 *   - identical inputs are served from the local result cache.
 */

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function git(dir: string, args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
}

function commit(dir: string, files: Record<string, string>, message: string): string {
  for (const [path, body] of Object.entries(files)) writeFileSync(join(dir, path), body);
  git(dir, ["add", "-A"]);
  git(dir, ["-c", "commit.gpgsign=false", "commit", "-qm", message]);
  return git(dir, ["rev-parse", "HEAD"]);
}

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "air-review-pipeline-"));
  dirs.push(dir);
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "test"]);
  commit(
    dir,
    { ".gitignore": ".air-review/\n", "app.ts": "export const value = 1;\n", "README.md": "# demo\n" },
    "base",
  );
  git(dir, ["switch", "-qc", "feature"]);
  return dir;
}

/** Counts structured calls per role so tests can assert "no model call". */
function counting(provider: ModelProvider): { provider: ModelProvider; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    provider: {
      id: provider.id,
      capabilities: () => provider.capabilities(),
      listModels: () => provider.listModels(),
      generate: (request) => provider.generate(request),
      structured<T>(request: StructuredRequest<T>) {
        calls.push(request.shapeHint ?? "?");
        return provider.structured(request);
      },
    },
  };
}

const models = {
  triage: "mock-small",
  planner: "mock-small",
  reviewer: "mock-large",
  verifier: "mock-small",
};

async function review(
  dir: string,
  counted: ReturnType<typeof counting>,
  overrides: Partial<ReviewOptions> = {},
) {
  const config = defaultConfig();
  config.provider = "mock";
  config.telemetry.enabled = false;
  config.telemetry.pricing = {
    "mock-large": { input: 1, output: 2 },
    "mock-small": { input: 0.1, output: 0.2 },
  };
  config.observability.reportDir = join(dir, ".air-review", "reports");
  config.models.tiers.light.reviewer = "mock-small";
  const gitRepo = await GitRepository.discover(dir);
  const scm = new LocalAdapter({ repo: gitRepo, base: "main", stateDir: ".air-review" });
  const cache = new LocalCache(join(dir, ".air-review", "cache"));
  return runReview(
    {
      ci: "local",
      publish: false,
      force: false,
      deterministicOnly: false,
      skipLlmVerifier: false,
      noCache: false,
      modelOverrides: {},
      ...overrides,
    },
    { config, provider: counted.provider, models, scm, git: gitRepo, cache },
  );
}

describe("incremental review and caching", () => {
  it("reviews a first push in full, routes it, and writes the run report", async () => {
    const dir = repo();
    commit(
      dir,
      {
        "widget.ts": "export const a = 1;\n// air-review:expect MAJOR correctness demo.rule: Demo finding\n",
      },
      "feature",
    );
    const counted = counting(new MockProvider());
    const outcome = await review(dir, counted);

    expect(outcome.skipped).toBe(false);
    expect(counted.calls).toEqual(["review findings", "verifier verdicts"]);
    expect(outcome.findings).toHaveLength(1);
    expect(outcome.findings[0]).toMatchObject({ severity: "MAJOR", category: "correctness", status: "OPEN" });
    expect(outcome.summary.verdict).toBe("request-changes"); // a MAJOR blocks approval
    expect(outcome.summary.metrics.routing).toMatchObject({
      tier: "light",
      reviewerModel: "mock-small",
      method: "deterministic",
    });
    const steps = outcome.summary.metrics.trace!.steps.map((s) => `${s.id}:${s.status}`);
    expect(steps).toContain("triage:done");
    expect(steps).toContain("review.model:done");
    expect(steps).toContain("verify.model:done");
    expect(outcome.summary.metrics.estimatedCostUsd).toBeGreaterThan(0);
    expect(outcome.summary.workflowDiagram).toContain("flowchart TD");
    expect(outcome.report && existsSync(outcome.report.markdown)).toBe(true);
    expect(readFileSync(outcome.report!.markdown, "utf8")).toContain("## Routing");
  });

  it("never reviews the same head twice", async () => {
    const dir = repo();
    commit(
      dir,
      {
        "widget.ts": "export const a = 1;\n// air-review:expect MAJOR correctness demo.rule: Demo finding\n",
      },
      "feature",
    );
    await review(dir, counting(new MockProvider()));
    const counted = counting(new MockProvider());
    const again = await review(dir, counted, { publish: true });
    expect(again.skipped).toBe(true);
    expect(counted.calls).toEqual([]);
    expect(again.summary.skippedReason).toMatch(/already reviewed/);
    expect(again.findings).toHaveLength(1);
    expect(again.summary.metrics.trace!.steps.find((s) => s.id === "review.model")?.status).toBe("skipped");
  });

  it("costs no model call when a new push only touches docs, and keeps the findings", async () => {
    const dir = repo();
    commit(
      dir,
      {
        "widget.ts": "export const a = 1;\n// air-review:expect MAJOR correctness demo.rule: Demo finding\n",
      },
      "feature",
    );
    const first = await review(dir, counting(new MockProvider()));
    commit(dir, { "README.md": "# demo\n\nRelease notes.\n" }, "docs only");
    const counted = counting(new MockProvider());
    const second = await review(dir, counted);
    expect(second.skipped).toBe(false);
    expect(counted.calls).toEqual([]);
    expect(second.summary.metrics.modelCalls).toBe(0);
    expect(second.warnings.join("\n")).toMatch(/Nothing new for the reviewer/);
    expect(second.findings.map((f) => `${f.id}:${f.status}`)).toEqual(
      first.findings.map((f) => `${f.id}:OPEN`),
    );
    expect(second.summary.metrics.trace!.steps.find((s) => s.id === "delta")?.detail).toMatch(
      /incremental since/,
    );
  });

  it("reviews only the delta since the last reviewed head and resolves fixed findings", async () => {
    const dir = repo();
    commit(
      dir,
      {
        "widget.ts": "export const a = 1;\n// air-review:expect MAJOR correctness demo.rule: Demo finding\n",
      },
      "feature",
    );
    const first = await review(dir, counting(new MockProvider()));
    const previousHead = git(dir, ["rev-parse", "HEAD"]);
    commit(dir, { "widget.ts": "export const a = 1;\n" }, "fix");
    const counted = counting(new MockProvider());
    const second = await review(dir, counted);
    expect(counted.calls).toEqual(["review findings"]); // no candidate left to verify
    expect(second.summary.metrics.trace!.steps.find((s) => s.id === "delta")?.detail).toContain(
      `incremental since ${previousHead.slice(0, 8)}`,
    );
    expect(second.findings).toHaveLength(1);
    expect(second.findings[0]).toMatchObject({ id: first.findings[0]!.id, status: "RESOLVED" });
    expect(second.summary.events?.map((e) => e.event)).toEqual(["resolved"]);
    expect(second.summary.verdict).toBe("approve");
    expect(second.summary.resolved).toBe(1);
  });

  it("serves identical reviewer inputs from the local cache on --force", async () => {
    const dir = repo();
    commit(
      dir,
      { "widget.ts": "export const a = 1;\n// air-review:expect MINOR docs demo.rule: Demo finding\n" },
      "feature",
    );
    await review(dir, counting(new MockProvider()));
    const counted = counting(new MockProvider());
    const forced = await review(dir, counted, { force: true });
    expect(forced.skipped).toBe(false);
    expect(counted.calls).toEqual(["verifier verdicts"]);
    expect(forced.summary.metrics.cacheHits).toBe(1);
    expect(forced.summary.metrics.trace!.steps.find((s) => s.id === "review.model")?.status).toBe("cached");
  });
});
