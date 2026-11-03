/** Wrap an async command body so every failure maps to the documented exit codes. */
export declare function runCatching<A extends unknown[]>(body: (...args: A) => Promise<void> | void): (...args: A) => Promise<void>;
