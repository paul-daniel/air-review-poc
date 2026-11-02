import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError, requestJson, retryDelayMs } from "../src/model/http.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestJson retries", () => {
  it("retries a 429 honouring Retry-After, then succeeds", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      if (calls < 3) {
        return new Response('{"error":{"message":"rate limit"}}', {
          status: 429,
          headers: { "retry-after": "7" },
        });
      }
      return new Response('{"ok":true}', { status: 200 });
    });
    const waits: number[] = [];
    const result = await requestJson(
      "https://x.test/v1",
      { method: "POST" },
      {
        timeoutMs: 1000,
        sleep: async (ms) => {
          waits.push(ms);
        },
      },
    );
    expect(result).toEqual({ ok: true });
    expect(calls).toBe(3);
    expect(waits).toEqual([7000, 7000]);
  });

  it("gives up after the configured attempts and surfaces the last error", async () => {
    vi.stubGlobal("fetch", async () => new Response("busy", { status: 503 }));
    await expect(
      requestJson(
        "https://x.test/v1",
        { method: "POST" },
        { timeoutMs: 1000, attempts: 2, sleep: async () => {} },
      ),
    ).rejects.toBeInstanceOf(HttpError);
  });

  it("does not retry client errors such as 400 or 401", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls += 1;
      return new Response("nope", { status: 401 });
    });
    await expect(
      requestJson("https://x.test/v1", { method: "POST" }, { timeoutMs: 1000, sleep: async () => {} }),
    ).rejects.toBeInstanceOf(HttpError);
    expect(calls).toBe(1);
  });

  it("computes backoff from Retry-After seconds, dates, or exponentially with a cap", () => {
    expect(retryDelayMs(429, "3", 1)).toBe(3000);
    expect(retryDelayMs(429, "600", 1)).toBe(60_000);
    const soon = new Date(Date.now() + 5000).toUTCString();
    expect(retryDelayMs(429, soon, 1)).toBeLessThanOrEqual(5000);
    expect(retryDelayMs(429, null, 1)).toBeGreaterThanOrEqual(2000);
    expect(retryDelayMs(503, null, 3)).toBeLessThan(5000);
    expect(retryDelayMs(429, null, 20)).toBe(60_000);
  });
});

describe("retry delay from the error body", () => {
  it("honours 'retry after N seconds' in an Azure 429 body and waits at least ten seconds otherwise", () => {
    expect(
      retryDelayMs(
        429,
        null,
        1,
        '{"error":{"message":"Requests exceeded token rate limit. Please retry after 56 seconds."}}',
      ),
    ).toBe(57_000);
    expect(retryDelayMs(429, null, 1)).toBeGreaterThanOrEqual(10_000);
    expect(retryDelayMs(429, "3", 1, "retry after 56 seconds")).toBe(3000);
  });
});
