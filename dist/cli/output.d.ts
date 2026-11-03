export declare const c: import("chalk").ChalkInstance;
export declare function isPlainMode(): boolean;
export declare function isAnimated(): boolean;
/** Explicit controls also work when a terminal wrapper does not expose isTTY. */
export declare function reportColorEnabled(): boolean;
/** Preserve the existing bare --color alias without consuming the subcommand. */
export declare function normalizeColorArgs(args: string[]): string[];
/** Brief progressive reveal; no motion or cursor controls in redirected/JSON/plain output. */
export declare function writeReport(report: string): Promise<void>;
/** Compact command identity; review renders its own complete report header. */
export declare function printBanner(subtitle?: string, options?: {
    force?: boolean;
}): Promise<void>;
/** Minimal stderr spinner; completely silent outside interactive terminals. */
export declare class Spinner {
    private readonly frames;
    private timer;
    private index;
    private text;
    private readonly enabled;
    private startedAt;
    constructor();
    start(text: string): void;
    update(text: string): void;
    private draw;
    stop(): void;
}
export declare function printJson(value: unknown): void;
export declare function printTable(header: string[], rows: Array<Array<string | number>>): void;
export declare function formatBytes(bytes: number): string;
export declare function formatTokens(count: number): string;
export declare function severityColor(severity: string): string;
