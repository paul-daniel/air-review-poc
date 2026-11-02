import { describe, expect, it } from "vitest";
import { parseUnifiedDiff, reviewableFiles } from "../src/context/diff.js";

const SAMPLE = [
  "diff --git a/src/a.ts b/src/a.ts",
  "index 111..222 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -10,4 +10,6 @@ export class A {",
  "   keep();",
  "-  old();",
  "+  added();",
  "+  alsoAdded();",
  "   tail();",
  "diff --git a/src/new.ts b/src/new.ts",
  "new file mode 100644",
  "--- /dev/null",
  "+++ b/src/new.ts",
  "@@ -0,0 +1,3 @@",
  "+export const x = 1;",
  "+export const y = 2;",
  "+export const z = 3;",
  "diff --git a/src/gone.ts b/src/gone.ts",
  "deleted file mode 100644",
  "--- a/src/gone.ts",
  "+++ /dev/null",
  "@@ -1,2 +0,0 @@",
  "-bye();",
].join("\n");

describe("parseUnifiedDiff", () => {
  it("tracks added and removed line numbers per file", () => {
    const delta = parseUnifiedDiff(SAMPLE, "base", "head");
    expect(delta.files).toHaveLength(3);

    const modified = delta.files.find((f) => f.path === "src/a.ts");
    expect(modified?.status).toBe("modified");
    expect(modified?.addedLines).toEqual([11, 12]);
    expect(modified?.removedLines).toEqual([11]);

    const added = delta.files.find((f) => f.path === "src/new.ts");
    expect(added?.status).toBe("added");
    expect(added?.addedLines).toEqual([1, 2, 3]);

    const deleted = delta.files.find((f) => f.path === "src/gone.ts");
    expect(deleted?.status).toBe("deleted");
    expect(deleted?.removedLines).toEqual([1]);
  });

  it("excludes deleted files from the review surface", () => {
    const delta = parseUnifiedDiff(SAMPLE, "base", "head");
    expect(reviewableFiles(delta).map((f) => f.path)).toEqual(["src/a.ts", "src/new.ts"]);
  });
});

describe("filterDiff", () => {
  it("replaces lock-file and generated hunks with a one-line note and keeps code hunks", async () => {
    const { filterDiff } = await import("../src/context/diff.js");
    const diff = [
      "diff --git a/package-lock.json b/package-lock.json",
      "--- a/package-lock.json",
      "+++ b/package-lock.json",
      "@@ -1,2 +1,4 @@",
      "+a",
      "+b",
      "-c",
      "diff --git a/src/app.ts b/src/app.ts",
      "--- a/src/app.ts",
      "+++ b/src/app.ts",
      "@@ -1 +1 @@",
      "+real code",
      "",
    ].join("\n");
    const result = filterDiff(diff);
    expect(result.omitted).toEqual(["package-lock.json"]);
    expect(result.diff).toContain("(3 changed lines omitted: generated or lock file)");
    expect(result.diff).not.toContain("+a");
    expect(result.diff).toContain("+real code");
  });
});
