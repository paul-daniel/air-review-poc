import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

export interface CacheEntry {
  key: string;
  createdAt: string;
  kind: string;
  value: unknown;
}

/**
 * Content-addressed local cache. Reconstructible by design: it only
 * accelerates - the PR ledger and the git history are the truth.
 */
export class LocalCache {
  constructor(readonly dir: string) {}

  private keyOf(kind: string, input: string): string {
    return createHash("sha256").update(`${kind}|${input}`).digest("hex");
  }

  private pathOf(key: string): string {
    return resolve(this.dir, `${key}.json`);
  }

  get<T>(kind: string, input: string): T | null {
    if (!existsSync(this.dir)) return null;
    const file = this.pathOf(this.keyOf(kind, input));
    if (!existsSync(file)) return null;
    try {
      const entry = JSON.parse(readFileSync(file, "utf8")) as CacheEntry;
      return entry.value as T;
    } catch {
      return null;
    }
  }

  set(kind: string, input: string, value: unknown): void {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
    const entry: CacheEntry = {
      key: this.keyOf(kind, input),
      createdAt: new Date().toISOString(),
      kind,
      value,
    };
    writeFileSync(this.pathOf(entry.key), JSON.stringify(entry));
  }

  stats(): { entries: number; bytes: number; kinds: Record<string, number> } {
    if (!existsSync(this.dir)) return { entries: 0, bytes: 0, kinds: {} };
    const files = readdirSync(this.dir).filter((f) => f.endsWith(".json"));
    const kinds: Record<string, number> = {};
    let bytes = 0;
    for (const file of files) {
      const stat = statSync(resolve(this.dir, file));
      bytes += stat.size;
      try {
        const entry = JSON.parse(readFileSync(resolve(this.dir, file), "utf8")) as CacheEntry;
        kinds[entry.kind] = (kinds[entry.kind] ?? 0) + 1;
      } catch {
        kinds.unknown = (kinds.unknown ?? 0) + 1;
      }
    }
    return { entries: files.length, bytes, kinds };
  }

  prune(options: { olderThanHours?: number; kind?: string } = {}): number {
    if (!existsSync(this.dir)) return 0;
    let removed = 0;
    const cutoff =
      options.olderThanHours === undefined ? null : Date.now() - options.olderThanHours * 60 * 60 * 1000;
    for (const file of readdirSync(this.dir)) {
      if (!file.endsWith(".json")) continue;
      const path = resolve(this.dir, file);
      const stat = statSync(path);
      const tooOld = cutoff !== null && stat.mtimeMs < cutoff;
      let kindMatches = true;
      if (options.kind) {
        try {
          const entry = JSON.parse(readFileSync(path, "utf8")) as CacheEntry;
          kindMatches = entry.kind === options.kind;
        } catch {
          kindMatches = options.kind === "unknown";
        }
      }
      const matchKind = options.kind ? kindMatches : true;
      const matchAge = options.olderThanHours !== undefined ? tooOld : true;
      if (matchKind && matchAge) {
        unlinkSync(path);
        removed += 1;
      }
    }
    return removed;
  }
}
