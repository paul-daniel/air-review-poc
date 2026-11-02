/**
 * Complexity routing: which reviewer agent a change deserves.
 *
 * A translation file or a small classification helper does not need the
 * strongest (and most expensive) model; a pull request that cuts across
 * modules does. The triage step measures the change deterministically, asks a
 * cheap triage model only when the measurement is ambiguous, and records a
 * decision that is printed in every report so the choice is auditable.
 */

export const COMPLEXITY_TIERS = ["light", "standard", "heavy"] as const;
export type ComplexityTier = (typeof COMPLEXITY_TIERS)[number];

/** Coarse nature of a changed file, from its path only. */
export type ChangeKind = "translation" | "docs" | "data" | "config" | "tests" | "code" | "binary";

/** Deterministic measurements of a delta; every number is reproducible from the diff. */
export interface ComplexitySignals {
  files: number;
  addedLines: number;
  removedLines: number;
  /** Top-level modules touched (`apps/web`, `libs/shared`, `src`...). */
  modules: string[];
  /** How many changed files fall into each kind. */
  kinds: Partial<Record<ChangeKind, number>>;
  /** True when every changed file is a translation, data, docs or config file. */
  nonCodeOnly: boolean;
  /** True when every changed file is a test. */
  testsOnly: boolean;
  /** Longest single-file change, in added+removed lines. */
  largestFileLines: number;
  /** Files whose names suggest an API surface (exported module index, routes, schema). */
  surfaceFiles: string[];
}

export type RoutingMethod = "deterministic" | "model" | "override" | "disabled";

export interface RoutingDecision {
  tier: ComplexityTier;
  /** Model (or deployment / agent name) chosen for the reviewer role on this run. */
  reviewerModel: string;
  /** Model chosen for the verifier role on this run. */
  verifierModel: string;
  /** Who made the decision. */
  method: RoutingMethod;
  /** Human-readable justification, printed in the summary and the report. */
  reasons: string[];
  signals: ComplexitySignals;
  /** Model used for the triage call when `method` is "model". */
  triageModel?: string;
  /** Triage model's own confidence in its tier, when it was consulted. */
  confidence?: number;
}
