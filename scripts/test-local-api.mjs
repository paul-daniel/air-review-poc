/** End-to-end API-key path; no paid service and no publication. */
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDemo } from "./demo.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const parent = mkdtempSync(join(tmpdir(), "air-review-api-"));
const { dir, git } = createDemo(join(parent, "corpus"));
const cli = resolve(root, "dist/cli/index.js");
let mode = "ok";
const requests = [];
let lastReviewPrompt = "";
const server = http.createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  if (req.url !== "/openai/v1/chat/completions" || req.headers["api-key"] !== "local-test-key") {
    res.writeHead(401);
    res.end("{}");
    return;
  }
  const data = JSON.parse(body);
  requests.push(data);
  if (mode === "unauthorized") {
    res.writeHead(401);
    res.end('{"error":{"message":"Test invalid key"}}');
    return;
  }
  const verifier = data.messages[0].content.includes("Verifier role");
  if (!verifier) lastReviewPrompt = data.messages[1].content;
  const content = mode === "malformed" ? "not JSON" : verifier ? '{"verdicts":[]}' : '{"findings":[]}';
  res.setHeader("content-type", "application/json");
  res.end(
    JSON.stringify({
      choices: [{ message: { content } }],
      usage:
        mode === "missing-usage"
          ? undefined
          : {
              prompt_tokens: 1000,
              completion_tokens: 200,
              prompt_tokens_details: { cached_tokens: 400 },
              completion_tokens_details: { reasoning_tokens: 80 },
            },
    }),
  );
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
// Do not let credentials/config/CI from the invoking shell affect this test.
const cleanEnv = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !/^(AIR_REVIEW_|GITHUB_|GH_TOKEN|OLLAMA_)/.test(k)),
);
const env = {
  ...cleanEnv,
  AIR_REVIEW_PROVIDER: "azure-foundry",
  AIR_REVIEW_BASE_URL: `http://127.0.0.1:${server.address().port}/openai/v1`,
  AIR_REVIEW_API_KEY: "local-test-key",
  AIR_REVIEW_MODEL: "test-deployment",
  AIR_REVIEW_PRICING: JSON.stringify({ "test-deployment": { input: 2, cachedInput: 0.5, output: 8 } }),
};
const run = (...args) =>
  new Promise((done, reject) => {
    const child = spawn(
      process.execPath,
      [cli, "--plain", "review", "--ci", "local", "--base", "main", "--json", ...args],
      { cwd: dir, env },
    );
    let out = "",
      err = "";
    child.stdout.on("data", (c) => (out += c));
    child.stderr.on("data", (c) => (err += c));
    child.on("error", reject);
    child.on("close", (code) => {
      try {
        done({ code, data: JSON.parse(out) });
      } catch {
        reject(new Error(`${code}: ${out} ${err}`));
      }
    });
  });
const widget = (data) =>
  data.findings.find(
    (f) => f.ruleId === "angular.subscription-lifecycle" && f.anchor.file.endsWith("widget.component.ts"),
  );
let checks = 0;
const check = (label, fn) => {
  fn();
  checks++;
  console.log(`  ok  ${label}`);
};
try {
  let result = await run();
  check("Foundry API key, deployment, compatible reasoning parameters", () => {
    assert.equal(result.code, 0);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].model, "test-deployment");
    assert.equal(requests[0].max_completion_tokens, 16384);
    assert.equal(requests[0].temperature, undefined);
  });
  check("reported cache/reasoning subsets and cost without double charging", () => {
    assert.equal(result.data.metrics.inputTokens, 2000);
    assert.equal(result.data.metrics.cachedInputTokens, 800);
    assert.equal(result.data.metrics.reasoningTokens, 160);
    assert.equal(result.data.metrics.estimatedCostUsd, 0.006);
    assert.equal(result.data.metrics.byRole.reviewer.estimatedCostUsd, 0.003);
  });
  const id = widget(result.data)?.id;
  check("known defect, safe example and historical debt", () => {
    assert.ok(id);
    assert.equal(result.data.findings.filter((f) => f.ruleId === "angular.subscription-lifecycle").length, 1);
    assert.ok(result.data.warnings.some((w) => /injection/i.test(w)));
  });
  check("local report and memory exist without --publish", () => {
    for (const file of ["summary.md", "review.json", "context.md", "state.json", "telemetry.jsonl"]) {
      assert.ok(existsSync(join(dir, ".air-review", file)), file);
    }
    assert.match(readFileSync(join(dir, ".air-review/summary.md"), "utf8"), /0.0060/);
    assert.match(readFileSync(join(dir, ".air-review/context.md"), "utf8"), new RegExp(id));
  });
  result = await run();
  check("unchanged head skips with zero tokens and zero new cost", () => {
    assert.equal(result.data.skipped, true);
    assert.equal(result.data.metrics.inputTokens, 0);
    assert.equal(result.data.metrics.estimatedCostUsd, 0);
    assert.equal(requests.length, 2);
  });
  result = await run("--force", "--no-cache");
  check("--force re-reviews the complete PR diff", () => {
    assert.equal(result.code, 0);
    assert.ok(lastReviewPrompt.includes("diff --git"));
    assert.equal(widget(result.data)?.id, id);
  });
  git("checkout", "-q", "demo-02-unrelated");
  result = await run();
  check("same-file unrelated edit preserves finding and API context", () => {
    assert.equal(widget(result.data)?.status, "OPEN");
    assert.equal(widget(result.data)?.id, id);
    assert.ok(lastReviewPrompt.includes(id));
  });
  git("checkout", "-q", "demo-03-fixed");
  result = await run();
  check("fix resolves the stored finding", () => assert.equal(widget(result.data)?.status, "RESOLVED"));
  git("checkout", "-q", "demo-04-reopened");
  result = await run();
  check("regression reopens the same finding", () => {
    assert.equal(widget(result.data)?.status, "REOPENED");
    assert.equal(widget(result.data)?.id, id);
  });
  const beforeFailure = readFileSync(join(dir, ".air-review/state.json"), "utf8");
  mode = "malformed";
  result = await run("--force", "--no-cache");
  check("malformed billable answers retain usage and fail with exit 30", () => {
    assert.equal(result.code, 30);
    assert.equal(result.data.incomplete, true);
    assert.equal(result.data.metrics.estimatedCostUsd, 0.006);
    assert.equal(readFileSync(join(dir, ".air-review/state.json"), "utf8"), beforeFailure);
  });
  mode = "unauthorized";
  result = await run("--force", "--no-cache");
  check("API failure cannot be mistaken for a successful zero-cost review", () => {
    assert.equal(result.code, 30);
    assert.equal(result.data.metrics.usageIncomplete, true);
    assert.equal(result.data.metrics.estimatedCostUsd, undefined);
  });
  mode = "missing-usage";
  result = await run("--force", "--no-cache");
  check("missing provider usage makes cost unavailable", () => {
    assert.equal(result.data.metrics.usageIncomplete, true);
    assert.equal(result.data.metrics.estimatedCostUsd, undefined);
  });
  mode = "ok";
  // Exercise a blocking gate twice: skip must preserve the failing exit code.
  const { appendFileSync } = await import("node:fs");
  appendFileSync(
    join(dir, "air-review.yaml"),
    "review:\n  gate:\n    severities: [MAJOR]\n    minimumConfidence: 0.8\n",
  );
  result = await run();
  assert.equal(result.code, 10);
  result = await run();
  check("skipping a blocked review still exits 10", () => {
    assert.equal(result.data.skipped, true);
    assert.equal(result.code, 10);
  });
  console.log(`\n${checks} local API checks passed. Real cloud cost: $0 (synthetic usage).`);
} finally {
  await new Promise((r) => server.close(r));
  rmSync(parent, { recursive: true, force: true });
}
