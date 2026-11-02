import { randomUUID } from "node:crypto";
import type { AirReviewConfig } from "../config/schema.js";
import { configHash } from "../config/hash.js";
import type { ModelProvider, Usage, ModelRole, StructuredRequest } from "../contracts/model.js";
import type { Finding, ReviewMetrics, ReviewSummary } from "../contracts/review.js";
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
import { extractState, encodeState } from "../state/ledger.js";
import { emptyState } from "../contracts/state.js";
import type { LocalCache } from "../cache/local.js";
import { TOOL } from "../version.js";
import type { ModelOverrides, RoleModels } from "../model/router.js";
import type { CiMode } from "../scm/detect.js";
import { appendRunLog, estimateCost } from "../telemetry/run-log.js";

export interface ProgressEvent {
  phase: "analyze" | "review" | "verify" | "publish" | "done";
  detail?: string;
}

export interface ReviewOptions {
  ci: CiMode;
  publish: boolean;
  force: boolean;
  deterministicOnly: boolean;
  skipLlmVerifier: boolean;
  noCache: boolean;
  base?: string;
  owner?: string;
  repo?: string;
  pr?: number;
  /** Azure DevOps organization URL (`--org`). */
  org?: string;
  /** Azure DevOps project (`--project`). */
  project?: string;
  modelOverrides: ModelOverrides;
  /** Optional progress callback used by the CLI for spinners. */
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
}

interface PipelineDeps {
  config: AirReviewConfig;
  provider: ModelProvider;
  models: RoleModels;
  scm: ScmAdapter;
  git: GitRepository;
  cache: LocalCache;
}

const RULES: DeterministicRule[] = [...angularRules, secretRule];

export async function runReview(options: ReviewOptions, deps: PipelineDeps): Promise<ReviewOutcome> {
  const { config, provider, models, scm, git, cache } = deps;
  const startedAt = Date.now();
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
      planner: emptyRoleUsage(models.planner),
      reviewer: emptyRoleUsage(models.reviewer),
      verifier: emptyRoleUsage(models.verifier),
    },
  };

  const snapshot = await scm.getPullRequest();
  const configKey = configHash(config, models) + `:${options.deterministicOnly}:${options.skipLlmVerifier}`;
  let incomplete = false;
  const useCache = config.cache.enabled && !options.noCache;
  const metered = (role: ModelRole): ModelProvider => ({
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

  if (sameHead && sameConfig && !options.force && !options.publish) {
    metrics.durationMs = Date.now() - startedAt;
    metrics.estimatedCostUsd = 0;
    const summary = summaryOf(config, previous!, snapshot, warnings, metrics);
    if (scm.kind === "local") await scm.upsertSummary(summary);
    logRun(config, {
      repository: repoId,
      pullRequest: snapshot.number,
      fromSha: previous!.pullRequest.headSha ?? snapshot.baseSha,
      headSha: snapshot.headSha,
      skipped: true,
      gatePassed: summary.gatePassed,
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
    };
  }

  // Incremental delta: from the previously reviewed head when available.
  options.onProgress?.({ phase: "analyze", detail: "reading the pull request delta" });
  const fromSha =
    previous &&
    sameConfig &&
    !sameHead &&
    !options.force &&
    !baseMoved &&
    previous.pullRequest.number === snapshot.number
      ? (previous.pullRequest.headSha ?? snapshot.baseSha)
      : snapshot.baseSha;
  const delta = await scm.getDelta(fromSha, snapshot.headSha);

  const trackedFiles = await git.listTrackedFiles();
  const projectFacts = readProjectFacts(git);
  const analysis = analyzeDelta(git, delta, trackedFiles, projectFacts, {
    maxTokens: config.context.maxEvidenceTokens,
    maxFiles: config.context.maxContextRequests,
  });
  warnings.push(...analysis.injectionWarnings);
  metrics.contextRequests += analysis.plan.filesRead;

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

  // 1. Deterministic rules (always run - never pay a model for what software can decide).
  const deterministic: CandidateFinding[] = [];
  for (const rule of RULES) {
    try {
      const results = await rule.run(ruleContext);
      deterministic.push(...results);
    } catch (error) {
      warnings.push(`Deterministic rule ${rule.id} failed: ${(error as Error).message}`);
    }
  }
  metrics.deterministicFindings = deterministic.length;

  // 2. Contextual LLM review (cacheable by exact input).
  let llmCandidates: CandidateFinding[] = [];
  if (!options.deterministicOnly) {
    const cacheInput = JSON.stringify({
      configKey,
      models,
      fromSha,
      toSha: snapshot.headSha,
      diff: analysis.redactedDiff,
      evidence: analysis.evidence,
    });
    const cached = cache.get<CandidateFinding[]>("review", cacheInput);
    if (cached && useCache) {
      llmCandidates = cached;
      metrics.cacheHits += 1;
      metrics.byRole!.reviewer.cacheHits += 1;
    } else {
      try {
        options.onProgress?.({ phase: "review", detail: models.reviewer });
        const reviewerDelta = { ...delta, diff: analysis.redactedDiff };
        const result = await runReviewer(metered("reviewer"), models.reviewer, {
          pr: snapshot,
          delta: reviewerDelta,
          evidence: analysis.evidence,
          previousFindings: previous?.findings.filter((f) => f.status !== "RESOLVED") ?? [],
          maxFindings: config.review.maxFindings,
          maxOutputTokens: config.review.maxOutputTokens,
        });
        llmCandidates = result.findings;
        warnings.push(...result.warnings);
        metrics.llmFindings = llmCandidates.length;
        if (useCache) cache.set("review", cacheInput, llmCandidates);
      } catch (error) {
        incomplete = true;
        warnings.push(
          `Reviewer model failed: ${(error as Error).message}. Continuing with deterministic findings only.`,
        );
      }
    }
  }

  // 3. Verifier: deterministic pass is mandatory, LLM pass recalibrates.
  const addedLines = new Map<string, Set<number>>();
  for (const file of reviewableFiles(delta)) {
    addedLines.set(file.path, new Set(file.addedLines));
  }
  const llmCandidateSet = new Set(llmCandidates);
  const verified = deterministicVerify(config, [...deterministic, ...llmCandidates], addedLines, (finding) =>
    llmCandidateSet.has(finding),
  );
  warnings.push(...verified.dropped.map((d) => `Verifier dropped "${d.finding.title}": ${d.reason}`));

  let finalCandidates = verified.findings;
  if (!options.deterministicOnly && !options.skipLlmVerifier && finalCandidates.length > 0) {
    try {
      options.onProgress?.({ phase: "verify", detail: models.verifier });
      // deterministicVerify returns normalised copies, so lock by identity key, not by reference.
      const lockKey = (f: CandidateFinding) => `${f.ruleId}|${f.anchor.file}|${f.anchor.startLine}`;
      const lockedKeys = new Set(deterministic.map(lockKey));
      const pass = await llmVerify(metered("verifier"), models.verifier, finalCandidates, {
        readHead: (path) => redactSecrets(git.readFile(path)).redacted,
        locked: (finding) => lockedKeys.has(lockKey(finding)),
      });
      finalCandidates = pass.findings;
      warnings.push(...pass.dropped.map((d) => `Verifier dropped "${d.finding.title}": ${d.reason}`));
    } catch (error) {
      incomplete = true;
      warnings.push(`Verifier model failed: ${(error as Error).message}. Deterministic verification stands.`);
    }
  }
  metrics.verifiedFindings = finalCandidates.length;

  // 4. Reconcile with the previous ledger.
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

  // 5. Policy gate.
  const gate = evaluateGate(config, findings);

  // 6. Publish (with a stale-head guard for every remote platform).
  let published = false;
  let stale = false;
  if (options.publish && !incomplete) {
    options.onProgress?.({ phase: "publish" });
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
    }
  }

  // 7. Persist state (local always; GitHub only when publishing).
  const nextState = stateOf({
    previous,
    repoId,
    snapshot: { number: snapshot.number, baseSha: snapshot.baseSha, headSha: snapshot.headSha },
    previousReviewedSha: fromSha,
    configKey,
    models,
    findings,
    events: reconciliation.events,
    metrics,
  });
  if (!incomplete && config.memory.backend !== "none" && (scm.kind === "local" || published)) {
    await scm.writeState(encodeState(nextState));
  }

  metrics.durationMs = Date.now() - startedAt;
  metrics.estimatedCostUsd = estimateCost(metrics.byRole!, config.telemetry.pricing);
  for (const [role, usage] of Object.entries(metrics.byRole!)) {
    usage.estimatedCostUsd = estimateCost({ [role]: usage }, config.telemetry.pricing);
  }
  metrics.incomplete = incomplete;
  if (metrics.modelCalls > 0 && metrics.estimatedCostUsd === undefined) {
    warnings.push(
      "Cost unavailable: configure prices for every called deployment (input/output/cachedInput); usage may be missing.",
    );
  } else if (metrics.modelCalls > 0 && metrics.cachedInputTokens === undefined) {
    warnings.push(
      "Provider did not report cached tokens; cost estimate assumes all input at the standard rate.",
    );
  }
  const summary = summaryOf(config, nextState, snapshot, warnings, metrics);
  if (scm.kind === "local" || (published && !stale)) {
    await scm.upsertSummary(summary);
    if (published && !stale && scm.castVote) {
      try {
        await scm.castVote(summary);
      } catch (error) {
        warnings.push(`Could not cast the reviewer vote: ${(error as Error).message}`);
      }
    }
  }
  logRun(config, {
    repository: repoId,
    pullRequest: snapshot.number,
    fromSha,
    headSha: snapshot.headSha,
    skipped: false,
    gatePassed: summary.gatePassed,
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
  };
}

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
    runs: { lastCompleted: new Date().toISOString(), runId: `ar_${randomUUID().slice(0, 8)}` },
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

function summaryOf(
  config: AirReviewConfig,
  state: AirReviewState,
  snapshot: { owner: string; repo: string; number: number | null; baseSha: string; headSha: string },
  warnings: string[],
  liveMetrics?: ReviewMetrics,
): ReviewSummary {
  const counts: Record<string, number> = { BLOCKER: 0, CRITICAL: 0, MAJOR: 0, MINOR: 0, INFO: 0 };
  let open = 0;
  let resolved = 0;
  for (const finding of state.findings) {
    if (finding.status === "RESOLVED") {
      resolved += 1;
      continue;
    }
    counts[finding.severity] = (counts[finding.severity] ?? 0) + 1;
    open += 1;
  }
  const gate = evaluateGate(config, state.findings);
  return {
    pr: { owner: snapshot.owner, repo: snapshot.repo, number: snapshot.number },
    reviewedHeadSha: state.pullRequest.headSha,
    gatePassed: gate.passed,
    counts: counts as ReviewSummary["counts"],
    open,
    resolved,
    metrics: liveMetrics ?? {
      inputTokens: state.metrics.inputTokens,
      outputTokens: state.metrics.outputTokens,
      modelCalls: 0,
      contextRequests: state.metrics.contextRequests,
      cacheHits: state.metrics.cacheHits,
      durationMs: 0,
      deterministicFindings: 0,
      llmFindings: 0,
      verifiedFindings: 0,
    },
    warnings: warnings.slice(0, 20),
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

function addUsage(
  metrics: ReviewMetrics,
  usage: Usage,
  role: "planner" | "reviewer" | "verifier",
  model: string,
): void {
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
    gatePassed: boolean;
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
    gatePassed: input.gatePassed,
    counts: input.summary.counts as Record<string, number>,
    findings: { open: input.summary.open, resolved: input.summary.resolved },
    usage: {
      byRole: input.metrics.byRole ?? {
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
    incomplete: input.metrics.incomplete,
    durationMs: input.metrics.durationMs,
    models: input.models,
  });
}
