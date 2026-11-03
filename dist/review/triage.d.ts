import type { ModelProvider, Usage } from "../contracts/model.js";
import type { RepositoryDelta } from "../contracts/scm.js";
import type { AirReviewConfig } from "../config/schema.js";
import type { ChangeKind, ComplexitySignals, ComplexityTier, RoutingDecision } from "../contracts/routing.js";
import type { RoleModels, TierModels } from "../model/router.js";
export declare function changeKindOf(path: string): ChangeKind;
/** `apps/web/src/app/x.ts` → `apps/web`; `src/app/x.ts` → `src`; `README.md` → `(root)`. */
export declare function moduleOf(path: string): string;
export declare function measureComplexity(delta: RepositoryDelta): ComplexitySignals;
export interface DeterministicTriage {
    tier: ComplexityTier;
    reasons: string[];
    /** True when the thresholds did not clearly decide (standard band): a triage model may refine it. */
    ambiguous: boolean;
}
export declare function triageDeterministically(signals: ComplexitySignals, routing: AirReviewConfig["routing"]): DeterministicTriage;
export interface TriageModelResult {
    tier: ComplexityTier;
    confidence: number;
    reasons: string[];
    usage: Usage;
}
/** System prompt of the Triage role; also the instructions of the `air-review-triage` Foundry agent. */
export declare const TRIAGE_SYSTEM_PROMPT: string;
export declare function runTriageModel(provider: ModelProvider, model: string, input: {
    delta: RepositoryDelta;
    signals: ComplexitySignals;
    pre: DeterministicTriage;
    maxDiffChars?: number;
}): Promise<TriageModelResult>;
export interface DecideRoutingInput {
    config: AirReviewConfig;
    delta: RepositoryDelta;
    models: RoleModels;
    tiers: TierModels;
    /** `--tier` on the command line: forces the decision. */
    override?: ComplexityTier;
    /** Provider for the triage model; omitted when no model call is allowed. */
    provider?: ModelProvider;
}
/**
 * The routing decision for one run. Model usage of the triage call, when any,
 * is reported through `usage` so the pipeline can meter it.
 */
export declare function decideRouting(input: DecideRoutingInput): Promise<{
    decision: RoutingDecision;
    usage?: Usage;
    warning?: string;
}>;
