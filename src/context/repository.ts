import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ScmError } from "../errors.js";

const exec = promisify(execFile);

export class GitRepository {
  constructor(readonly root: string) {}

  static async discover(cwd: string): Promise<GitRepository> {
    try {
      const { stdout } = await exec("git", ["rev-parse", "--show-toplevel"], { cwd });
      return new GitRepository(stdout.trim());
    } catch {
      throw new ScmError(`Not a git repository: ${cwd}. Run air-review inside a git checkout.`);
    }
  }

  async run(args: string[], options: { cwd?: string; allowFailure?: boolean } = {}): Promise<string> {
    try {
      const { stdout } = await exec("git", args, {
        cwd: options.cwd ?? this.root,
        maxBuffer: 64 * 1024 * 1024,
      });
      return stdout;
    } catch (error) {
      if (options.allowFailure) return "";
      const anyError = error as { stderr?: string; message?: string };
      throw new ScmError(`git ${args.join(" ")} failed: ${anyError.stderr?.trim() || anyError.message}`, {
        cause: error,
      });
    }
  }

  async headSha(): Promise<string> {
    return (await this.run(["rev-parse", "HEAD"])).trim();
  }

  async resolveRef(ref: string): Promise<string> {
    const out = await this.run(["rev-parse", "--verify", `${ref}^{commit}`], { allowFailure: true });
    if (!out.trim()) {
      throw new ScmError(`Could not resolve base ref "${ref}". Use --base to point at a valid ref.`);
    }
    return out.trim();
  }

  async mergeBase(a: string, b: string): Promise<string> {
    return (await this.run(["merge-base", a, b])).trim();
  }

  async diff(from: string, to: string): Promise<string> {
    return this.run(["diff", "--no-ext-diff", "--unified=3", from, to]);
  }

  async listTrackedFiles(): Promise<string[]> {
    const out = await this.run(["ls-files"]);
    return out.split("\n").filter(Boolean);
  }

  readFile(path: string): string {
    try {
      return readFileSync(resolve(this.root, path), "utf8");
    } catch {
      return "";
    }
  }

  async readFileAt(ref: string, path: string): Promise<string> {
    return this.run(["show", `${ref}:${path}`], { allowFailure: true });
  }

  /**
   * `owner/repo` from the origin URL. GitHub/GitLab/Bitbucket end in
   * `owner/repo(.git)`; Azure Repos URLs end in `project/_git/repo` (or
   * `org@dev.azure.com:v3/org/project/repo` over SSH), where the project is
   * the meaningful owner.
   */
  async repositoryId(): Promise<string> {
    const remote = (await this.run(["remote", "get-url", "origin"], { allowFailure: true }))
      .trim()
      .replace(/\.git$/, "");
    const azure = remote.match(/\/([^/]+)\/_git\/([^/]+)$/) ?? remote.match(/:v3\/[^/]+\/([^/]+)\/([^/]+)$/);
    if (azure) return `${decodeURIComponent(azure[1]!)}/${decodeURIComponent(azure[2]!)}`;
    const match = remote.match(/[:/]([^/:]+\/[^/:]+)$/);
    return match?.[1] ?? this.root.split("/").pop() ?? "unknown";
  }
}
