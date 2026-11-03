import type { ModelOverrides } from "../../model/router.js";
import { ciBuildWithoutPullRequest } from "../../scm/detect.js";
import type { ComplexityTier } from "../../contracts/routing.js";
import { requireRoleModels, type RoleModels } from "../../model/router.js";
import type { CiMode } from "../../scm/detect.js";
import { runReview, type ReviewOptions } from "../../review/pipeline.js";
import { EXIT } from "../../errors.js";
import type { CliContext } from "../context.js";
import { printJson, Spinner, isPlainMode, reportColorEnabled, writeReport } from "../output.js";
import { renderReviewReport } from "../report.js";

export interface ReviewCliOptions {
  ci: CiMode;
  publish?: boolean;
  dryRun: boolean;
  force: boolean;
  deterministicOnly: boolean;
  noVerifier: boolean;
  noCache: boolean;
  tier?: ComplexityTier;
  base?: string;
  owner?: string;
  repo?: string;
  pr?: number;
  org?: string;
  project?: string;
  modelOverrides: ModelOverrides;
  json: boolean;
}

export async function runReviewCommand(ctx: CliContext, options: ReviewCliOptions): Promise<number> {
  const notPullRequest = ciBuildWithoutPullRequest({ ci: options.ci, pr: options.pr });
  if (notPullRequest && ctx.scm.kind === "local") {
    if (options.json) printJson({ tool: "air-review", skipped: true, reason: notPullRequest });
    else process.stdout.write(`${notPullRequest}\n`);
    return EXIT.OK;
  }
  const publish = options.dryRun ? false : (options.publish ?? ctx.config.platform.publish);
  const models: RoleModels = options.deterministicOnly
    ? { triage: "(none)", planner: "(none)", reviewer: "(none)", verifier: "(none)" }
    : requireRoleModels(ctx.models);

  const spinner = new Spinner();

  const reviewOptions: ReviewOptions = {
    ci: options.ci,
    publish,
    force: options.force,
    deterministicOnly: options.deterministicOnly,
    skipLlmVerifier: options.noVerifier,
    noCache: options.noCache,
    tier: options.tier,
    base: options.base,
    owner: options.owner,
    repo: options.repo,
    pr: options.pr,
    org: options.org,
    project: options.project,
    modelOverrides: options.modelOverrides,
    onProgress: (event) => {
      switch (event.phase) {
        case "analyze":
          spinner.start("Analyzing the change…");
          break;
        case "triage":
          spinner.update(`Triaging complexity${event.detail ? ` with ${event.detail}` : ""}…`);
          break;
        case "review":
          spinner.update(`Reviewing with ${event.detail ?? "model"}…`);
          break;
        case "verify":
          spinner.update(`Verifying with ${event.detail ?? "model"}…`);
          break;
        case "publish":
          spinner.update("Publishing findings…");
          break;
        default:
          break;
      }
    },
  };

  let outcome;
  if (!options.json) spinner.start("Preparing review…");
  try {
    outcome = await runReview(reviewOptions, {
      config: ctx.config,
      provider: ctx.provider,
      models,
      scm: ctx.scm,
      git: ctx.git,
      cache: ctx.cache,
    });
  } finally {
    spinner.stop();
  }

  if (options.json) {
    printJson({
      tool: "air-review",
      pr: outcome.summary.pr,
      reviewedHeadSha: outcome.summary.reviewedHeadSha,
      skipped: outcome.skipped,
      stale: outcome.stale,
      published: outcome.published,
      gatePassed: outcome.summary.gatePassed,
      incomplete: outcome.incomplete,
      verdict: outcome.summary.verdict,
      counts: outcome.summary.counts,
      routing: outcome.summary.metrics.routing,
      metrics: outcome.summary.metrics,
      workflowDiagram: outcome.summary.workflowDiagram,
      report: outcome.report,
      warnings: outcome.warnings,
      findings: outcome.findings,
    });
    return outcome.incomplete ? EXIT.MODEL : outcome.gateFailed ? EXIT.GATE_FAILED : EXIT.OK;
  }

  const sources = new Map<string, string>();
  for (const finding of outcome.findings) {
    if (finding.status === "RESOLVED" || finding.status === "WONT_FIX" || sources.has(finding.anchor.file)) {
      continue;
    }
    sources.set(
      finding.anchor.file,
      await ctx.git.readFileAt(outcome.summary.reviewedHeadSha, finding.anchor.file),
    );
  }
  await writeReport(
    renderReviewReport(outcome, {
      width: process.stdout.columns ?? 100,
      color: reportColorEnabled(),
      ascii: process.env.TERM === "dumb" || process.argv.includes("--ascii"),
      plain: isPlainMode() || (!process.stdout.isTTY && !reportColorEnabled()),
      deterministicOnly: options.deterministicOnly,
      local: ctx.scm.kind === "local",
      sources,
    }),
  );
  return outcome.incomplete ? EXIT.MODEL : outcome.gateFailed ? EXIT.GATE_FAILED : EXIT.OK;
}
