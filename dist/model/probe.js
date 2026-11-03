/**
 * Prove that a deployment answers before a review pays for it.
 *
 * Azure endpoints have no `/models` listing, so the only way to validate the
 * key, the URL and a deployment name is to ask it something. The probe is the
 * cheapest possible request (a one-word answer, a handful of tokens) and is
 * sent once per distinct model, so a config where all roles share one
 * deployment costs a single call.
 */
export async function probeModels(provider, models) {
    const distinct = [...new Set(models.filter(Boolean))];
    return Promise.all(distinct.map((model) => probeModel(provider, model)));
}
export async function probeModel(provider, model) {
    const startedAt = Date.now();
    try {
        const result = await provider.generate({
            model,
            messages: [{ role: "user", content: "Reply with the single word: ready" }],
            // Reasoning deployments (gpt-5-codex, o-series) spend output tokens on
            // hidden reasoning first; 128 leaves room for the one-word answer.
            maxOutputTokens: 128,
        });
        return {
            model,
            ok: true,
            durationMs: Date.now() - startedAt,
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
        };
    }
    catch (error) {
        const message = error.message;
        // The endpoint authenticated the request, found the deployment and billed
        // tokens: that proves reachability even when a reasoning model used the
        // whole budget before answering.
        if (/status "incomplete"/.test(message)) {
            return {
                model,
                ok: true,
                durationMs: Date.now() - startedAt,
                note: "reachable; reasoning model spent the probe budget before answering",
            };
        }
        return { model, ok: false, durationMs: Date.now() - startedAt, error: message };
    }
}
//# sourceMappingURL=probe.js.map