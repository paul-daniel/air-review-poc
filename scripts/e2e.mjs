/**
 * End-to-end smoke test for the air-review CLI, fully offline.
 *
 * Uses the built-in `mock` provider on the demo corpus (scripts/demo.mjs) so
 * the whole command surface is exercised without any external service:
 *   init -> doctor -> inspect -> dry-run (routing, report, diagram)
 *   -> same head skipped -> docs-only push without model call
 *   -> --force cache hit -> explain -> telemetry -> cache stats -> --json.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDemo } from "./demo.mjs";

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

function run(args, options = {}) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [cli, ...args], {
      env: { ...process.env, NO_COLOR: "1", ...(options.env ?? {}) },
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) => done({ code: code ?? 1, stdout, stderr }));
  });
}

const parent = mkdtempSync(join(tmpdir(), "air-review-e2e-"));
const { dir, git } = createDemo(join(parent, "corpus"));
const commit = (message) => {
  git("add", "-A");
  git("-c", "commit.gpgsign=false", "commit", "-qm", message);
};

try {
  writeFileSync(
    join(dir, "air-review.yaml"),
    [
      "version: 1",
      "provider: mock",
      "models:",
      "  roles: { triage: mock-small, planner: mock-small, reviewer: mock-large, verifier: mock-small }",
      "  tiers:",
      "    light: { reviewer: mock-small }",
      "    heavy: { reviewer: mock-large }",
      "telemetry:",
      "  pricing:",
      "    mock-large: { input: 2, output: 8 }",
      "    mock-small: { input: 0.1, output: 0.4 }",
      "platform:",
      "  provider: local",
      "  local: { base: main }",
      "",
    ].join("\n"),
  );

  const doctor = await run(["doctor", "--json"], { cwd: dir });
  check("doctor runs offline with the mock provider", doctor.code === 0, doctor.stderr);

  const inspect = await run(["inspect", "--json"], { cwd: dir });
  check("inspect needs no model", inspect.code === 0, inspect.stderr);

  // demo-01-bugs: subscription leak (deterministic), secret-free, prompt injection comment.
  const first = await run(["dry-run", "--json"], { cwd: dir });
  const firstJson = first.code <= 10 ? JSON.parse(first.stdout) : null;
  check("first review runs", firstJson !== null, first.stderr);
  check(
    "deterministic subscription finding reported",
    firstJson?.findings.some((f) => f.ruleId === "angular.subscription-lifecycle"),
  );
  check(
    "routing decision is visible",
    typeof firstJson?.routing?.tier === "string" && firstJson.routing.reasons.length > 0,
  );
  check(
    "steps are traced with model and cost",
    firstJson?.metrics.trace.steps.some(
      (s) => s.id === "review.model" && s.model === "mock-small" && typeof s.estimatedCostUsd === "number",
    ),
  );
  check("workflow diagram generated", String(firstJson?.workflowDiagram).startsWith("flowchart TD"));
  check("run report written", firstJson?.report && existsSync(firstJson.report.markdown));
  check(
    "verdict computed",
    ["approve", "approve-with-suggestions", "request-changes"].includes(firstJson?.verdict),
  );
  const summaryMd = readFileSync(join(dir, ".air-review", "summary.md"), "utf8");
  check(
    "summary comment leads with the verdict and shows routing",
    summaryMd.startsWith("## Air Review — ") && summaryMd.includes("**Routing**"),
  );

  const again = await run(["dry-run", "--json"], { cwd: dir });
  const againJson = JSON.parse(again.stdout);
  check(
    "same head is skipped without model calls",
    againJson.skipped === true && againJson.metrics.modelCalls === 0,
  );

  writeFileSync(join(dir, "README.md"), "Angular source corpus.\n\nRelease notes added.\n");
  commit("docs: release notes");
  const docsOnly = await run(["dry-run", "--json"], { cwd: dir });
  const docsJson = JSON.parse(docsOnly.stdout);
  check(
    "docs-only push costs no model call",
    docsJson.skipped === false && docsJson.metrics.modelCalls === 0,
    docsOnly.stderr,
  );
  check("findings carried over", docsJson.findings.length === firstJson.findings.length);

  const forced = await run(["dry-run", "--json", "--force"], { cwd: dir });
  const forcedJson = JSON.parse(forced.stdout);
  check(
    "--force reviews again and hits the local cache",
    forcedJson.metrics.cacheHits >= 1 || forcedJson.metrics.modelCalls > 0,
  );

  const explain = await run(["explain", "--json"], { cwd: dir });
  check(
    "explain lists stored findings",
    explain.code === 0 && explain.stdout.includes("arf_"),
    explain.stderr,
  );

  const telemetry = await run(["telemetry", "--json"], { cwd: dir });
  check(
    "telemetry lists runs with routing",
    telemetry.code === 0 && telemetry.stdout.includes("routing"),
    telemetry.stderr,
  );

  const stats = await run(["cache", "stats", "--json"], { cwd: dir });
  check("cache stats", stats.code === 0, stats.stderr);

  const reports = readdirSync(join(dir, ".air-review", "reports")).filter((f) => f.endsWith(".md"));
  check("one report per run", reports.length >= 4, String(reports.length));

  const deterministic = await run(["dry-run", "--deterministic-only", "--json", "--force"], { cwd: dir });
  const detJson = JSON.parse(deterministic.stdout);
  check(
    "--deterministic-only makes no model call and skips triage",
    detJson.metrics.modelCalls === 0 &&
      detJson.metrics.trace.steps.find((s) => s.id === "triage").status === "skipped",
  );
} finally {
  rmSync(parent, { recursive: true, force: true });
}

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll end-to-end checks passed.");
