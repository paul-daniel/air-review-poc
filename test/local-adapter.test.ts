import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GitRepository } from "../src/context/repository.js";
import { LocalAdapter } from "../src/scm/local.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function git(dir: string, args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" });
}

function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), "air-review-local-"));
  dirs.push(dir);
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "test"]);
  writeFileSync(join(dir, "app.ts"), "export const value = 1;\n");
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "base"]);
  return dir;
}

describe("LocalAdapter", () => {
  it("diffs from the merge base so unrelated target-branch commits are excluded", async () => {
    const dir = fixture();

    // Feature branch adds a file.
    git(dir, ["switch", "-qc", "feature"]);
    writeFileSync(join(dir, "feature.ts"), "export const feature = true;\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-qm", "feature work"]);

    // Target branch moves on independently, after the branch point.
    git(dir, ["switch", "-q", "main"]);
    writeFileSync(join(dir, "main-only.ts"), "export const mainOnly = true;\n");
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-qm", "main moved on"]);

    git(dir, ["switch", "-q", "feature"]);
    const repo = await GitRepository.discover(dir);
    const adapter = new LocalAdapter({ repo, base: "main", stateDir: ".air-review" });
    const snapshot = await adapter.getPullRequest();
    const delta = await adapter.getDelta(snapshot.baseSha, snapshot.headSha);

    const paths = delta.files.map((f) => f.path).sort();
    expect(paths).toEqual(["feature.ts"]);
    expect(delta.fromSha).toBe(git(dir, ["merge-base", "main", "HEAD"]).trim());
  });

  it("stores and reads back local review state", async () => {
    const dir = fixture();
    const repo = await GitRepository.discover(dir);
    const adapter = new LocalAdapter({ repo, base: "main", stateDir: ".air-review" });
    expect(await adapter.listState()).toBeNull();
    await adapter.writeState('{"schemaVersion":1}');
    expect(await adapter.listState()).toBe('{"schemaVersion":1}');
  });
});
