/**
 * SCM adapter contract. The review engine knows nothing about GitHub URLs
 * or API pagination; it works against this narrow surface.
 */

import type { Finding, ReviewSummary, ThreadRef } from "./review.js";

export interface PullRequestSnapshot {
  owner: string;
  repo: string;
  /** PR number, or null in local mode. */
  number: number | null;
  title: string;
  baseRef: string;
  headRef: string;
  baseSha: string;
  headSha: string;
  headLabel?: string;
}

export interface FileChange {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  oldPath?: string;
  /** 1-based line numbers added by this change (new-file numbering). */
  addedLines: number[];
  /** 1-based line numbers removed (old-file numbering). */
  removedLines: number[];
}

export interface RepositoryDelta {
  fromSha: string;
  toSha: string;
  files: FileChange[];
  /** Raw unified diff text. */
  diff: string;
}

export interface ScmAdapter {
  readonly kind: "github" | "azure-devops" | "local";
  getPullRequest(): Promise<PullRequestSnapshot>;
  getDelta(fromSha: string, toSha: string): Promise<RepositoryDelta>;
  listState(): Promise<string | null>;
  writeState(state: string): Promise<void>;
  createInlineFinding(finding: Finding): Promise<ThreadRef>;
  updateFinding(ref: ThreadRef, finding: Finding): Promise<void>;
  resolveFinding(ref: ThreadRef): Promise<void>;
  /** Create or update the single summary comment; `findings` is the ledger's current state (for the table). */
  upsertSummary(summary: ReviewSummary, findings?: Finding[]): Promise<void>;
  /**
   * Optional: act as a real reviewer of the pull request by casting the
   * summary's verdict (approve, approve with suggestions, request changes).
   * Never merges.
   */
  castVote?(summary: ReviewSummary): Promise<void>;
}
