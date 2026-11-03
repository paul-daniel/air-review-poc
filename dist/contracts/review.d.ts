/**
 * Review-domain contracts shared by the whole engine.
 *
 * These types follow the taxonomy defined in the air-review architecture:
 * severity is separate from confidence, and scope says where a fix belongs.
 */
import type { Usage } from "./model.js";
import type { RoutingDecision } from "./routing.js";
import type { RunTraceSummary } from "./trace.js";
/**
 * BLOCKER / CRITICAL / MAJOR / MINOR must be fixed before approval.
 * NITPICK is a reviewer preference (the code is correct); INFO is existing
 * debt or a follow-up. Neither blocks.
 */
export declare const SEVERITIES: readonly ["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "NITPICK", "INFO"];
export type Severity = (typeof SEVERITIES)[number];
export declare const SCOPES: readonly ["IN_PR", "FOLLOW_UP", "REPO_WIDE"];
export type Scope = (typeof SCOPES)[number];
export declare const RULE_ORIGINS: readonly ["PROJECT_CONFIG", "FRAMEWORK", "REPO_CONVENTION", "HEURISTIC"];
export type RuleOrigin = (typeof RULE_ORIGINS)[number];
export declare const FINDING_STATUSES: readonly ["OPEN", "RESOLVED", "REOPENED", "WONT_FIX"];
export type FindingStatus = (typeof FINDING_STATUSES)[number];
/**
 * What kind of problem a finding describes. Orthogonal to severity (how bad)
 * and confidence (how sure): a reader scanning a pull request filters on it,
 * which is why the main AI reviewers (CodeRabbit, Qodo) label every comment
 * with one. See docs/review-format.md.
 */
export declare const FINDING_CATEGORIES: readonly ["correctness", "security", "performance", "maintainability", "consistency", "tests", "docs"];
export type FindingCategory = (typeof FINDING_CATEGORIES)[number];
/** Stable location of a finding inside the head revision of a PR. */
export interface FindingAnchor {
    /** Repository-relative file path. */
    file: string;
    /** 1-based line numbers in the *new* (head) version of the file. */
    startLine: number;
    endLine: number;
    /** Nearest known symbol, when structural analysis could find one. */
    symbol?: string;
    /**
     * False when the finding sits on unchanged lines of a changed file: code the
     * change interacts with rather than code it touched. Such findings are
     * published as FOLLOW_UP and, on platforms that cannot anchor a comment
     * outside the diff, as a general pull-request comment.
     */
    inDiff?: boolean;
}
/** One piece of supporting evidence shown with the finding. */
export interface EvidenceItem {
    kind: "code-example" | "convention" | "config" | "history" | "framework" | "reference";
    label: string;
    detail?: string;
    /** Content hash of the evidence source, used for incremental revalidation. */
    hash?: string;
}
export interface Finding {
    /** Stable id, e.g. `arf_7d0b9f`. Derived from rule + file + symbol + anchor. */
    id: string;
    ruleId: string;
    ruleOrigin: RuleOrigin;
    severity: Severity;
    /** Model confidence that the finding is real and actionable. 0..1. */
    confidence: number;
    scope: Scope;
    /** Problem family; defaults to "correctness" when a rule does not say. */
    category?: FindingCategory;
    /** How the repository compares to the rule: follows a healthy convention,
     *  carries existing debt, or has no established pattern yet. */
    repoStatus?: "CONVENTION" | "EXISTING_DEBT" | "NONE";
    title: string;
    summary: string;
    suggestion?: string;
    /**
     * Optional code example; data only, never terminal formatting or an
     * automatically applied patch. `replacesAnchor` is true only when the code
     * is an exact drop-in replacement of the anchored lines, which lets GitHub
     * render it as a one-click committable suggestion.
     */
    suggestedCode?: {
        language: string;
        code: string;
        replacesAnchor?: boolean;
    };
    anchor: FindingAnchor;
    evidence: EvidenceItem[];
    /** Content fingerprint used for incremental reconciliation. */
    fingerprint: string;
    status: FindingStatus;
    firstSeenSha?: string;
    lastCheckedSha?: string;
    /** SCM thread reference once the finding has been published. */
    threadRef?: ThreadRef;
    /**
     * True when this push changed the code around the finding but the finding
     * still stands: the reviewer then continues in the existing thread with the
     * remaining change to make, instead of editing the first comment.
     */
    changedSinceLastReview?: boolean;
}
export interface ThreadRef {
    platform: "github" | "azure-devops" | "local";
    /** GitHub review-comment id, Azure DevOps `${threadId}:${commentId}`, or a local file entry id. */
    id: string;
}
export interface RoleUsage extends Usage {
    estimatedCostUsd?: number;
    model?: string;
    inputTokens: number;
    outputTokens: number;
    modelCalls: number;
    cacheHits: number;
}
export interface RoleUsageMap {
    triage: RoleUsage;
    planner: RoleUsage;
    reviewer: RoleUsage;
    verifier: RoleUsage;
}
export interface ReviewMetrics extends Usage {
    inputTokens: number;
    outputTokens: number;
    modelCalls: number;
    contextRequests: number;
    cacheHits: number;
    durationMs: number;
    deterministicFindings: number;
    llmFindings: number;
    verifiedFindings: number;
    /** Token usage per logical agent role. */
    byRole?: RoleUsageMap;
    /** Estimated run cost, present only when telemetry.pricing covers the models. */
    estimatedCostUsd?: number;
    incomplete?: boolean;
    /** Which reviewer agent was chosen and why. */
    routing?: RoutingDecision;
    /** Step-by-step trace: duration, agent, tokens and cost of every step taken. */
    trace?: RunTraceSummary;
}
/** The review's verdict as a reviewer would cast it on the pull request. */
export type ReviewVerdict = "approve" | "approve-with-suggestions" | "request-changes" | "comment";
export interface ReviewSummary {
    pr: {
        owner: string;
        repo: string;
        number: number | null;
    };
    reviewedHeadSha: string;
    gatePassed: boolean;
    verdict: ReviewVerdict;
    /** Short lifecycle events of this run ("resolved arf_1", "reopened arf_2"), newest last. */
    events?: Array<{
        event: string;
        findingId: string;
        detail?: string;
    }>;
    /** Mermaid flowchart of the path this run actually took (see telemetry/workflow-diagram.ts). */
    workflowDiagram?: string;
    /** Why the run did not review anything new (same head, docs-only push...). */
    skippedReason?: string;
    counts: Record<Severity, number>;
    open: number;
    resolved: number;
    metrics: ReviewMetrics;
    warnings: string[];
}
