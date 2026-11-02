import type { Finding, RuleOrigin, Severity } from "../contracts/review.js";
import type { RepositoryDelta } from "../contracts/scm.js";
import type { EvidenceBundle, ProjectFacts } from "../context/evidence.js";
import type { FileFacts } from "../context/typescript-facts.js";

/** A finding before it gets an id, fingerprint and lifecycle status. */
export type CandidateFinding = Omit<Finding, "id" | "fingerprint" | "status" | "threadRef">;

export interface RuleContext {
  delta: RepositoryDelta;
  /** Facts for every reviewable changed file. */
  facts: Map<string, FileFacts>;
  /** Every tracked file in the repository (relative paths). */
  trackedFiles: string[];
  /** Read the current working-tree content of a file. */
  readHead: (path: string) => string;
  /** Whole-repository grep for one pattern; returns matching relative paths. */
  grep: (pattern: string) => Promise<string[]>;
  projectFacts: ProjectFacts;
  evidence: EvidenceBundle;
}

export interface DeterministicRule {
  readonly id: string;
  readonly origin: RuleOrigin;
  readonly severity: Severity;
  run(ctx: RuleContext): Promise<CandidateFinding[]>;
}
