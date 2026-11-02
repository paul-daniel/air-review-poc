/**
 * End-to-end smoke test for the air-review CLI.
 *
 * Runs against a fake Ollama HTTP server so the whole pipeline
 * (init -> doctor -> models -> review -> explain -> cache -> gate)
 * is exercised without any external service.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { createHash } from "node:crypto";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const cli = resolve(root, "dist/cli/index.js");

let failures = 0;
function check(label, condition, detail = "") {
  if (condition) {
    console.log(`  ok  ${label}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

// Async spawn so the fake HTTP server (running in this process) can answer
// the CLI subprocess's requests while we wait for it.
function run(args, options = {}) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [cli, ...args], {
      env: options.env ?? process.env,
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) => resolveRun({ code: code ?? 1, stdout, stderr }));
  });
}

// ---------------------------------------------------------------------------
// Fake Ollama server
// ---------------------------------------------------------------------------
function fakeOllama(overrides = {}) {
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      if (req.method === "GET" && req.url === "/api/tags") {
        res.end(
          JSON.stringify({
            models: [
              {
                name: "qwen3:4b",
                size: 4000000000,
                details: { parameter_size: "4.0B", quantization_level: "Q4_K_M" },
              },
              {
                name: "qwen3:14b",
                size: 9000000000,
                details: { parameter_size: "14B", quantization_level: "Q4_K_M" },
              },
            ],
          }),
        );
        return;
      }
      if (req.method === "POST" && req.url === "/api/chat") {
        const request = JSON.parse(body);
        const joined = request.messages.map((m) => m.content ?? "").join("\n");
        let content;
        if (joined.includes("Verifier role")) {
          content = JSON.stringify({ verdicts: [] });
        } else if (joined.includes("Review only the change")) {
          content = JSON.stringify(overrides.reviewerResponse ?? { findings: [] });
        } else {
          content = JSON.stringify({ findings: [] });
        }
        res.end(
          JSON.stringify({
            model: request.model,
            message: { role: "assistant", content },
            done: true,
            prompt_eval_count: 120,
            eval_count: 40,
          }),
        );
        return;
      }
      if (req.method === "GET" && req.url === "/v1/models") {
        res.end(
          JSON.stringify({
            data: [{ id: "fake-small" }, { id: "fake-large" }],
          }),
        );
        return;
      }
      if (req.method === "POST" && req.url === "/v1/chat/completions") {
        const request = JSON.parse(body);
        const joined = request.messages.map((m) => m.content ?? "").join("\n");
        let content;
        if (joined.includes("Verifier role")) {
          content = JSON.stringify({ verdicts: [] });
        } else if (joined.includes("Review only the change")) {
          content = JSON.stringify({
            findings: [
              {
                severity: "MINOR",
                confidence: 0.8,
                scope: "IN_PR",
                ruleOrigin: "HEURISTIC",
                ruleId: "e2e.env-configured",
                title: "Env-configured finding",
                summary: "This finding was produced through the env-configured provider.",
                file: "src/app/widget.component.ts",
                startLine: 7,
                endLine: 7,
                evidence: [],
              },
            ],
          });
        } else {
          content = JSON.stringify({ findings: [] });
        }
        res.end(
          JSON.stringify({
            id: "chatcmpl-e2e",
            object: "chat.completion",
            model: request.model,
            choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
            usage: { prompt_tokens: 90, completion_tokens: 30, total_tokens: 120 },
          }),
        );
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "not found" }));
    });
  });
  return new Promise((resolveServer) => {
    server.listen(0, "127.0.0.1", () => resolveServer(server));
  });
}

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------
const dir = mkdtempSync(join(tmpdir(), "air-review-e2e-"));
console.log(`workdir: ${dir}`);

function git(args) {
  execFileSync("git", args, { cwd: dir, stdio: "ignore" });
}
function write(path, content) {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), content);
}

git(["init", "-q", "-b", "main"]);
git(["config", "user.email", "e2e@example.com"]);
git(["config", "user.name", "e2e"]);

write(
  "package.json",
  JSON.stringify({ name: "e2e", dependencies: { "@angular/core": "^19.0.0", rxjs: "^7.8.0" } }),
);
write("tsconfig.json", JSON.stringify({ compilerOptions: { strict: true } }));
write(
  "src/app/orders/order-list.container.ts",
  [
    "import { Component, DestroyRef, inject } from '@angular/core';",
    "import { takeUntilDestroyed } from '@angular/core/rxjs-interop';",
    "@Component({ selector: 'app-order-list' })",
    "export class OrderListContainer {",
    "  ref = inject(DestroyRef);",
    "  go() { this.events$.pipe(takeUntilDestroyed(this.ref)).subscribe(); }",
    "}",
  ].join("\n"),
);
git(["add", "-A"]);
git(["commit", "-qm", "base"]);

git(["switch", "-qc", "feature/x"]);
write(
  "src/app/widget.component.ts",
  [
    "import { Component, inject } from '@angular/core';",
    "import { Api } from './api';",
    "@Component({ selector: 'app-widget' })",
    "export class WidgetComponent {",
    "  api = inject(Api);",
    "  go() {",
    "    this.api.events$.subscribe(() => {});",
    "  }",
    "}",
  ].join("\n"),
);
write(
  "src/app/api.ts",
  "import { Injectable } from '@angular/core';\nimport { Subject } from 'rxjs';\n@Injectable() export class Api { events$ = new Subject(); }\n",
);
git(["add", "-A"]);
git(["commit", "-qm", "add widget"]);

// init + config
const init = await run(["init", "--ci", "local"], { cwd: dir });
check(
  "init creates air-review.yaml",
  init.code === 0 && existsSync(join(dir, "air-review.yaml")),
  init.stderr,
);
check("init updates .gitignore", readFileSync(join(dir, ".gitignore"), "utf8").includes(".air-review/"));
check(
  "init defaults to API-key providers",
  readFileSync(join(dir, "air-review.yaml"), "utf8").includes("provider: openai"),
);
check(
  "init refuses the hidden local provider",
  (await run(["init", "--provider", "ollama", "--force"], { cwd: dir })).code === 20,
);

// CLI discoverability: examples, help, dry-run command
const exampleList = await run(["example"], { cwd: dir });
check(
  "example lists topics",
  exampleList.code === 0 && exampleList.stdout.includes("Topics:"),
  exampleList.stdout,
);
const exampleAzure = await run(["example", "azure-openai"], { cwd: dir });
check(
  "example renders a vendor snippet",
  exampleAzure.stdout.includes("apiKeyHeader: api-key"),
  exampleAzure.stdout,
);
const helpReview = await run(["help", "review"], { cwd: dir });
check(
  "help <command> shows examples",
  helpReview.code === 0 && helpReview.stdout.includes("Examples:"),
  helpReview.stdout,
);
const dryRunHelp = await run(["dry-run", "--help"], { cwd: dir });
check(
  "dry-run is a first-class command",
  dryRunHelp.code === 0 && dryRunHelp.stdout.includes("dry-run"),
  dryRunHelp.stdout,
);

// The regression suite below exercises the hidden local provider against a
// fake Ollama server; enable it through the reserved feature flag.
writeFileSync(
  join(dir, "air-review.yaml"),
  [
    "version: 1",
    "frameworks: [angular]",
    "provider: ollama",
    "features:",
    "  ollama: true",
    "models:",
    "  default: qwen3:4b",
    "  roles:",
    "    planner: qwen3:4b",
    "    reviewer: qwen3:14b",
    "    verifier: qwen3:4b",
    "platform:",
    "  provider: local",
    "  local:",
    "    base: main",
    "telemetry:",
    "  log: .air-review/telemetry.jsonl",
    "  pricing:",
    "    qwen3:14b:",
    "      input: 1",
    "      output: 4",
    "    qwen3:4b:",
    "      input: 0.5",
    "      output: 1.5",
    "",
  ].join("\n"),
);

const server = await fakeOllama({
  reviewerResponse: {
    findings: [
      {
        severity: "MINOR",
        confidence: 0.7,
        scope: "IN_PR",
        ruleOrigin: "HEURISTIC",
        ruleId: "e2e.llm",
        title: "LLM finding title",
        summary: "A finding produced by the fake reviewer model in the e2e suite.",
        file: "src/app/widget.component.ts",
        startLine: 7,
        endLine: 7,
        evidence: [],
      },
    ],
  },
});
const port = server.address().port;
const env = { ...process.env, OLLAMA_HOST: `http://127.0.0.1:${port}` };

const set = await run(["config", "set", "models.roles.reviewer", "qwen3:14b"], { cwd: dir });
check("config set works", set.code === 0, set.stderr);
const got = await run(["config", "get", "models.roles.reviewer"], { cwd: dir });
check("config get returns the set value", got.stdout.trim() === "qwen3:14b", got.stdout);

// doctor
const doctor = await run(["doctor"], { cwd: dir, env });
check("doctor passes against a healthy setup", doctor.code === 0, doctor.stdout + doctor.stderr);

// models
const models = await run(["models"], { cwd: dir, env });
check("models lists the fake models", models.stdout.includes("qwen3:14b"), models.stdout);

// review with LLM + verifier (dry-run)
const review = await run(["review", "--base", "main", "--force"], { cwd: dir, env });
check("review exits 0 on a passing gate", review.code === 0, review.stdout + review.stderr);
check(
  "review reports deterministic finding",
  review.stdout.includes("Subscription may outlive"),
  review.stdout,
);
check("review reports llm finding", review.stdout.includes("LLM finding title"), review.stdout);
check("review mentions dry-run", review.stdout.includes("dry-run"), review.stdout);
check("review shows a cost estimate", /Estimated cost \(USD\)\s+~\$/.test(review.stdout), review.stdout);
check(
  "telemetry log written with per-role usage",
  (() => {
    const file = join(dir, ".air-review/telemetry.jsonl");
    if (!existsSync(file)) return false;
    const last = JSON.parse(readFileSync(file, "utf8").trim().split("\n").pop());
    return last.usage?.byRole?.reviewer?.modelCalls >= 1 && typeof last.usage?.estimatedCostUsd === "number";
  })(),
);

// state + explain
const deterministicId =
  "arf_" +
  createHash("sha256")
    .update("angular.subscription-lifecycle|src/app/widget.component.ts|WidgetComponent#sub1|")
    .digest("hex")
    .slice(0, 6);
const explain = await run(["explain", deterministicId], { cwd: dir, env });
check("explain resolves a stored deterministic finding", explain.code === 0, explain.stderr);

// incremental skip
const again = await run(["review", "--base", "main"], { cwd: dir, env });
check("second review is skipped", again.code === 0 && again.stdout.includes("skipped"), again.stdout);

// cache was populated by the LLM review
const cache = await run(["cache", "stats"], { cwd: dir, env });
check(
  "cache stats show entries",
  cache.stdout.includes("entries") && cache.stdout.includes("review"),
  cache.stdout,
);

// publish in local mode writes artifacts
const publish = await run(["review", "--base", "main", "--publish", "--force"], { cwd: dir, env });
check("publish exits 0", publish.code === 0, publish.stderr);
check("publish writes local summary", existsSync(join(dir, ".air-review/summary.md")));

// gate: a blocker above threshold must exit 10
write(
  "src/app/widget.component.ts",
  [
    "import { Component, inject } from '@angular/core';",
    "import { Api } from './api';",
    "@Component({ selector: 'app-widget' })",
    "export class WidgetComponent {",
    "  api = inject(Api);",
    "  go() {",
    "    this.api.events$.subscribe(() => {});",
    "  }",
    "}",
    "",
    "export function helper() { return true; }",
  ].join("\n"),
);
git(["add", "-A"]);
git(["commit", "-qm", "add helper"]);

const blockerServer = await fakeOllama({
  reviewerResponse: {
    findings: [
      {
        severity: "BLOCKER",
        confidence: 0.95,
        scope: "IN_PR",
        ruleOrigin: "HEURISTIC",
        ruleId: "e2e.blocker",
        title: "Blocker finding",
        summary: "A definite blocker from the e2e fake reviewer.",
        file: "src/app/widget.component.ts",
        startLine: 11,
        endLine: 11,
        symbol: "helper",
        evidence: [],
      },
    ],
  },
});
const blockerPort = blockerServer.address().port;
const gated = await run(["review", "--base", "main", "--no-cache"], {
  cwd: dir,
  env: { ...process.env, OLLAMA_HOST: `http://127.0.0.1:${blockerPort}` },
});
check("gate failure exits with code 10", gated.code === 10, `exit=${gated.code} ${gated.stdout}`);
blockerServer.close();

// Env-only configuration (no config file) pointing at an OpenAI-compatible API
rmSync(join(dir, "air-review.yaml"), { force: true });
rmSync(join(dir, ".air-review"), { recursive: true, force: true });
const envOnly = {
  ...process.env,
  AIR_REVIEW_PROVIDER: "openai",
  AIR_REVIEW_BASE_URL: `http://127.0.0.1:${port}/v1`,
  AIR_REVIEW_API_KEY: "e2e-secret",
  AIR_REVIEW_MODEL_PLANNER: "fake-small",
  AIR_REVIEW_MODEL_REVIEWER: "fake-large",
  AIR_REVIEW_MODEL_VERIFIER: "fake-small",
};
const envDoctor = await run(["doctor"], { cwd: dir, env: envOnly });
check(
  "doctor works from environment variables only",
  envDoctor.code === 0,
  envDoctor.stdout + envDoctor.stderr,
);
const envReview = await run(["review", "--base", "main", "--force", "--no-cache"], {
  cwd: dir,
  env: envOnly,
});
check("env-configured review runs end to end", envReview.code === 0, envReview.stdout + envReview.stderr);
check(
  "env-configured endpoint produced the finding",
  envReview.stdout.includes("Env-configured finding"),
  envReview.stdout,
);

server.close();
rmSync(dir, { recursive: true, force: true });

if (failures > 0) {
  console.error(`\n${failures} e2e check(s) failed`);
  process.exit(1);
}
console.log("\ne2e passed");
