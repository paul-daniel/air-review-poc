import type { ModelProvider } from "../contracts/model.js";

export interface ProbeResult {
  model: string;
  ok: boolean;
  /** Round-trip time of the probe request. */
  durationMs: number;
  /** Tokens the probe consumed, when the provider reports them. */
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
}

/**
 * Prove that a deployment answers before a review pays for it.
 *
 * Azure endpoints have no `/models` listing, so the only way to validate the
 * key, the URL and a deployment name is to ask it something. The probe is the
 * cheapest possible request (a one-word answer, a handful of tokens) and is
 * sent once per distinct model, so a config where all roles share one
 * deployment costs a single call.
 */
export async function probeModels(provider: ModelProvider, models: string[]): Promise<ProbeResult[]> {
  const distinct = [...new Set(models.filter(Boolean))];
  return Promise.all(distinct.map((model) => probeModel(provider, model)));
}

export async function probeModel(provider: ModelProvider, model: string): Promise<ProbeResult> {
  const startedAt = Date.now();
  try {
    const result = await provider.generate({
      model,
      messages: [{ role: "user", content: "Reply with the single word: ready" }],
      maxOutputTokens: 16,
    });
    return {
      model,
      ok: true,
      durationMs: Date.now() - startedAt,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    };
  } catch (error) {
    return { model, ok: false, durationMs: Date.now() - startedAt, error: (error as Error).message };
  }
}
