import type { LocalCache } from "../../cache/local.js";
export declare function runCacheStats(cache: LocalCache, json: boolean): void;
export declare function runCachePrune(cache: LocalCache, options: {
    olderThanHours?: number;
    kind?: string;
}): void;
