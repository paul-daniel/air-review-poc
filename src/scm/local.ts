import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PullRequestSnapshot, RepositoryDelta, ScmAdapter } from "../contracts/scm.js";
import type { Finding, ReviewSummary, ThreadRef } from "../contracts/review.js";
import { ScmError } from "../errors.js";
import type { GitRepository } from "../context/repository.js";
import { parseUnifiedDiff } from "../context/diff.js";
import { renderSummaryMarkdown } from "../state/summary.js";
import { extractState } from "../state/ledger.js";
import { renderFindingComment } from "../state/finding-comment.js";

export interface LocalAdapterOptions {
  repo: GitRepository;
  base?: string;
  stateDir: string;
}

const BASE_CANDIDATES = ["origin/main", "origin/master", "main", "master"];

export class LocalAdapter implements ScmAdapter {
  readonly kind = "local" as const;

  constructor(private readonly options: LocalAdapterOptions) {}

  private get stateDir(): string {
    return resolve(this.options.repo.root, this.options.stateDir);
  }

  private async resolveBase(): Promise<{ ref: string; sha: string }> {
    if (this.options.base) {
      return { ref: this.options.base, sha: await this.options.repo.resolveRef(this.options.base) };
    }
    for (const candidate of BASE_CANDIDATES) {
      const sha = await this.options.repo.run(["rev-parse", "--verify", `${candidate}^{commit}`], {
        allowFailure: true,
      });
      if (sha.trim()) return { ref: candidate, sha: sha.trim() };
    }
    const parent = await this.options.repo.run(["rev-parse", "HEAD~1"], { allowFailure: true });
    if (parent.trim()) return { ref: "HEAD~1", sha: parent.trim() };
    throw new ScmError("Could not determine a base ref. Pass --base <ref> or add a remote branch.");
  }

  async getPullRequest(): Promise<PullRequestSnapshot> {
    const base = await this.resolveBase();
    const headSha = await this.options.repo.headSha();
    const title = (await this.options.repo.run(["log", "-1", "--pretty=%s"], { allowFailure: true })).trim();
    const repoId = await this.options.repo.repositoryId();
    const [owner, repo] = repoId.includes("/") ? repoId.split("/") : [repoId, repoId];
    return {
      owner: owner ?? repoId,
      repo: repo ?? repoId,
      number: null,
      title: title || "local review",
      baseRef: base.ref,
      headRef: "HEAD",
      baseSha: base.sha,
      headSha,
    };
  }

  async getDelta(fromSha: string, toSha: string): Promise<RepositoryDelta> {
    // Pull-request semantics: compare from the merge base, so commits that
    // landed on the target branch after this branch diverged do not appear as
    // changes in the review.
    const mergeBase = await this.options.repo.mergeBase(fromSha, toSha).catch(() => fromSha);
    const diff = await this.options.repo.diff(mergeBase, toSha);
    return parseUnifiedDiff(diff, mergeBase, toSha);
  }

  private stateFile(): string {
    return resolve(this.stateDir, "state.json");
  }

  async listState(): Promise<string | null> {
    try {
      if (!existsSync(this.stateFile())) return null;
      return readFileSync(this.stateFile(), "utf8");
    } catch {
      return null;
    }
  }

  async writeState(body: string): Promise<void> {
    try {
      mkdirSync(this.stateDir, { recursive: true });
      writeFileSync(this.stateFile(), body);
      const state = extractState(body);
      if (state) {
        writeFileSync(
          resolve(this.stateDir, "context.md"),
          [
            "# Air Review — local review memory",
            "",
            `Repository: ${state.repository.id}`,
            `Base: ${state.pullRequest.baseSha}`,
            `Last reviewed head: ${state.pullRequest.headSha}`,
            `Models: ${JSON.stringify(state.configuration.models)}`,
            "",
            "Generated from state.json. The next review reads the ledger and rebuilds code evidence from Git; this file is for inspection, not additional model instructions.",
            "",
            ...state.findings.map(
              (finding) => `Status: ${finding.status}\n${renderFindingComment(finding)}\n`,
            ),
            "## Recent changes",
            ...state.history
              .slice(-20)
              .map((event) => `- ${event.sha.slice(0, 8)}: ${event.event} ${event.findingId}`),
            "",
          ].join("\n"),
        );
      }
    } catch (error) {
      throw new ScmError(`Could not write local state: ${(error as Error).message}`, { cause: error });
    }
  }

  async createInlineFinding(finding: Finding): Promise<ThreadRef> {
    return { platform: "local", id: finding.id };
  }

  async updateFinding(_ref: ThreadRef, _finding: Finding): Promise<void> {
    // Findings live in the local state file; nothing to update separately.
  }

  async resolveFinding(_ref: ThreadRef): Promise<void> {
    // Resolutions are recorded in the local state file.
  }

  async upsertSummary(summary: ReviewSummary, findings: Finding[] = []): Promise<void> {
    try {
      mkdirSync(this.stateDir, { recursive: true });
      writeFileSync(
        resolve(this.stateDir, "summary.md"),
        renderSummaryMarkdown(summary, { findings, mermaid: true }),
      );
      writeFileSync(resolve(this.stateDir, "review.json"), JSON.stringify(summary, null, 2));
    } catch (error) {
      throw new ScmError(`Could not write local summary: ${(error as Error).message}`, { cause: error });
    }
  }
}
