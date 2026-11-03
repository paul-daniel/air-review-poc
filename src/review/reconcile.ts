import type { Finding } from "../contracts/review.js";
import type { RepositoryDelta } from "../contracts/scm.js";
import { findingFingerprint, findingId } from "./fingerprint.js";
import type { CandidateFinding } from "../framework/rules.js";

export interface ReconciledRun {
  findings: Finding[];
  events: Array<{ event: string; findingId: string; detail?: string }>;
  resolved: Finding[];
  newOrReopened: Finding[];
}

/**
 * Merge the fresh candidates with the previous ledger:
 * - unchanged findings keep their state and thread reference;
 * - a finding whose anchor is removed and no longer emitted is treated as fixed;
 * - a finding that reappears after being resolved is reopened.
 */
export interface ReconcileOptions {
  /**
   * True when `delta` starts at the previously reviewed head, so previous
   * anchors are in `delta.fromSha` coordinates and must be shifted by the
   * lines added/removed since. False for a full re-review from the base
   * (first run, `--force`, config change): previous anchors already describe
   * the current head and must not be moved.
   */
  incremental: boolean;
  /**
   * Rule ids produced by deterministic rules. Model findings invent their own
   * rule names ("discount-percent-misuse" one run, "discount-percent-calculation"
   * the next), so two model findings in the same file within a few lines of
   * each other are treated as the same finding and keep the earlier id.
   */
  isDeterministicRule?: (ruleId: string) => boolean;
}

/** How far apart (in lines) two model findings may be and still be "the same" finding. */
const MODEL_MATCH_LINE_TOLERANCE = 3;

export function reconcile(
  previous: Finding[],
  candidates: CandidateFinding[],
  delta: RepositoryDelta,
  configHash: string,
  headSha: string,
  options: ReconcileOptions = { incremental: true },
): ReconciledRun {
  const events: ReconciledRun["events"] = [];
  const claimedIds = new Set<string>();

  const candidatesWithIdentity = candidates.map((candidate) => {
    const computedId = findingId({
      ruleId: candidate.ruleId,
      file: candidate.anchor.file,
      symbol: candidate.anchor.symbol,
    });
    const exact = previous.find((f) => f.id === computedId);
    const fuzzy =
      exact ??
      previous
        .filter(
          (f) =>
            !claimedIds.has(f.id) &&
            f.ruleId === candidate.ruleId &&
            f.anchor.file === candidate.anchor.file &&
            (f.anchor.symbol ?? undefined) === (candidate.anchor.symbol ?? undefined),
        )
        .sort(
          (a, b) =>
            Math.abs(a.anchor.startLine - candidate.anchor.startLine) -
            Math.abs(b.anchor.startLine - candidate.anchor.startLine),
        )[0];
    const isDeterministic = options.isDeterministicRule ?? (() => false);
    const byProximity =
      fuzzy || isDeterministic(candidate.ruleId)
        ? undefined
        : previous
            .filter(
              (f) =>
                !claimedIds.has(f.id) &&
                !isDeterministic(f.ruleId) &&
                f.anchor.file === candidate.anchor.file &&
                Math.abs(f.anchor.startLine - candidate.anchor.startLine) <= MODEL_MATCH_LINE_TOLERANCE,
            )
            // Nearest first; on a tie prefer a finding that is still open over one
            // already resolved, so an open thread is continued rather than reopening an old one.
            .sort(
              (a, b) =>
                Math.abs(a.anchor.startLine - candidate.anchor.startLine) -
                  Math.abs(b.anchor.startLine - candidate.anchor.startLine) ||
                Number(a.status === "RESOLVED" || a.status === "WONT_FIX") -
                  Number(b.status === "RESOLVED" || b.status === "WONT_FIX"),
            )[0];
    const previousMatch = fuzzy ?? byProximity;
    const id = previousMatch?.id ?? computedId;
    claimedIds.add(id);
    const fingerprint = findingFingerprint(
      {
        ruleId: candidate.ruleId,
        anchor: candidate.anchor,
        severity: candidate.severity,
        scope: candidate.scope,
      },
      configHash,
    );
    const status: Finding["status"] = previousMatch?.status === "RESOLVED" ? "REOPENED" : "OPEN";
    if (previousMatch?.status === "RESOLVED") {
      events.push({ event: "reopened", findingId: id, detail: "finding reappeared after fix" });
    }
    return {
      id,
      fingerprint,
      finding: {
        ...candidate,
        id,
        fingerprint,
        status,
        firstSeenSha: previousMatch?.firstSeenSha ?? headSha,
        lastCheckedSha: headSha,
        threadRef: previousMatch?.threadRef,
      } satisfies Finding,
    };
  });

  const currentIds = new Set(candidatesWithIdentity.map((c) => c.id));
  const resolved: Finding[] = [];
  const carried: Finding[] = [];

  for (const old of previous) {
    if (currentIds.has(old.id)) continue; // handled above
    const change = delta.files.find((f) => f.path === old.anchor.file || f.oldPath === old.anchor.file);
    const anchorChanged =
      change?.status === "deleted" ||
      (options.incremental &&
        change?.removedLines.some((line) => line >= old.anchor.startLine && line <= old.anchor.endLine));
    // A full re-review looked at the whole change again and did not report this
    // finding: it is gone (fixed, superseded by another finding, or no longer
    // considered an issue). Only an incremental run keeps unreported findings,
    // because it never re-examined their code.
    const notReportedByFullReview =
      !options.incremental && old.status !== "RESOLVED" && old.status !== "WONT_FIX";
    if (
      (anchorChanged || notReportedByFullReview) &&
      old.status !== "RESOLVED" &&
      old.status !== "WONT_FIX"
    ) {
      const fixed = { ...old, status: "RESOLVED" as const, lastCheckedSha: headSha };
      resolved.push(fixed);
      events.push({
        event: "resolved",
        findingId: old.id,
        detail: anchorChanged ? "offending code changed" : "not reported by the full re-review",
      });
      carried.push(fixed);
    } else if (options.incremental && change) {
      const removedBefore = change.removedLines.filter((line) => line < old.anchor.startLine).length;
      let startLine = old.anchor.startLine - removedBefore;
      for (const line of [...change.addedLines].sort((a, b) => a - b)) {
        if (line <= startLine) startLine += 1;
      }
      carried.push({
        ...old,
        lastCheckedSha: headSha,
        anchor: {
          ...old.anchor,
          file: change.path,
          startLine,
          endLine: startLine + old.anchor.endLine - old.anchor.startLine,
        },
      });
    } else {
      // Full re-review, or a file outside the delta: the anchor is already in head coordinates.
      carried.push({ ...old, lastCheckedSha: headSha });
    }
  }

  const findings = [...carried, ...candidatesWithIdentity.map((c) => c.finding)].sort(
    (a, b) => severityRank(a.severity) - severityRank(b.severity) || b.confidence - a.confidence,
  );

  return {
    findings,
    events,
    resolved,
    newOrReopened: candidatesWithIdentity
      .map((c) => c.finding)
      .filter((f) => f.status === "OPEN" || f.status === "REOPENED"),
  };
}

function severityRank(severity: Finding["severity"]): number {
  return { BLOCKER: 0, CRITICAL: 1, MAJOR: 2, MINOR: 3, NITPICK: 4, INFO: 5 }[severity];
}
