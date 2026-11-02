import type { AirReviewConfig } from "../config/schema.js";
import type { Finding } from "../contracts/review.js";

export interface GateResult {
  passed: boolean;
  blocking: Finding[];
}

/**
 * Policy gate: which open findings actually block the merge. Only IN_PR
 * findings can block: FOLLOW_UP and REPO_WIDE findings describe work that by
 * definition belongs outside this change.
 */
export function evaluateGate(config: AirReviewConfig, findings: Finding[]): GateResult {
  const severities = new Set(config.review.gate.severities);
  const blocking = findings.filter(
    (f) =>
      (f.status === "OPEN" || f.status === "REOPENED") &&
      f.scope === "IN_PR" &&
      severities.has(f.severity) &&
      f.confidence >= config.review.gate.minimumConfidence,
  );
  return { passed: blocking.length === 0, blocking };
}
