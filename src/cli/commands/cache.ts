import type { LocalCache } from "../../cache/local.js";
import { formatBytes, printJson, printTable, c } from "../output.js";

export function runCacheStats(cache: LocalCache, json: boolean): void {
  const stats = cache.stats();
  if (json) {
    printJson({ dir: cache.dir, ...stats });
    return;
  }
  process.stdout.write(`${c.bold("air-review cache")} — ${cache.dir}\n\n`);
  printTable(["entries", "size"], [[stats.entries, formatBytes(stats.bytes)]]);
  if (Object.keys(stats.kinds).length > 0) {
    process.stdout.write("\nby kind:\n");
    printTable(
      ["kind", "entries"],
      Object.entries(stats.kinds).map(([kind, count]) => [kind, count]),
    );
  }
}

export function runCachePrune(cache: LocalCache, options: { olderThanHours?: number; kind?: string }): void {
  const removed = cache.prune(options);
  process.stdout.write(
    removed === 0
      ? `${c.dim("nothing to prune")}\n`
      : `${c.green("pruned")} ${removed} cache entr${removed === 1 ? "y" : "ies"}\n`,
  );
}
