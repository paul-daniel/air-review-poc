import { ModelError } from "../errors.js";
export class HttpError extends Error {
    status;
    body;
    /** Raw `Retry-After` header, when the server sent one. */
    retryAfter;
    constructor(status, body, retryAfter = null) {
        super(`HTTP ${status}: ${body.slice(0, 300)}`);
        this.status = status;
        this.body = body;
        this.retryAfter = retryAfter;
    }
}
/** Statuses worth retrying: rate limits and transient server errors. */
const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 5;
const MAX_BACKOFF_MS = 60_000;
/**
 * Delay before the next attempt: the server's `Retry-After` when present
 * (seconds or HTTP date), otherwise exponential backoff with jitter, capped
 * at one minute. A pipeline step would rather wait 20 s on a 429 than fail
 * the review; Azure deployments with small TPM quotas hit this often.
 */
export function retryDelayMs(status, retryAfter, attempt, body = "") {
    if (retryAfter) {
        const seconds = Number(retryAfter);
        if (Number.isFinite(seconds) && seconds >= 0)
            return Math.min(MAX_BACKOFF_MS, Math.ceil(seconds * 1000));
        const date = Date.parse(retryAfter);
        if (!Number.isNaN(date))
            return Math.min(MAX_BACKOFF_MS, Math.max(0, date - Date.now()));
    }
    // Azure OpenAI often sends no Retry-After header but says
    // "Please retry after 56 seconds" in the error body.
    const inBody = body.match(/retry after (\d+) second/i);
    if (inBody)
        return Math.min(MAX_BACKOFF_MS, (Number(inBody[1]) + 1) * 1000);
    // Token-per-minute quotas refill per minute: short waits on a 429 are wasted.
    const base = status === 429 ? 10_000 : 1_000;
    return Math.min(MAX_BACKOFF_MS, base * 2 ** (attempt - 1) + Math.floor(Math.random() * 500));
}
export async function requestJson(url, init, options) {
    const attempts = Math.max(1, options.attempts ?? MAX_ATTEMPTS);
    const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    for (let attempt = 1;; attempt += 1) {
        try {
            return await requestOnce(url, init, options);
        }
        catch (error) {
            const status = error instanceof HttpError ? error.status : undefined;
            const retryable = status !== undefined
                ? RETRYABLE_STATUS.has(status)
                : error instanceof ModelError && /timed out/.test(error.message);
            if (!retryable || attempt >= attempts)
                throw error;
            const delayMs = retryDelayMs(status ?? 0, error instanceof HttpError ? error.retryAfter : null, attempt, error instanceof HttpError ? error.body : "");
            options.onRetry?.({ attempt, status: status ?? 0, delayMs });
            await sleep(delayMs);
        }
    }
}
async function requestOnce(url, init, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
        let response;
        try {
            response = await fetch(url, {
                ...init,
                signal: controller.signal,
                headers: {
                    "content-type": "application/json",
                    ...options.headers,
                    ...(init.headers ?? {}),
                },
            });
        }
        catch (error) {
            const reason = error instanceof Error && error.name === "AbortError" ? "timed out" : error.message;
            throw new ModelError(`Provider unreachable at ${url}: ${reason}`, { cause: error });
        }
        const text = await response.text();
        if (!response.ok) {
            throw new HttpError(response.status, text, response.headers.get("retry-after"));
        }
        if (!text)
            return null;
        try {
            return JSON.parse(text);
        }
        catch {
            return text;
        }
    }
    finally {
        clearTimeout(timer);
    }
}
//# sourceMappingURL=http.js.map