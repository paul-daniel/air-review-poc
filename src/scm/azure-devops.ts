/**
 * Azure DevOps (Azure Repos) pull-request adapter: air-review as a real reviewer.
 *
 * Review memory lives in pull-request threads, so nothing has to exist outside
 * the customer's repository platform:
 *
 *   - one "state" thread (status `closed`, collapsed) whose first comment is the
 *     machine-readable `air-review:state` envelope,
 *   - one "summary" thread (`active` while findings are open, `fixed` once all
 *     were resolved, `closed` when there was nothing to report),
 *   - one inline thread per finding, anchored on the right (head) side of the file.
 *
 * Every comment carries a hidden marker. Before creating anything the adapter
 * looks for the marker in the existing threads, so a lost ledger, a re-run or a
 * second identity never produces a duplicate thread: the existing one is
 * updated or replied to instead.
 *
 * After publishing, the adapter registers the reviewing identity as a reviewer
 * and casts the verdict as a vote (10 approved, 5 approved with suggestions,
 * -5 waiting for author), and can post a pull-request status usable by a
 * "Status" branch policy. It never completes or merges the pull request.
 *
 * All endpoints below are from the Azure DevOps Git REST reference, api-version 7.1:
 * https://learn.microsoft.com/en-us/rest/api/azure/devops/git/
 */

import type { PullRequestSnapshot, RepositoryDelta, ScmAdapter } from "../contracts/scm.js";
import type { Finding, ReviewSummary, ThreadRef } from "../contracts/review.js";
import { ScmError } from "../errors.js";
import type { GitRepository } from "../context/repository.js";
import { parseUnifiedDiff } from "../context/diff.js";
import { STATE_MARKER_OPEN } from "../state/ledger.js";
import { SUMMARY_MARKER_OPEN, upsertSummaryBody } from "../state/summary.js";
import {
  findingIdFromBody,
  findingMarker,
  renderFindingComment,
  renderFollowUpComment,
} from "../state/finding-comment.js";
import {
  AzureDevOpsClient,
  AzureDevOpsHttpError,
  type AzureDevOpsClientOptions,
} from "./azure-devops-http.js";

export interface AzureDevOpsAdapterOptions extends AzureDevOpsClientOptions {
  /** Local checkout used for the diff (the pipeline agent has the repo with `fetchDepth: 0`). */
  git: GitRepository;
  /** Cast the reviewer vote after publishing (default true). */
  vote?: boolean;
  /** Post a pull-request status (`genre/name`) with the gate result (default off). */
  status?: { enabled: boolean; genre: string; name: string };
  /** Build URL shown on the status, e.g. the pipeline run. */
  statusTargetUrl?: string;
}

/** Subset of `GitPullRequest` (Pull Requests - Get Pull Request). */
interface AdoPullRequest {
  pullRequestId: number;
  title?: string;
  sourceRefName?: string;
  targetRefName?: string;
  lastMergeSourceCommit?: { commitId?: string };
  lastMergeTargetCommit?: { commitId?: string };
  repository?: { id?: string; name?: string; project?: { name?: string } };
}

/** `CommentThreadStatus` values that this adapter writes. */
type AdoThreadStatus = "active" | "fixed" | "closed";

/** Subset of `Comment`. */
interface AdoComment {
  id: number;
  content?: string;
  isDeleted?: boolean;
}

/** Subset of `GitPullRequestCommentThread`. */
interface AdoThread {
  id: number;
  status?: string;
  isDeleted?: boolean;
  comments?: AdoComment[];
  threadContext?: { filePath?: string } | null;
}

/** Request body for a new thread (Pull Request Threads - Create). */
interface AdoNewThread {
  comments: Array<{ parentCommentId: 0; content: string; commentType: "text" }>;
  status: AdoThreadStatus;
  threadContext?: {
    filePath: string;
    rightFileStart: { line: number; offset: number };
    rightFileEnd: { line: number; offset: number };
  };
}

/** Reviewer vote values (Pull Request Reviewers - Create Pull Request Reviewer, `vote`). */
export const ADO_VOTE = {
  approved: 10,
  approvedWithSuggestions: 5,
  noVote: 0,
  waitingForAuthor: -5,
  rejected: -10,
} as const;

/** Verdict → vote. `comment` keeps the reviewer registered without a vote. */
export function voteForVerdict(verdict: ReviewSummary["verdict"]): number {
  switch (verdict) {
    case "approve":
      return ADO_VOTE.approved;
    case "approve-with-suggestions":
      return ADO_VOTE.approvedWithSuggestions;
    case "request-changes":
      return ADO_VOTE.waitingForAuthor;
    default:
      return ADO_VOTE.noVote;
  }
}

export class AzureDevOpsAdapter implements ScmAdapter {
  readonly kind = "azure-devops" as const;
  private readonly client: AzureDevOpsClient;
  private snapshot: PullRequestSnapshot | null = null;
  /** Thread list cache for one publish pass (invalidated after every write). */
  private threadCache: AdoThread[] | null = null;
  /** Azure DevOps rejects unauthenticated calls; exposed for `doctor`. */
  readonly authenticated: boolean;

  constructor(private readonly options: AzureDevOpsAdapterOptions) {
    this.client = new AzureDevOpsClient(options);
    this.authenticated = this.client.authenticated;
  }

  /**
   * GET {org}/{project}/_apis/git/repositories/{repositoryId}/pullRequests/{pullRequestId}?api-version=7.1
   * https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-requests/get-pull-request?view=azure-devops-rest-7.1
   */
  async getPullRequest(): Promise<PullRequestSnapshot> {
    let data: AdoPullRequest;
    try {
      data = await this.client.request<AdoPullRequest>("GET", "");
    } catch (error) {
      throw new ScmError(
        `Could not read pull request !${this.options.pullRequestId}: ${(error as Error).message}`,
        {
          cause: error,
        },
      );
    }
    const baseSha = data.lastMergeTargetCommit?.commitId;
    const headSha = data.lastMergeSourceCommit?.commitId;
    if (!baseSha || !headSha) {
      throw new ScmError(
        `Pull request !${this.options.pullRequestId} has no merge commits yet (lastMergeSourceCommit/lastMergeTargetCommit). ` +
          `Azure DevOps is still computing the merge; re-run in a moment.`,
      );
    }
    this.snapshot = {
      owner: data.repository?.project?.name ?? this.options.project,
      repo: data.repository?.name ?? this.options.repositoryId,
      number: data.pullRequestId ?? this.options.pullRequestId,
      title: data.title ?? `Pull request ${this.options.pullRequestId}`,
      baseRef: branchName(data.targetRefName),
      headRef: branchName(data.sourceRefName),
      baseSha,
      headSha,
    };
    return this.snapshot;
  }

  /**
   * The diff is computed locally: the agent has the repository checked out
   * (`fetchDepth: 0`), and pull-request semantics mean comparing from the
   * merge base so commits that landed on the target branch do not show up.
   */
  async getDelta(fromSha: string, toSha: string): Promise<RepositoryDelta> {
    let mergeBase: string;
    try {
      mergeBase = await this.options.git.mergeBase(fromSha, toSha);
    } catch (error) {
      throw new ScmError(
        `Could not compute the merge base of ${fromSha.slice(0, 8)} and ${toSha.slice(0, 8)}: ${(error as Error).message}. ` +
          `The checkout is probably shallow: set \`fetchDepth: 0\` on the pipeline's checkout step ` +
          `(- checkout: self / fetchDepth: 0 / persistCredentials: true).`,
        { cause: error },
      );
    }
    const diff = await this.options.git.diff(mergeBase, toSha);
    return parseUnifiedDiff(diff, mergeBase, toSha);
  }

  /**
   * GET .../pullRequests/{pullRequestId}/threads?api-version=7.1
   * https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-threads/list?view=azure-devops-rest-7.1
   */
  private async threads(): Promise<AdoThread[]> {
    if (this.threadCache) return this.threadCache;
    try {
      const all = await this.client.list<AdoThread>("/threads");
      this.threadCache = all.filter((thread) => !thread.isDeleted);
      return this.threadCache;
    } catch (error) {
      throw new ScmError(`Could not list pull request threads: ${(error as Error).message}`, {
        cause: error,
      });
    }
  }

  private invalidate(): void {
    this.threadCache = null;
  }

  /** The first live comment of a thread is where air-review keeps its markers. */
  private static firstComment(thread: AdoThread): AdoComment | undefined {
    return thread.comments?.find((comment) => !comment.isDeleted);
  }

  /** The newest thread carrying the marker: a replacement thread supersedes an older one. */
  private async findByMarker(marker: string): Promise<{ thread: AdoThread; comment: AdoComment } | null> {
    let found: { thread: AdoThread; comment: AdoComment } | null = null;
    for (const thread of await this.threads()) {
      const comment = AzureDevOpsAdapter.firstComment(thread);
      if (comment?.content?.includes(marker) && (!found || thread.id > found.thread.id)) {
        found = { thread, comment };
      }
    }
    return found;
  }

  /**
   * Azure DevOps lets only a comment's author (or a project admin) edit it. When
   * a review was first published by one identity (a developer's PAT) and later
   * by another (the pipeline's build service), edits are refused with 403. The
   * adapter then falls back to creating a replacement thread or a reply.
   */
  private static isAuthorRefusal(error: unknown): boolean {
    return (
      error instanceof AzureDevOpsHttpError && error.status === 403 && /comment author/i.test(error.message)
    );
  }

  /** Best effort: closing a thread we no longer own may itself be refused. */
  private async tryClose(threadId: number): Promise<void> {
    try {
      await this.setThreadStatus(threadId, "closed");
    } catch {
      /* not ours to close */
    }
  }

  /**
   * POST .../pullRequests/{pullRequestId}/threads?api-version=7.1
   * https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-threads/create?view=azure-devops-rest-7.1
   */
  private async createThread(body: AdoNewThread): Promise<{ threadId: number; commentId: number }> {
    const created = await this.client.request<AdoThread>("POST", "/threads", body);
    this.invalidate();
    const commentId = AzureDevOpsAdapter.firstComment(created)?.id ?? 1;
    return { threadId: created.id, commentId };
  }

  /**
   * PATCH .../pullRequests/{pullRequestId}/threads/{threadId}/comments/{commentId}?api-version=7.1
   * https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-thread-comments/update?view=azure-devops-rest-7.1
   */
  private async updateComment(threadId: number, commentId: number, content: string): Promise<void> {
    await this.client.request("PATCH", `/threads/${threadId}/comments/${commentId}`, { content });
    this.invalidate();
  }

  /**
   * PATCH .../pullRequests/{pullRequestId}/threads/{threadId}?api-version=7.1
   * https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-threads/update?view=azure-devops-rest-7.1
   */
  private async setThreadStatus(threadId: number, status: AdoThreadStatus): Promise<void> {
    await this.client.request("PATCH", `/threads/${threadId}`, { status });
    this.invalidate();
  }

  /**
   * POST .../pullRequests/{pullRequestId}/threads/{threadId}/comments?api-version=7.1
   * https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-thread-comments/create?view=azure-devops-rest-7.1
   */
  private async replyTo(threadId: number, parentCommentId: number, content: string): Promise<void> {
    await this.client.request("POST", `/threads/${threadId}/comments`, {
      content,
      parentCommentId,
      commentType: "text",
    });
    this.invalidate();
  }

  /**
   * Human decisions on finding threads. The adapter itself only ever sets
   * `active` (open) and `fixed` (resolved) on a finding thread, so `wontFix`,
   * `byDesign` and `closed` can only come from a person.
   */
  async listDismissedFindings(): Promise<Set<string>> {
    const dismissed = new Set<string>();
    for (const thread of await this.threads()) {
      const comment = AzureDevOpsAdapter.firstComment(thread);
      const id = comment?.content ? findingIdFromBody(comment.content) : null;
      if (id && thread.status && ["wontfix", "bydesign", "closed"].includes(thread.status.toLowerCase())) {
        dismissed.add(id);
      }
    }
    return dismissed;
  }

  async listState(): Promise<string | null> {
    const found = await this.findByMarker(STATE_MARKER_OPEN);
    return found?.comment.content ?? null;
  }

  async writeState(body: string): Promise<void> {
    const existing = await this.findByMarker(STATE_MARKER_OPEN);
    // `closed` keeps the machine-readable thread collapsed in the PR view.
    const fresh: AdoNewThread = {
      comments: [{ parentCommentId: 0, content: body, commentType: "text" }],
      status: "closed",
    };
    try {
      if (!existing) {
        await this.createThread(fresh);
        return;
      }
      try {
        await this.updateComment(existing.thread.id, existing.comment.id, body);
      } catch (error) {
        if (!AzureDevOpsAdapter.isAuthorRefusal(error)) throw error;
        // Another identity wrote the previous state: start a replacement thread
        // (findByMarker prefers the newest) and park the old one.
        await this.createThread(fresh);
        await this.tryClose(existing.thread.id);
      }
    } catch (error) {
      throw new ScmError(`Could not write state thread: ${(error as Error).message}`, { cause: error });
    }
  }

  /**
   * One thread per finding, never two: if a thread already carries this
   * finding's marker (ledger lost, manual re-run, earlier identity), it is
   * updated and reactivated instead of being created again.
   */
  async createInlineFinding(finding: Finding): Promise<ThreadRef> {
    if (!this.snapshot) throw new ScmError("Pull request snapshot not loaded");
    const existing = await this.findByMarker(findingMarker(finding.id));
    if (existing) {
      const ref = {
        platform: "azure-devops" as const,
        id: threadRefId(existing.thread.id, existing.comment.id),
      };
      await this.updateFinding(ref, finding);
      if (existing.thread.status && existing.thread.status !== "active") {
        try {
          await this.setThreadStatus(existing.thread.id, "active");
        } catch {
          /* status change refused: the updated content still stands */
        }
      }
      return ref;
    }
    try {
      const { threadId, commentId } = await this.createThread({
        comments: [{ parentCommentId: 0, content: renderFindingComment(finding), commentType: "text" }],
        status: "active",
        threadContext: {
          // Azure DevOps paths are repository-absolute: "/src/app.ts".
          filePath: `/${finding.anchor.file.replace(/^\/+/, "")}`,
          rightFileStart: { line: finding.anchor.startLine, offset: 1 },
          rightFileEnd: { line: Math.max(finding.anchor.endLine, finding.anchor.startLine), offset: 1 },
        },
      });
      return { platform: "azure-devops", id: threadRefId(threadId, commentId) };
    } catch (error) {
      throw new ScmError(
        `Could not publish finding ${finding.id} at ${finding.anchor.file}:${finding.anchor.startLine}: ${(error as Error).message}`,
        { cause: error },
      );
    }
  }

  async updateFinding(ref: ThreadRef, finding: Finding): Promise<void> {
    const { threadId, commentId } = parseThreadRef(ref);
    const content = renderFindingComment(finding);
    try {
      try {
        await this.updateComment(threadId, commentId, content);
      } catch (error) {
        if (!AzureDevOpsAdapter.isAuthorRefusal(error)) throw error;
        // Not our comment to edit: append the updated finding as a reply instead.
        await this.replyTo(
          threadId,
          commentId,
          `**Updated on ${this.snapshot?.headSha.slice(0, 8) ?? "the current head"}**\n\n${content}`,
        );
      }
      if (finding.status === "REOPENED") {
        try {
          await this.setThreadStatus(threadId, "active");
        } catch {
          /* best effort */
        }
      }
    } catch (error) {
      throw new ScmError(`Could not update finding ${finding.id}: ${(error as Error).message}`, {
        cause: error,
      });
    }
  }

  /** Continue the finding's thread: a reply with what is still to be done, thread back to active. */
  async replyToFinding(ref: ThreadRef, finding: Finding): Promise<void> {
    const { threadId, commentId } = parseThreadRef(ref);
    const head = this.snapshot?.headSha ?? "";
    try {
      await this.replyTo(threadId, commentId, renderFollowUpComment(finding, head));
      try {
        await this.setThreadStatus(threadId, "active");
      } catch {
        /* status change refused by the platform: the reply still stands */
      }
    } catch (error) {
      throw new ScmError(
        `Could not reply in the thread of finding ${finding.id}: ${(error as Error).message}`,
        {
          cause: error,
        },
      );
    }
  }

  async resolveFinding(ref: ThreadRef): Promise<void> {
    const { threadId, commentId } = parseThreadRef(ref);
    const head = this.snapshot?.headSha.slice(0, 8) ?? "the current head";
    try {
      await this.replyTo(
        threadId,
        commentId,
        `✅ **Resolved** — air-review no longer detects this issue on ${head}.`,
      );
      await this.setThreadStatus(threadId, "fixed");
    } catch (error) {
      throw new ScmError(`Could not resolve finding thread ${ref.id}: ${(error as Error).message}`, {
        cause: error,
      });
    }
  }

  async upsertSummary(summary: ReviewSummary, findings: Finding[] = []): Promise<void> {
    const existing = await this.findByMarker(SUMMARY_MARKER_OPEN);
    // Azure DevOps does not render Mermaid: the diagram is shown as source.
    const body = upsertSummaryBody(existing?.comment.content ?? "", summary, { findings, mermaid: false });
    // Active while findings are open; "fixed" once every finding was resolved (the
    // team sees the review as settled); "closed" when there was nothing to report.
    const status: AdoThreadStatus = summary.open > 0 ? "active" : summary.resolved > 0 ? "fixed" : "closed";
    const fresh: AdoNewThread = {
      comments: [{ parentCommentId: 0, content: body, commentType: "text" }],
      status,
    };
    try {
      if (!existing) {
        await this.createThread(fresh);
        return;
      }
      try {
        await this.updateComment(existing.thread.id, existing.comment.id, body);
        if (existing.thread.status !== status) await this.setThreadStatus(existing.thread.id, status);
      } catch (error) {
        if (!AzureDevOpsAdapter.isAuthorRefusal(error)) throw error;
        await this.createThread(fresh);
        await this.tryClose(existing.thread.id);
      }
    } catch (error) {
      throw new ScmError(`Could not write summary thread: ${(error as Error).message}`, { cause: error });
    }
  }

  /**
   * Act as a reviewer: register the reviewing identity (the PAT's user, or the
   * pipeline's build service) and cast the verdict as a vote:
   *   10  approved                  - nothing open
   *    5  approved with suggestions - open findings, none blocking
   *   -5  waiting for author        - blocking findings (the gate failed)
   *    0  no vote                   - incomplete review (never vote on partial data)
   * Optionally posts a pull-request status for a "Status" branch policy.
   * The vote never completes or merges the pull request.
   *
   * GET  {org}/_apis/connectionData                       -> authenticatedUser.id
   * PUT  .../pullRequests/{id}/reviewers/{reviewerId}     body { vote, id }
   * https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-reviewers/create-pull-request-reviewer?view=azure-devops-rest-7.1
   * POST .../pullRequests/{id}/statuses                   body { state, context, description }
   * https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-statuses/create?view=azure-devops-rest-7.1
   */
  async castVote(summary: ReviewSummary): Promise<void> {
    if (this.options.vote !== false) {
      const vote = voteForVerdict(summary.verdict);
      try {
        const me = await this.client.requestOrg<{ authenticatedUser?: { id?: string } }>(
          "GET",
          "/_apis/connectionData",
          undefined,
          "7.1-preview.1", // connectionData is a preview resource and rejects a plain "7.1"
        );
        const reviewerId = me.authenticatedUser?.id;
        if (!reviewerId) throw new ScmError("connectionData did not return the authenticated user");
        await this.client.request("PUT", `/reviewers/${reviewerId}`, { vote, id: reviewerId });
      } catch (error) {
        throw new ScmError(`Could not vote on the pull request: ${(error as Error).message}`, {
          cause: error,
        });
      }
    }
    if (this.options.status?.enabled) {
      const state = summary.metrics.incomplete ? "error" : summary.gatePassed ? "succeeded" : "failed";
      const description = summary.metrics.incomplete
        ? "air-review could not complete (model error)"
        : summary.gatePassed
          ? `air-review: gate passed (${summary.open} open, none blocking)`
          : `air-review: ${summary.open} open finding(s), blocking issues must be fixed`;
      try {
        await this.client.request("POST", "/statuses", {
          state,
          description,
          context: { genre: this.options.status.genre, name: this.options.status.name },
          ...(this.options.statusTargetUrl ? { targetUrl: this.options.statusTargetUrl } : {}),
        });
      } catch (error) {
        throw new ScmError(`Could not post the pull request status: ${(error as Error).message}`, {
          cause: error,
        });
      }
    }
  }
}

/** `refs/heads/feature/x` → `feature/x`; anything else is returned as is. */
function branchName(ref: string | undefined): string {
  return (ref ?? "").replace(/^refs\/heads\//, "");
}

/** ThreadRef ids are `${threadId}:${commentId}` so an update needs no listing. */
export function threadRefId(threadId: number, commentId: number): string {
  return `${threadId}:${commentId}`;
}

export function parseThreadRef(ref: ThreadRef): { threadId: number; commentId: number } {
  const [thread, comment] = ref.id.split(":");
  const threadId = Number(thread);
  const commentId = comment === undefined ? 1 : Number(comment);
  if (!Number.isInteger(threadId) || !Number.isInteger(commentId)) {
    throw new ScmError(
      `Malformed Azure DevOps thread reference "${ref.id}" (expected "<threadId>:<commentId>").`,
    );
  }
  return { threadId, commentId };
}
