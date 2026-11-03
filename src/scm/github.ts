import { Octokit } from "@octokit/rest";
import type { PullRequestSnapshot, RepositoryDelta, ScmAdapter } from "../contracts/scm.js";
import type { Finding, ReviewSummary, ThreadRef } from "../contracts/review.js";
import { ScmError } from "../errors.js";
import { parseUnifiedDiff } from "../context/diff.js";
import { STATE_MARKER_OPEN } from "../state/ledger.js";
import { SUMMARY_MARKER_OPEN } from "../state/summary.js";
import { renderFindingComment, renderFollowUpComment } from "../state/finding-comment.js";

export interface GitHubAdapterOptions {
  owner: string;
  repo: string;
  pullNumber: number;
  token?: string;
  apiBaseUrl?: string;
  /** Inject for tests; production uses the real REST client. */
  octokit?: Octokit;
}

/** ThreadRef id prefix for findings published as general PR comments rather than review comments. */
/** Marker of a follow-up posted as a general comment (it never replaces the finding's own marker). */
function findingMarkerReply(id: string): string {
  return `<!-- air-review:follow-up:${id} -->`;
}

const GENERAL_COMMENT_PREFIX = "issue:";

export class GitHubAdapter implements ScmAdapter {
  readonly kind = "github" as const;
  private readonly octokit: Octokit;
  private snapshot: PullRequestSnapshot | null = null;
  /** Unauthenticated reads are allowed; writes require a token. */
  readonly authenticated: boolean;

  constructor(private readonly options: GitHubAdapterOptions) {
    this.authenticated = Boolean(options.token);
    this.octokit =
      options.octokit ??
      new Octokit({
        ...(options.token ? { auth: options.token } : {}),
        ...(options.apiBaseUrl ? { baseUrl: options.apiBaseUrl } : {}),
      });
  }

  /** Fail with an actionable message when a write is attempted without a token. */
  private requireToken(action: string): void {
    if (!this.authenticated) {
      throw new ScmError(
        `Cannot ${action}: no GitHub token available. Set GH_TOKEN or GITHUB_TOKEN ` +
          `(or the configured tokenEnv), or pass --ci local for a local review.`,
      );
    }
  }

  async getPullRequest(): Promise<PullRequestSnapshot> {
    try {
      const { data } = await this.octokit.rest.pulls.get({
        owner: this.options.owner,
        repo: this.options.repo,
        pull_number: this.options.pullNumber,
      });
      this.snapshot = {
        owner: this.options.owner,
        repo: this.options.repo,
        number: data.number,
        title: data.title,
        baseRef: data.base.ref,
        headRef: data.head.ref,
        baseSha: data.base.sha,
        headSha: data.head.sha,
        headLabel: data.head.label,
      };
      return this.snapshot;
    } catch (error) {
      throw new ScmError(
        `Could not read pull request #${this.options.pullNumber}: ${(error as Error).message}`,
        {
          cause: error,
        },
      );
    }
  }

  async getDelta(fromSha: string, toSha: string): Promise<RepositoryDelta> {
    try {
      const response = await this.octokit.rest.repos.compareCommits({
        owner: this.options.owner,
        repo: this.options.repo,
        base: fromSha,
        head: toSha,
        mediaType: { format: "diff" },
      });
      const diff = typeof response.data === "string" ? response.data : "";
      return parseUnifiedDiff(diff, fromSha, toSha);
    } catch (error) {
      throw new ScmError(
        `Could not read diff ${fromSha.slice(0, 8)}...${toSha.slice(0, 8)}: ${(error as Error).message}`,
        {
          cause: error,
        },
      );
    }
  }

  private async issueComments(): Promise<Array<{ id: number; body?: string }>> {
    try {
      const { data } = await this.octokit.rest.issues.listComments({
        owner: this.options.owner,
        repo: this.options.repo,
        issue_number: this.options.pullNumber,
        per_page: 100,
      });
      return data;
    } catch (error) {
      throw new ScmError(`Could not list PR comments: ${(error as Error).message}`, { cause: error });
    }
  }

  async listState(): Promise<string | null> {
    const comments = await this.issueComments();
    const stateComment = comments.find((c) => c.body?.includes(STATE_MARKER_OPEN));
    return stateComment?.body ?? null;
  }

  async writeState(body: string): Promise<void> {
    this.requireToken("write review state to the pull request");
    const comments = await this.issueComments();
    const existing = comments.find((c) => c.body?.includes(STATE_MARKER_OPEN));
    try {
      if (existing) {
        await this.octokit.rest.issues.updateComment({
          owner: this.options.owner,
          repo: this.options.repo,
          comment_id: existing.id,
          body,
        });
      } else {
        await this.octokit.rest.issues.createComment({
          owner: this.options.owner,
          repo: this.options.repo,
          issue_number: this.options.pullNumber,
          body,
        });
      }
    } catch (error) {
      throw new ScmError(`Could not write state comment: ${(error as Error).message}`, { cause: error });
    }
  }

  /**
   * GitHub review comments must sit on a line of the diff. A finding on
   * unchanged code (anchor.inDiff === false), or one GitHub rejects with 422,
   * is published as a general pull-request comment instead; its ThreadRef id
   * carries the `issue:` prefix so updates and resolutions use the issues API.
   */
  async createInlineFinding(finding: Finding): Promise<ThreadRef> {
    this.requireToken(`publish finding ${finding.id}`);
    if (!this.snapshot) throw new ScmError("Pull request snapshot not loaded");
    if (finding.anchor.inDiff === false) return this.createGeneralFinding(finding);
    try {
      const { data } = await this.octokit.rest.pulls.createReviewComment({
        owner: this.options.owner,
        repo: this.options.repo,
        pull_number: this.options.pullNumber,
        commit_id: this.snapshot.headSha,
        path: finding.anchor.file,
        line: finding.anchor.startLine,
        side: "RIGHT",
        body: renderFindingComment(finding, { suggestionBlocks: true }),
      });
      return { platform: "github", id: String(data.id) };
    } catch (error) {
      if ((error as { status?: number }).status === 422) return this.createGeneralFinding(finding);
      throw new ScmError(
        `Could not publish finding ${finding.id} at ${finding.anchor.file}:${finding.anchor.startLine}: ` +
          `${(error as Error).message}`,
        { cause: error },
      );
    }
  }

  private async createGeneralFinding(finding: Finding): Promise<ThreadRef> {
    try {
      const { data } = await this.octokit.rest.issues.createComment({
        owner: this.options.owner,
        repo: this.options.repo,
        issue_number: this.options.pullNumber,
        body: renderFindingComment(finding, { suggestionBlocks: true }),
      });
      return { platform: "github", id: `${GENERAL_COMMENT_PREFIX}${data.id}` };
    } catch (error) {
      throw new ScmError(
        `Could not publish finding ${finding.id} as a pull-request comment: ${(error as Error).message}`,
        {
          cause: error,
        },
      );
    }
  }

  private async updateCommentBody(ref: ThreadRef, body: string): Promise<void> {
    if (ref.id.startsWith(GENERAL_COMMENT_PREFIX)) {
      await this.octokit.rest.issues.updateComment({
        owner: this.options.owner,
        repo: this.options.repo,
        comment_id: Number(ref.id.slice(GENERAL_COMMENT_PREFIX.length)),
        body,
      });
      return;
    }
    await this.octokit.rest.pulls.updateReviewComment({
      owner: this.options.owner,
      repo: this.options.repo,
      comment_id: Number(ref.id),
      body,
    });
  }

  async updateFinding(ref: ThreadRef, finding: Finding): Promise<void> {
    this.requireToken(`update finding ${finding.id}`);
    try {
      await this.updateCommentBody(ref, renderFindingComment(finding, { suggestionBlocks: true }));
    } catch (error) {
      throw new ScmError(`Could not update finding ${finding.id}: ${(error as Error).message}`, {
        cause: error,
      });
    }
  }

  /** Continue the finding's conversation: a reply to the review comment (or a new PR comment for general ones). */
  async replyToFinding(ref: ThreadRef, finding: Finding): Promise<void> {
    this.requireToken(`reply in finding thread ${ref.id}`);
    if (!this.snapshot) throw new ScmError("Pull request snapshot not loaded");
    const body = renderFollowUpComment(finding, this.snapshot.headSha, { suggestionBlocks: true });
    try {
      if (ref.id.startsWith(GENERAL_COMMENT_PREFIX)) {
        await this.octokit.rest.issues.createComment({
          owner: this.options.owner,
          repo: this.options.repo,
          issue_number: this.options.pullNumber,
          body: `${findingMarkerReply(finding.id)}\n${body}`,
        });
        return;
      }
      await this.octokit.rest.pulls.createReplyForReviewComment({
        owner: this.options.owner,
        repo: this.options.repo,
        pull_number: this.options.pullNumber,
        comment_id: Number(ref.id),
        body,
      });
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
    this.requireToken(`resolve finding thread ${ref.id}`);
    if (!this.snapshot) throw new ScmError("Pull request snapshot not loaded");
    try {
      await this.updateCommentBody(
        ref,
        `✅ **Resolved** — air-review no longer detects this issue on ${this.snapshot.headSha.slice(0, 8)}.\n`,
      );
    } catch (error) {
      throw new ScmError(`Could not resolve finding thread ${ref.id}: ${(error as Error).message}`, {
        cause: error,
      });
    }
  }

  async upsertSummary(summary: ReviewSummary, findings: Finding[] = []): Promise<void> {
    this.requireToken("write the review summary to the pull request");
    const { upsertSummaryBody } = await import("../state/summary.js");
    const comments = await this.issueComments();
    const existing = comments.find((c) => c.body?.includes(SUMMARY_MARKER_OPEN));
    const body = upsertSummaryBody(existing?.body ?? "", summary, { findings, mermaid: true });
    try {
      if (existing) {
        await this.octokit.rest.issues.updateComment({
          owner: this.options.owner,
          repo: this.options.repo,
          comment_id: existing.id,
          body,
        });
      } else {
        await this.octokit.rest.issues.createComment({
          owner: this.options.owner,
          repo: this.options.repo,
          issue_number: this.options.pullNumber,
          body,
        });
      }
    } catch (error) {
      throw new ScmError(`Could not write summary comment: ${(error as Error).message}`, { cause: error });
    }
  }
}
