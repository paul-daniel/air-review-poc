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
export declare class LocalCache {
    readonly dir: string;
    constructor(dir: string);
    private keyOf;
    private pathOf;
    get<T>(kind: string, input: string): T | null;
    set(kind: string, input: string, value: unknown): void;
    stats(): {
        entries: number;
        bytes: number;
        kinds: Record<string, number>;
    };
    prune(options?: {
        olderThanHours?: number;
        kind?: string;
    }): number;
}
