/**
 * Review-domain contracts shared by the whole engine.
 *
 * These types follow the taxonomy defined in the air-review architecture:
 * severity is separate from confidence, and scope says where a fix belongs.
 */

import type { Usage } from "./model.js";

export const SEVERITIES = ["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "INFO"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const SCOPES = ["IN_PR", "FOLLOW_UP", "REPO_WIDE"] as const;
export type Scope = (typeof SCOPES)[number];

export const RULE_ORIGINS = ["PROJECT_CONFIG", "FRAMEWORK", "REPO_CONVENTION", "HEURISTIC"] as const;
export type RuleOrigin = (typeof RULE_ORIGINS)[number];

export const FINDING_STATUSES = ["OPEN", "RESOLVED", "REOPENED", "WONT_FIX"] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

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
  /** How the repository compares to the rule: follows a healthy convention,
   *  carries existing debt, or has no established pattern yet. */
  repoStatus?: "CONVENTION" | "EXISTING_DEBT" | "NONE";
  title: string;
  summary: string;
  suggestion?: string;
  /** Optional code example; data only, never terminal formatting or an automatically applied patch. */
  suggestedCode?: { language: string; code: string };
  anchor: FindingAnchor;
  evidence: EvidenceItem[];
  /** Content fingerprint used for incremental reconciliation. */
  fingerprint: string;
  status: FindingStatus;
  firstSeenSha?: string;
  lastCheckedSha?: string;
  /** SCM thread reference once the finding has been published. */
  threadRef?: ThreadRef;
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
}

export interface ReviewSummary {
  pr: { owner: string; repo: string; number: number | null };
  reviewedHeadSha: string;
  gatePassed: boolean;
  counts: Record<Severity, number>;
  open: number;
  resolved: number;
  metrics: ReviewMetrics;
  warnings: string[];
}
