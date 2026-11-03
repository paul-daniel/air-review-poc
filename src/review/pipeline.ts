import { randomUUID } from "node:crypto";
import type { AirReviewConfig } from "../config/schema.js";
import { configHash } from "../config/hash.js";
import type { ModelProvider, Usage, ModelRole, StructuredRequest } from "../contracts/model.js";
import type { Finding, ReviewMetrics, ReviewSummary } from "../contracts/review.js";
import type { ComplexityTier, RoutingDecision } from "../contracts/routing.js";
import type { AirReviewState } from "../contracts/state.js";
import type { ScmAdapter } from "../contracts/scm.js";
import type { GitRepository } from "../context/repository.js";
import { analyzeDelta, readProjectFacts } from "../context/analyze.js";
import { reviewableFiles } from "../context/diff.js";
import { angularRules } from "../framework/angular-rules.js";
import type { CandidateFinding, DeterministicRule } from "../framework/rules.js";
import { secretRule } from "./security-rule.js";
import { redactSecrets } from "../security/redaction.js";
import { runReviewer } from "./reviewer.js";
import { deterministicVerify, llmVerify } from "./verifier.js";
import { reconcile } from "./reconcile.js";
import { evaluateGate } from "./gate.js";
import { decideVerdict } from "./verdict.js";
import { changeKindOf, decideRouting } from "./triage.js";
import { extractState, encodeState } from "../state/ledger.js";
import { emptyState } from "../contracts/state.js";
import type { LocalCache } from "../cache/local.js";
import { TOOL } from "../version.js";
import { modelsForTier, resolveTierModels, type ModelOverrides, type RoleModels } from "../model/router.js";
import type { CiMode } from "../scm/detect.js";
import { appendRunLog, estimateCost } from "../telemetry/run-log.js";
import { RunTrace, type StepHandle } from "../telemetry/trace.js";
import { renderWorkflowDiagram } from "../telemetry/workflow-diagram.js";
import { writeRunReport } from "../telemetry/report.js";

export interface ProgressEvent {
  phase: "analyze" | "triage" | "review" | "verify" | "publish" | "done";
  detail?: string;
}

export interface ReviewOptions {
  ci: CiMode;
  publish: boolean;
  force: boolean;
  deterministicOnly: boolean;
  skipLlmVerifier: boolean;
  noCache: boolean;
  /** Force the complexity tier instead of letting triage decide. */
  tier?: ComplexityTier;
  base?: string;
  owner?: string;
  repo?: string;
  pr?: number;
  /** Azure DevOps organization URL (`--org`). */
  org?: string;
  /** Azure DevOps project (`--project`). */
  project?: string;
  modelOverrides: ModelOverrides;
  onProgress?: (event: ProgressEvent) => void;
}

export interface ReviewOutcome {
  summary: ReviewSummary;
  findings: Finding[];
  skipped: boolean;
  stale: boolean;
  published: boolean;
  warnings: string[];
  gateFailed: boolean;
  incomplete: boolean;
  /** Where the per-run observability report was written, when it was. */
  report?: { markdown: string; json: string };
}

interface PipelineDeps {
  config: AirReviewConfig;
  provider: ModelProvider;
  /** Configured (standard-tier) role models; the triage step may swap reviewer/verifier per run. */
  models: RoleModels;
  scm: ScmAdapter;
  git: GitRepository;
  cache: LocalCache;
}

const RULES: DeterministicRule[] = [...angularRules, secretRule];

function isToolArtifact(path: string): boolean {
  return path === ".air-review" || path.startsWith(".air-review/");
}

export async function runReview(options: ReviewOptions, deps: PipelineDeps): Promise<ReviewOutcome> {
  const { config, provider, models, scm, git, cache } = deps;
  const runId = `ar_${randomUUID().slice(0, 8)}`;
  const trace = new RunTrace(runId, config.telemetry.pricing);
  const warnings: string[] = [];
  const metrics: ReviewMetrics = {
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    reasoningTokens: 0,
    modelCalls: 0,
    contextRequests: 0,
    cacheHits: 0,
    durationMs: 0,
    deterministicFindings: 0,
    llmFindings: 0,
    verifiedFindings: 0,
    byRole: {
      triage: emptyRoleUsage(models.triage),
      planner: emptyRoleUsage(models.planner),
      reviewer: emptyRoleUsage(models.reviewer),
      verifier: emptyRoleUsage(models.verifier),
    },
  };
  const tiers = resolveTierModels(config, models);
  const useCache = config.cache.enabled && !options.noCache;
  let incomplete = false;

  /** A provider view that attributes usage to a role and to the current trace step. */
  const metered = (role: ModelRole, step: StepHandle): ModelProvider => ({
    id: provider.id,
    capabilities: () => provider.capabilities(),
    listModels: () => provider.listModels(),
    generate: (request) => provider.generate(request),
    async structured<T>(request: StructuredRequest<T>) {
      metrics.modelCalls += 1;
      metrics.byRole![role].modelCalls += 1;
      let reported = false;
      const record = (usage: Usage) => {
        if (reported) return;
        reported = true;
        addUsage(metrics, usage, role, request.model);
        step.addUsage(usage, request.model);
      };
      try {
        const result = await provider.structured({ ...request, onUsage: record });
        record(result.usage);
        return result;
      } finally {
        if (!reported) record({ inputTokens: 0, outputTokens: 0, usageIncomplete: true });
      }
    },
  });

  // 0. Load the previous ledger and decide what this run has to do.
  const loadStep = trace.begin("state.load", "Load review memory");
  const snapshot = await scm.getPullRequest();
  const configKey = configHash(config, models) + `:${options.deterministicOnly}:${options.skipLlmVerifier}`;
  const repoId = `${snapshot.owner}/${snapshot.repo}`;

  const stateBody = config.memory.backend === "none" ? null : await scm.listState();
  let previous: AirReviewState | null = stateBody ? extractState(stateBody) : null;
  if (stateBody && !previous) {
    warnings.push("Previous air-review state was unreadable; starting a fresh review.");
  }
  // A local ledger must not leak into another branch or PR.
  if (
    previous &&
    (previous.repository.id !== repoId ||
      previous.pullRequest.number !== snapshot.number ||
      !previous.pullRequest.headSha ||
      (await git.mergeBase(previous.pullRequest.headSha, snapshot.headSha).catch(() => "")) !==
        previous.pullRequest.headSha)
  ) {
    previous = null;
  }
  // The target branch advancing under an open PR is routine. It changes the
  // diff, so the review must be redone from the new base, but the previous
  // findings are kept so existing threads are updated or resolved rather than
  // duplicated (seen live on Azure DevOps when main moved during a PR).
  const baseMoved = Boolean(previous) && previous?.pullRequest.baseSha !== snapshot.baseSha;
  if (baseMoved) {
    warnings.push(
      `Target branch moved from ${previous!.pullRequest.baseSha.slice(0, 8)} to ${snapshot.baseSha.slice(0, 8)}: ` +
        `full re-review against the new base, previous findings reconciled.`,
    );
  }
  const sameHead = previous?.pullRequest.headSha === snapshot.headSha && !baseMoved;
  const sameConfig =
    previous?.configuration.hash === configKey &&
    previous?.configuration.models &&
    JSON.stringify(previous.configuration.models) === JSON.stringify(models);
  loadStep.end("done", {
    detail: previous
      ? `previous review of ${previous.pullRequest.headSha.slice(0, 8)} with ${previous.findings.length} finding(s)`
      : "no previous review",
  });

  // Same head, same configuration: the review already exists. Nothing is
  // billed again, whether or not --publish is set (the threads are already
  // there); --force overrides.
  if (sameHead && sameConfig && !options.force) {
    const reason = `head ${snapshot.headSha.slice(0, 8)} was already reviewed with the same configuration (run ${previous!.runs.runId || "?"}); use --force to review again`;
    trace.skip("review.model", "Reviewer", reason, { role: "reviewer" });
    trace.skip("publish", "Publish", "already published");
    metrics.estimatedCostUsd = 0;
    const summary = finishSummary(config, previous!, snapshot, warnings, metrics, trace, undefined, {
      skippedReason: reason,
      incomplete: false,
    });
    if (scm.kind === "local") await scm.upsertSummary(summary, previous!.findings);
    logRun(config, {
      repository: repoId,
      pullRequest: snapshot.number,
      fromSha: previous!.pullRequest.headSha,
      headSha: snapshot.headSha,
      skipped: true,
      summary,
      metrics,
      models,
    });
    return {
      summary,
      findings: previous!.findings,
      skipped: true,
      stale: false,
      published: false,
      warnings,
      gateFailed: !summary.gatePassed,
      incomplete: false,
      report:
        writeRunReport(config.observability.reportDir, {
          summary,
          findings: previous!.findings,
          configuredModels: models,
        }) ?? undefined,
    };
  }

  // 1. Delta: incremental from the previously reviewed head when possible.
  options.onProgress?.({ phase: "analyze", detail: "reading the pull request delta" });
  const deltaStep = trace.begin("delta", "Compute delta");
  const incremental =
    Boolean(previous) &&
    Boolean(sameConfig) &&
    !sameHead &&
    !options.force &&
    !baseMoved &&
    previous!.pullRequest.number === snapshot.number;
  const fromSha = incremental ? (previous!.pullRequest.headSha ?? snapshot.baseSha) : snapshot.baseSha;
  const rawDelta = await scm.getDelta(fromSha, snapshot.headSha);
  // The tool's own artifacts (.air-review/) are never part of a review.
  const delta = { ...rawDelta, files: rawDelta.files.filter((file) => !isToolArtifact(file.path)) };
  const reviewable = reviewableFiles(delta);
  deltaStep.end("done", {
    detail: `${incremental ? "incremental since" : "full from"} ${fromSha.slice(0, 8)}: ${delta.files.length} file(s), +${delta.files.reduce((n, f) => n + f.addedLines.length, 0)}/−${delta.files.reduce((n, f) => n + f.removedLines.length, 0)} lines`,
  });

  // 2. Structural analysis and context plan (deterministic, free).
  const analyzeStep = trace.begin("analyze", "Structural analysis & context plan");
  const trackedFiles = await git.listTrackedFiles();
  const projectFacts = readProjectFacts(git);
  const analysis = analyzeDelta(git, delta, trackedFiles, projectFacts, {
    maxTokens: config.context.maxEvidenceTokens,
    maxFiles: config.context.maxContextRequests,
  });
  warnings.push(...analysis.injectionWarnings);
  metrics.contextRequests += analysis.plan.filesRead;
  analyzeStep.end("done", {
    detail: `${analysis.plan.exemplars.length} exemplar(s), ${analysis.plan.related.length} related module(s), ${analysis.plan.filesRead} file(s) read`,
  });

  // 3. Deterministic rules (always run - never pay a model for what software can decide).
  const rulesStep = trace.begin("rules", "Deterministic rules");
  const grep = async (pattern: string): Promise<string[]> => {
    const out = await git.run(["grep", "-l", "-F", pattern, "--", "*.ts"], { allowFailure: true });
    return out.split("\n").filter(Boolean);
  };
  const ruleContext = {
    delta,
    facts: analysis.facts,
    trackedFiles,
    readHead: (path: string) => git.readFile(path),
    grep,
    projectFacts,
    evidence: analysis.evidence,
  };
  const deterministic: CandidateFinding[] = [];
  for (const rule of RULES) {
    try {
      deterministic.push(...(await rule.run(ruleContext)));
    } catch (error) {
      warnings.push(`Deterministic rule ${rule.id} failed: ${(error as Error).message}`);
    }
  }
  metrics.deterministicFindings = deterministic.length;
  rulesStep.end("done", { detail: `${RULES.length} rule(s), ${deterministic.length} finding(s)` });

  // 4. Triage: is there anything for a model to review, and which agent should do it?
  const modelWorthy = reviewable.filter(
    (file) => !config.review.modelSkipKinds.includes(changeKindOf(file.path) as never),
  );
  let routing: RoutingDecision | undefined;
  let runModels: RoleModels = models;
  let nothingToReview = false;
  if (options.deterministicOnly) {
    trace.skip("triage", "Triage", "--deterministic-only: no model call", { role: "triage" });
  } else if (modelWorthy.length === 0) {
    nothingToReview = true;
    const why =
      reviewable.length === 0
        ? `no reviewable file ${incremental ? `since ${fromSha.slice(0, 8)}` : "in the change"}`
        : `only ${reviewable
            .map((f) => changeKindOf(f.path))
            .filter((k, i, all) => all.indexOf(k) === i)
            .join(
              "/",
            )} files changed ${incremental ? `since ${fromSha.slice(0, 8)}` : ""} (review.modelSkipKinds)`;
    trace.skip("triage", "Triage", why, { role: "triage" });
    warnings.push(`Nothing new for the reviewer: ${why}. Previous findings carried over, no model call.`);
  } else {
    options.onProgress?.({ phase: "triage", detail: models.triage });
    const triageStep = trace.begin("triage", "Triage", { role: "triage" });
    const routed = await decideRouting({
      config,
      delta: { ...delta, files: modelWorthy, diff: analysis.redactedDiff },
      models,
      tiers,
      override: options.tier,
      provider: config.routing.mode === "deterministic" ? undefined : metered("triage", triageStep),
    });
    routing = routed.decision;
    if (routed.warning) warnings.push(routed.warning);
    runModels = modelsForTier(models, tiers, routing.tier);
    metrics.byRole!.reviewer.model = runModels.reviewer;
    metrics.byRole!.verifier.model = runModels.verifier;
    metrics.routing = routing;
    triageStep.end("done", {
      detail: `${routing.tier} tier via ${routing.method}: ${routing.reasons[0] ?? ""}`,
      ...(routing.method !== "model" ? { model: undefined } : {}),
    });
  }

  // 5. Contextual LLM review (cacheable by exact input).
  let llmCandidates: CandidateFinding[] = [];
  if (options.deterministicOnly) {
    trace.skip("review.model", "Reviewer", "--deterministic-only", { role: "reviewer" });
  } else if (nothingToReview) {
    trace.skip("review.model", "Reviewer", "nothing new to review", { role: "reviewer" });
  } else {
    const reviewStep = trace.begin("review.model", `Reviewer (${routing?.tier ?? "standard"})`, {
      role: "reviewer",
      model: runModels.reviewer,
    });
    const cacheInput = JSON.stringify({
      configKey,
      reviewer: runModels.reviewer,
      fromSha,
      toSha: snapshot.headSha,
      diff: analysis.redactedDiff,
      evidence: analysis.evidence,
    });
    const cached = useCache ? cache.get<CandidateFinding[]>("review", cacheInput) : null;
    if (cached) {
      llmCandidates = cached;
      metrics.cacheHits += 1;
      metrics.byRole!.reviewer.cacheHits += 1;
      metrics.llmFindings = cached.length;
      reviewStep.end("cached", { detail: `local cache hit: ${cached.length} finding(s), no request sent` });
    } else {
      try {
        options.onProgress?.({ phase: "review", detail: runModels.reviewer });
        const result = await runReviewer(metered("reviewer", reviewStep), runModels.reviewer, {
          pr: snapshot,
          delta: { ...delta, diff: analysis.redactedDiff },
          evidence: analysis.evidence,
          previousFindings: previous?.findings.filter((f) => f.status !== "RESOLVED") ?? [],
          maxFindings: config.review.maxFindings,
          maxOutputTokens: config.review.maxOutputTokens,
        });
        llmCandidates = result.findings;
        warnings.push(...result.warnings);
        metrics.llmFindings = llmCandidates.length;
        if (useCache) cache.set("review", cacheInput, llmCandidates);
        reviewStep.end("done", { detail: `${llmCandidates.length} candidate finding(s)` });
      } catch (error) {
        incomplete = true;
        reviewStep.end("failed", { detail: (error as Error).message });
        warnings.push(
          `Reviewer model failed: ${(error as Error).message}. Continuing with deterministic findings only.`,
        );
      }
    }
  }

  // 6. Verifier: deterministic pass is mandatory, LLM pass recalibrates.
  const verifyStep = trace.begin("verify.rules", "Deterministic verification");
  const addedLines = new Map<string, Set<number>>();
  for (const file of reviewable) addedLines.set(file.path, new Set(file.addedLines));
  const llmCandidateSet = new Set(llmCandidates);
  const verified = deterministicVerify(config, [...deterministic, ...llmCandidates], addedLines, (finding) =>
    llmCandidateSet.has(finding),
  );
  warnings.push(...verified.dropped.map((d) => `Verifier dropped "${d.finding.title}": ${d.reason}`));
  let finalCandidates = verified.findings;
  verifyStep.end("done", { detail: `${finalCandidates.length} kept, ${verified.dropped.length} dropped` });

  if (options.deterministicOnly || options.skipLlmVerifier) {
    trace.skip(
      "verify.model",
      "Verifier",
      options.deterministicOnly ? "--deterministic-only" : "--no-verifier",
      { role: "verifier" },
    );
  } else if (finalCandidates.length === 0) {
    trace.skip("verify.model", "Verifier", "no candidate to verify", { role: "verifier" });
  } else {
    const llmVerifyStep = trace.begin("verify.model", "Verifier", {
      role: "verifier",
      model: runModels.verifier,
    });
    try {
      options.onProgress?.({ phase: "verify", detail: runModels.verifier });
      // deterministicVerify returns normalised copies, so lock by identity key, not by reference.
      const lockKey = (f: CandidateFinding) => `${f.ruleId}|${f.anchor.file}|${f.anchor.startLine}`;
      const lockedKeys = new Set(deterministic.map(lockKey));
      const pass = await llmVerify(metered("verifier", llmVerifyStep), runModels.verifier, finalCandidates, {
        readHead: (path) => redactSecrets(git.readFile(path)).redacted,
        locked: (finding) => lockedKeys.has(lockKey(finding)),
      });
      finalCandidates = pass.findings;
      warnings.push(...pass.dropped.map((d) => `Verifier dropped "${d.finding.title}": ${d.reason}`));
      llmVerifyStep.end("done", {
        detail: `${pass.findings.length} confirmed, ${pass.dropped.length} dropped`,
      });
    } catch (error) {
      incomplete = true;
      llmVerifyStep.end("failed", { detail: (error as Error).message });
      warnings.push(`Verifier model failed: ${(error as Error).message}. Deterministic verification stands.`);
    }
  }
  metrics.verifiedFindings = finalCandidates.length;

  // 7. Reconcile with the previous ledger, then the policy gate and the verdict.
  const reconcileStep = trace.begin("reconcile", "Reconcile with previous findings");
  const reconciliation = reconcile(
    previous?.findings ?? [],
    finalCandidates,
    delta,
    configKey,
    snapshot.headSha,
    {
      incremental: Boolean(previous) && fromSha === previous?.pullRequest.headSha,
      isDeterministicRule: (ruleId) => RULES.some((rule) => rule.id === ruleId),
    },
  );
  const findings = reconciliation.findings;
  reconcileStep.end("done", {
    detail: `${reconciliation.newOrReopened.length} new/reopened, ${reconciliation.resolved.length} resolved, ${findings.length} total`,
  });
  const gateStep = trace.begin("gate", "Policy gate");
  const gate = evaluateGate(config, findings);
  gateStep.end("done", { detail: gate.passed ? "passed" : `${gate.blocking.length} blocking finding(s)` });

  // 8. Publish (with a stale-head guard for every remote platform).
  let published = false;
  let stale = false;
  if (options.publish && !incomplete) {
    options.onProgress?.({ phase: "publish" });
    const publishStep = trace.begin("publish", "Publish to the pull request");
    if (scm.kind !== "local") {
      const latest = await scm.getPullRequest();
      if (latest.headSha !== snapshot.headSha) {
        stale = true;
        warnings.push(
          `PR head moved from ${snapshot.headSha.slice(0, 8)} to ${latest.headSha.slice(0, 8)}; ` +
            `discarding stale review results. Re-run to review the new head.`,
        );
      }
    }
    if (!stale) {
      const failures = await publishFindings(scm, previous?.findings ?? [], findings);
      published = true;
      warnings.push(...failures.map((f) => `Could not publish finding ${f.id}: ${f.message}`));
      publishStep.end("done", {
        detail: `${reconciliation.newOrReopened.length} thread(s) created/reopened, ${reconciliation.resolved.length} resolved${failures.length ? `, ${failures.length} failed` : ""}`,
      });
    } else {
      publishStep.end("skipped", { detail: "pull request head moved during the review" });
    }
  } else {
    trace.skip(
      "publish",
      "Publish",
      incomplete ? "review incomplete: nothing published" : "dry run (no --publish)",
    );
  }

  // 9. Persist state (local always; remote platforms only when publishing).
  const nextState = stateOf({
    previous,
    repoId,
    snapshot: { number: snapshot.number, baseSha: snapshot.baseSha, headSha: snapshot.headSha },
    previousReviewedSha: fromSha,
    configKey,
    models,
    runId,
    routing,
    findings,
    events: reconciliation.events,
    metrics,
  });
  if (!incomplete && config.memory.backend !== "none" && (scm.kind === "local" || published)) {
    await scm.writeState(encodeState(nextState));
  }

  finalizeMetrics(config, metrics, warnings, incomplete);
  const summary = finishSummary(
    config,
    nextState,
    snapshot,
    warnings,
    metrics,
    trace,
    reconciliation.events,
    { incomplete },
  );
  if (scm.kind === "local" || (published && !stale)) {
    const voteStep = trace.begin("verdict", `Verdict: ${summary.verdict}`);
    await scm.upsertSummary(summary, findings);
    if (published && !stale && scm.castVote) {
      try {
        await scm.castVote(summary);
        voteStep.end("done", { detail: `vote cast: ${summary.verdict}` });
      } catch (error) {
        warnings.push(`Could not cast the reviewer vote: ${(error as Error).message}`);
        voteStep.end("failed", { detail: (error as Error).message });
      }
    } else {
      voteStep.end("done", { detail: scm.kind === "local" ? "local summary written" : "summary updated" });
    }
    // The vote step changed the trace: refresh the trace-derived fields.
    summary.metrics.trace = trace.summary();
    summary.workflowDiagram = config.observability.diagram
      ? renderWorkflowDiagram(summary.metrics.trace, routing)
      : undefined;
  }
  logRun(config, {
    repository: repoId,
    pullRequest: snapshot.number,
    fromSha,
    headSha: snapshot.headSha,
    skipped: false,
    summary,
    metrics,
    models,
  });
  options.onProgress?.({ phase: "done" });

  return {
    summary,
    findings,
    skipped: false,
    stale,
    published,
    warnings,
    gateFailed: !gate.passed,
    incomplete,
    report:
      writeRunReport(config.observability.reportDir, { summary, findings, configuredModels: models }) ??
      undefined,
  };
}

/**
 * Create, update or resolve one thread per finding. The adapter is the one
 * that de-duplicates against the platform (by the hidden finding marker), so a
 * lost ledger never produces a second thread for the same finding.
 */
async function publishFindings(
  scm: ScmAdapter,
  previous: Finding[],
  findings: Finding[],
): Promise<Array<{ id: string; message: string }>> {
  const previousById = new Map(previous.map((f) => [f.id, f]));
  const failures: Array<{ id: string; message: string }> = [];
  for (const finding of findings) {
    const old = previousById.get(finding.id);
    try {
      if (finding.status === "RESOLVED" || finding.status === "WONT_FIX") {
        if (old?.threadRef && old.status !== "RESOLVED") {
          await scm.resolveFinding(old.threadRef);
        }
        continue;
      }
      if (!finding.threadRef) {
        finding.threadRef = await scm.createInlineFinding(finding);
      } else if (
        finding.changedSinceLastReview ||
        (finding.status === "REOPENED" && old?.status === "RESOLVED")
      ) {
        // Continue the conversation where it started: a reply with what is still
        // to be done, never a second thread and never a rewritten first comment.
        if (scm.replyToFinding) await scm.replyToFinding(finding.threadRef, finding);
        else await scm.updateFinding(finding.threadRef, finding);
      } else if (old && old.fingerprint !== finding.fingerprint) {
        await scm.updateFinding(finding.threadRef, finding);
      }
    } catch (error) {
      failures.push({ id: finding.id, message: (error as Error).message });
    }
  }
  return failures;
}

function stateOf(input: {
  previous: AirReviewState | null;
  repoId: string;
  snapshot: { number: number | null; baseSha: string; headSha: string };
  previousReviewedSha: string;
  configKey: string;
  models: Record<string, string>;
  runId: string;
  routing?: RoutingDecision;
  findings: Finding[];
  events: Array<{ event: string; findingId: string; detail?: string }>;
  metrics: ReviewMetrics;
}): AirReviewState {
  const base = input.previous ?? emptyState(input.repoId, input.snapshot, input.configKey, input.models);
  return {
    ...base,
    schemaVersion: 1,
    tool: { name: TOOL.name, version: TOOL.version },
    pullRequest: {
      number: input.snapshot.number,
      baseSha: input.snapshot.baseSha,
      headSha: input.snapshot.headSha,
      previousReviewedSha: input.previousReviewedSha,
    },
    configuration: { hash: input.configKey, models: input.models },
    runs: {
      lastCompleted: new Date().toISOString(),
      runId: input.runId,
      ...(input.routing
        ? {
            routing: {
              tier: input.routing.tier,
              reviewerModel: input.routing.reviewerModel,
              verifierModel: input.routing.verifierModel,
              method: input.routing.method,
            },
          }
        : base.runs.routing
          ? { routing: base.runs.routing }
          : {}),
    },
    findings: input.findings,
    history: [
      ...base.history,
      ...input.events.map((event) => ({
        at: new Date().toISOString(),
        sha: input.snapshot.headSha,
        ...event,
      })),
    ].slice(-200),
    metrics: {
      inputTokens: input.metrics.inputTokens,
      outputTokens: input.metrics.outputTokens,
      contextRequests: input.metrics.contextRequests,
      cacheHits: input.metrics.cacheHits,
    },
  };
}

function finalizeMetrics(
  config: AirReviewConfig,
  metrics: ReviewMetrics,
  warnings: string[],
  incomplete: boolean,
): void {
  metrics.estimatedCostUsd = estimateCost(metrics.byRole!, config.telemetry.pricing);
  for (const [role, usage] of Object.entries(metrics.byRole!)) {
    usage.estimatedCostUsd = estimateCost({ [role]: usage }, config.telemetry.pricing);
  }
  metrics.incomplete = incomplete;
  if (metrics.modelCalls > 0 && metrics.estimatedCostUsd === undefined) {
    warnings.push(
      "Cost unavailable: configure telemetry.pricing for every called model/deployment (input/output/cachedInput).",
    );
  } else if (metrics.modelCalls > 0 && metrics.cachedInputTokens === undefined) {
    warnings.push(
      "Provider did not report cached tokens; cost estimate assumes all input at the standard rate.",
    );
  }
}

function finishSummary(
  config: AirReviewConfig,
  state: AirReviewState,
  snapshot: { owner: string; repo: string; number: number | null; baseSha: string; headSha: string },
  warnings: string[],
  metrics: ReviewMetrics,
  trace: RunTrace,
  events: Array<{ event: string; findingId: string; detail?: string }> | undefined,
  flags: { incomplete: boolean; skippedReason?: string },
): ReviewSummary {
  const counts: Record<string, number> = { BLOCKER: 0, CRITICAL: 0, MAJOR: 0, MINOR: 0, INFO: 0 };
  let open = 0;
  let resolved = 0;
  for (const finding of state.findings) {
    if (finding.status === "RESOLVED") {
      resolved += 1;
      continue;
    }
    if (finding.status === "WONT_FIX") continue;
    counts[finding.severity] = (counts[finding.severity] ?? 0) + 1;
    open += 1;
  }
  const gate = evaluateGate(config, state.findings);
  const verdict = decideVerdict({
    open,
    gatePassed: gate.passed,
    incomplete: flags.incomplete,
    approveWithSuggestions: config.platform.azureDevops.vote.approveWithSuggestions,
  });
  metrics.trace = trace.summary();
  metrics.durationMs = metrics.trace.durationMs;
  if (!metrics.routing && state.runs.routing && flags.skippedReason) {
    // A skipped run still reports which agent reviewed this head.
    metrics.routing = undefined;
  }
  return {
    pr: { owner: snapshot.owner, repo: snapshot.repo, number: snapshot.number },
    reviewedHeadSha: state.pullRequest.headSha,
    gatePassed: gate.passed,
    verdict,
    counts: counts as ReviewSummary["counts"],
    open,
    resolved,
    metrics,
    warnings: warnings.slice(0, 20),
    events,
    workflowDiagram: config.observability.diagram
      ? renderWorkflowDiagram(metrics.trace, metrics.routing)
      : undefined,
    skippedReason: flags.skippedReason,
  };
}

function emptyRoleUsage(model?: string) {
  return {
    model,
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    reasoningTokens: 0,
    modelCalls: 0,
    cacheHits: 0,
  };
}

function addUsage(metrics: ReviewMetrics, usage: Usage, role: ModelRole, model: string): void {
  metrics.inputTokens += usage.inputTokens;
  metrics.outputTokens += usage.outputTokens;
  for (const target of [metrics, metrics.byRole![role]]) {
    target.cachedInputTokens =
      target.cachedInputTokens !== undefined && usage.cachedInputTokens !== undefined
        ? target.cachedInputTokens + usage.cachedInputTokens
        : undefined;
    target.reasoningTokens =
      target.reasoningTokens !== undefined && usage.reasoningTokens !== undefined
        ? target.reasoningTokens + usage.reasoningTokens
        : undefined;
    target.usageIncomplete = target.usageIncomplete || usage.usageIncomplete;
  }
  const roleUsage = metrics.byRole?.[role];
  if (roleUsage) {
    roleUsage.model = model;
    roleUsage.inputTokens += usage.inputTokens;
    roleUsage.outputTokens += usage.outputTokens;
  }
}

function logRun(
  config: AirReviewConfig,
  input: {
    repository: string;
    pullRequest: number | null;
    fromSha: string;
    headSha: string;
    skipped: boolean;
    summary: ReviewSummary;
    metrics: ReviewMetrics;
    models: Record<string, string>;
  },
): void {
  if (!config.telemetry.enabled) return;
  appendRunLog(config.telemetry.log, {
    timestamp: new Date().toISOString(),
    tool: TOOL.name,
    version: TOOL.version,
    repository: input.repository,
    pullRequest: input.pullRequest,
    fromSha: input.fromSha,
    headSha: input.headSha,
    skipped: input.skipped,
    gatePassed: input.summary.gatePassed,
    verdict: input.summary.verdict,
    routing: input.metrics.routing
      ? {
          tier: input.metrics.routing.tier,
          reviewerModel: input.metrics.routing.reviewerModel,
          method: input.metrics.routing.method,
        }
      : undefined,
    counts: input.summary.counts as Record<string, number>,
    findings: { open: input.summary.open, resolved: input.summary.resolved },
    usage: {
      byRole: input.metrics.byRole ?? {
        triage: emptyRoleUsage(),
        planner: emptyRoleUsage(),
        reviewer: emptyRoleUsage(),
        verifier: emptyRoleUsage(),
      },
      inputTokens: input.metrics.inputTokens,
      outputTokens: input.metrics.outputTokens,
      modelCalls: input.metrics.modelCalls,
      cacheHits: input.metrics.cacheHits,
      estimatedCostUsd: input.metrics.estimatedCostUsd,
      cachedInputTokens: input.metrics.cachedInputTokens,
      reasoningTokens: input.metrics.reasoningTokens,
      usageIncomplete: input.metrics.usageIncomplete,
    },
    steps: input.metrics.trace?.steps.map((s) => ({
      id: s.id,
      status: s.status,
      durationMs: s.durationMs,
      model: s.model,
      inputTokens: s.inputTokens,
      outputTokens: s.outputTokens,
      estimatedCostUsd: s.estimatedCostUsd,
    })),
    incomplete: input.metrics.incomplete,
    durationMs: input.metrics.durationMs,
    models: input.models,
  });
}
