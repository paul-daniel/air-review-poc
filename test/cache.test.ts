import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalCache } from "../src/cache/local.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("LocalCache", () => {
  it("stores and retrieves content-addressed entries", () => {
    const cache = new LocalCache(join(mkdtempSync(join(tmpdir(), "ar-cache-")), "cache"));
    expect(cache.get("review", "input")).toBeNull();
    cache.set("review", "input", { findings: ["x"] });
    expect(cache.get<{ findings: string[] }>("review", "input")).toEqual({ findings: ["x"] });
    expect(cache.get("review", "other-input")).toBeNull();
  });

  it("reports stats and prunes by kind", () => {
    const dir = join(mkdtempSync(join(tmpdir(), "ar-cache-")), "cache");
    const cache = new LocalCache(dir);
    cache.set("review", "a", 1);
    cache.set("review", "b", 2);
    cache.set("index", "c", 3);
    expect(cache.stats().entries).toBe(3);
    expect(cache.prune({ kind: "index" })).toBe(1);
    expect(cache.stats().entries).toBe(2);
  });
});
