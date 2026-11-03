export interface HttpOptions {
    timeoutMs: number;
    headers?: Record<string, string>;
}
export declare class HttpError extends Error {
    readonly status: number;
    readonly body: string;
    /** Raw `Retry-After` header, when the server sent one. */
    readonly retryAfter: string | null;
    constructor(status: number, body: string, retryAfter?: string | null);
}
export interface RetryOptions {
    /** Attempts in total, including the first (default 4). */
    attempts?: number;
    /** Replace the wait in tests. */
    sleep?: (ms: number) => Promise<void>;
    /** Called before each retry, for progress reporting. */
    onRetry?: (info: {
        attempt: number;
        status: number;
        delayMs: number;
    }) => void;
}
/**
 * Delay before the next attempt: the server's `Retry-After` when present
 * (seconds or HTTP date), otherwise exponential backoff with jitter, capped
 * at one minute. A pipeline step would rather wait 20 s on a 429 than fail
 * the review; Azure deployments with small TPM quotas hit this often.
 */
export declare function retryDelayMs(status: number, retryAfter: string | null, attempt: number, body?: string): number;
export declare function requestJson(url: string, init: RequestInit, options: HttpOptions & RetryOptions): Promise<unknown>;
