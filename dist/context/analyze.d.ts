import type { RepositoryDelta } from "../contracts/scm.js";
import type { GitRepository } from "./repository.js";
import { type FileFacts } from "./typescript-facts.js";
import type { EvidenceBundle, ProjectFacts } from "./evidence.js";
import { scanSecrets } from "../security/redaction.js";
import { type ExemplarBudget, type ExemplarPlan } from "./exemplars.js";
export interface DeltaAnalysis {
    facts: Map<string, FileFacts>;
    evidence: EvidenceBundle;
    secrets: ReturnType<typeof scanSecrets>;
    redactedDiff: string;
    injectionWarnings: string[];
    /** What the planner selected and why; `inspect` shows it, the prompt uses it. */
    plan: ExemplarPlan;
}
/** Defaults match config.context; callers pass the configured values. */
export declare const DEFAULT_EXEMPLAR_BUDGET: ExemplarBudget;
export declare function readProjectFacts(repo: GitRepository): ProjectFacts;
export declare function analyzeDelta(repo: GitRepository, delta: RepositoryDelta, trackedFiles: string[], projectFacts: ProjectFacts, budget?: ExemplarBudget): DeltaAnalysis;
