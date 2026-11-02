import type { FileChange, RepositoryDelta } from "../contracts/scm.js";

interface ActiveFile {
  path: string;
  oldPath?: string;
  status: FileChange["status"];
  addedLines: number[];
  removedLines: number[];
}

/**
 * Parse a unified diff produced by `git diff` (or the GitHub diff media type)
 * into a structured repository delta.
 */
export function parseUnifiedDiff(diff: string, fromSha: string, toSha: string): RepositoryDelta {
  const files: ActiveFile[] = [];
  let current: ActiveFile | null = null;
  let oldLine = 0;
  let newLine = 0;

  const flush = () => {
    if (!current) return;
    files.push({
      path: current.path,
      oldPath: current.oldPath,
      status: current.status,
      addedLines: [...new Set(current.addedLines)].sort((a, b) => a - b),
      removedLines: [...new Set(current.removedLines)].sort((a, b) => a - b),
    });
    current = null;
  };

  for (const rawLine of diff.split("\n")) {
    const line = rawLine.replace(/\r$/, "");

    if (line.startsWith("diff --git ")) {
      flush();
      const match = line.match(/^diff --git a\/(.*?) b\/(.*)$/);
      current = {
        path: match?.[2] ?? "",
        oldPath: match?.[1] ?? undefined,
        status: "modified",
        addedLines: [],
        removedLines: [],
      };
      oldLine = 0;
      newLine = 0;
      continue;
    }

    if (!current) continue;

    if (line.startsWith("new file mode")) {
      current.status = "added";
      continue;
    }
    if (line.startsWith("deleted file mode")) {
      current.status = "deleted";
      continue;
    }
    if (line.startsWith("rename from ")) {
      current.oldPath = line.slice("rename from ".length).trim();
      current.status = "renamed";
      continue;
    }
    if (line.startsWith("rename to ")) {
      current.path = line.slice("rename to ".length).trim();
      continue;
    }
    if (
      line.startsWith("index ") ||
      line.startsWith("similarity index") ||
      line.startsWith("--- ") ||
      line.startsWith("+++ ")
    ) {
      continue;
    }
    if (line.startsWith("@@ ")) {
      const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (!match) continue;
      oldLine = Number(match[1]);
      newLine = Number(match[3]);
      continue;
    }

    if (line.startsWith("\\ No newline at end of file")) continue;

    const prefix = line[0];
    if (prefix === " ") {
      oldLine += 1;
      newLine += 1;
    } else if (prefix === "-") {
      current.removedLines.push(oldLine);
      oldLine += 1;
    } else if (prefix === "+") {
      current.addedLines.push(newLine);
      newLine += 1;
    }
  }
  flush();

  return { fromSha, toSha, files, diff };
}

/**
 * Files whose diff is noise for a reviewer: lock files, minified bundles,
 * generated snapshots and binaries. They stay in the file list (so the
 * change is visible) but their hunks are replaced by a one-line note, so a
 * 10,000-line `package-lock.json` cannot push the real code out of the
 * prompt window.
 */
export const NOISE_DIFF_FILE =
  /((^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock|Pipfile\.lock|composer\.lock|Gemfile\.lock|go\.sum)$|\.min\.(js|css)$|\.(snap|map|svg|png|jpe?g|gif|ico|woff2?|ttf|pdf|zip|wasm)$|(^|\/)__snapshots__\/|\.generated\.[a-z]+$)/i;

/**
 * Remove the hunks of noise files from a unified diff, keeping a header line
 * per omitted file so the model knows the file changed.
 */
export function filterDiff(
  diff: string,
  isNoise: (path: string) => boolean = (path) => NOISE_DIFF_FILE.test(path),
): {
  diff: string;
  omitted: string[];
} {
  const sections = diff.split(/(?=^diff --git )/m);
  const omitted: string[] = [];
  const kept = sections.map((section) => {
    const match = section.match(/^diff --git a\/(.*?) b\/(.*)$/m);
    const path = match?.[2];
    if (!path || !isNoise(path)) return section;
    omitted.push(path);
    const lines = section
      .split("\n")
      .filter((line) => /^[-+]/.test(line) && !/^(---|\+\+\+) /.test(line)).length;
    return `diff --git a/${match?.[1]} b/${path}\n(${lines} changed lines omitted: generated or lock file)\n`;
  });
  return { diff: kept.join(""), omitted };
}

/** Files with an added/modified status, i.e. the review surface of the delta. */
export function reviewableFiles(delta: RepositoryDelta): FileChange[] {
  return delta.files.filter(
    (file) => file.status === "added" || file.status === "modified" || file.status === "renamed",
  );
}
