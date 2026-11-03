import { ModelError } from "../errors.js";
import { HttpError, requestJson } from "./http.js";
import { extractJson } from "./json.js";
/** The endpoint's way of saying "this deployment does not speak Chat Completions". */
const UNSUPPORTED_OPERATION = /unsupported|not supported|use the responses api|responses api/i;
/** `/chat/completions` (possibly with a query string) -> `/responses`, keeping the query. */
function responsesPath(chatPath) {
    const path = chatPath ?? "/chat/completions";
    const [pathname, query] = path.split("?");
    const base = (pathname ?? "").replace(/\/chat\/completions$/, "") || "";
    return `${base}/responses${query ? `?${query}` : ""}`;
}
function usageOf(input, output, cached, reasoning) {
    const count = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
    const inputTokens = count(input);
    const outputTokens = count(output);
    const cachedTokens = count(cached);
    const reasoningTokens = count(reasoning);
    return {
        inputTokens: inputTokens ?? 0,
        outputTokens: outputTokens ?? 0,
        cachedInputTokens: cachedTokens !== undefined && inputTokens !== undefined && cachedTokens <= inputTokens
            ? cachedTokens
            : undefined,
        reasoningTokens: reasoningTokens !== undefined && outputTokens !== undefined && reasoningTokens <= outputTokens
            ? reasoningTokens
            : undefined,
        usageIncomplete: inputTokens === undefined || outputTokens === undefined,
    };
}
export class OpenAICompatibleProvider {
    id;
    options;
    /** Models that `auto` mode has learned to call through the Responses API. */
    responsesModels = new Set();
    constructor(options) {
        this.options = options;
        this.id = options.providerId ?? "openai";
    }
    /** Which protocol a model is called with right now (`auto` can change it after a 400). */
    apiFor(model) {
        const api = this.options.api ?? "auto";
        if (api !== "auto")
            return api;
        return this.responsesModels.has(model) ? "responses" : "chat-completions";
    }
    get baseUrl() {
        return this.options.baseUrl.replace(/\/+$/, "");
    }
    async capabilities() {
        return {
            toolCalling: true,
            jsonMode: true,
            jsonSchema: false,
            streaming: true,
        };
    }
    async listModels() {
        try {
            const data = (await requestJson(`${this.baseUrl}${this.options.modelsPath ?? "/models"}`, { method: "GET" }, this.httpOptions()));
            return (data.data ?? []).map((model) => ({ name: model.id ?? "unknown" }));
        }
        catch (error) {
            throw this.mapError(error);
        }
    }
    async generate(request) {
        if (this.apiFor(request.model) === "responses")
            return this.generateResponses(request);
        try {
            return await this.generateChat(request);
        }
        catch (error) {
            // `auto`: a deployment that only speaks the Responses API answers 400 to
            // chat completions. Learn it once per process and retry transparently.
            if ((this.options.api ?? "auto") === "auto" &&
                error instanceof HttpError &&
                error.status === 400 &&
                UNSUPPORTED_OPERATION.test(error.body)) {
                this.responsesModels.add(request.model);
                return this.generateResponses(request);
            }
            throw this.mapError(error);
        }
    }
    /** POST {base}/chat/completions: the protocol every vendor shares. */
    async generateChat(request) {
        const data = (await requestJson(`${this.baseUrl}${this.options.chatPath ?? "/chat/completions"}`, {
            method: "POST",
            body: JSON.stringify({
                model: request.model,
                messages: request.messages,
                stream: false,
                ...(this.options.temperature === null
                    ? {}
                    : { temperature: this.options.temperature ?? request.temperature ?? 0.2 }),
                ...(request.format ? { response_format: { type: "json_object" } } : {}),
                ...(request.maxOutputTokens
                    ? { [this.options.maxTokensParameter ?? "max_tokens"]: request.maxOutputTokens }
                    : {}),
            }),
        }, this.httpOptions()));
        if (data.error?.message)
            throw new ModelError(data.error.message);
        const text = data.choices?.[0]?.message?.content ?? "";
        const usage = usageOf(data.usage?.prompt_tokens, data.usage?.completion_tokens, data.usage?.prompt_tokens_details?.cached_tokens, data.usage?.completion_tokens_details?.reasoning_tokens);
        request.onUsage?.(usage);
        return { text, model: request.model, usage };
    }
    /**
     * POST {base}/responses: OpenAI's newer API (Azure v1 exposes it at the same
     * base URL). System messages become `instructions`; JSON mode is
     * `text.format`; reasoning models ignore temperature, so it is never sent.
     * Reference: https://learn.microsoft.com/azure/foundry/openai/how-to/responses
     */
    async generateResponses(request) {
        const instructions = request.messages
            .filter((m) => m.role === "system")
            .map((m) => m.content)
            .join("\n\n");
        const input = request.messages
            .filter((m) => m.role !== "system")
            .map((m) => ({ type: "message", role: m.role, content: m.content }));
        try {
            const data = (await requestJson(`${this.baseUrl}${responsesPath(this.options.chatPath)}`, {
                method: "POST",
                body: JSON.stringify({
                    model: request.model,
                    ...(instructions ? { instructions } : {}),
                    input,
                    store: false,
                    ...(request.format ? { text: { format: { type: "json_object" } } } : {}),
                    ...(request.maxOutputTokens ? { max_output_tokens: request.maxOutputTokens } : {}),
                }),
            }, this.httpOptions()));
            if (data.error?.message)
                throw new ModelError(data.error.message);
            const text = data.output_text ??
                (data.output ?? [])
                    .filter((item) => item.type === "message")
                    .flatMap((item) => item.content ?? [])
                    .filter((part) => part.type === "output_text")
                    .map((part) => part.text ?? "")
                    .join("");
            const usage = usageOf(data.usage?.input_tokens, data.usage?.output_tokens, data.usage?.input_tokens_details?.cached_tokens, data.usage?.output_tokens_details?.reasoning_tokens);
            // Usage is billed even when the answer is unusable: report it before failing.
            request.onUsage?.(usage);
            if (!text && data.status && data.status !== "completed") {
                const reason = data.incomplete_details?.reason;
                const hint = reason === "max_output_tokens"
                    ? ` The output budget (${request.maxOutputTokens ?? "default"} tokens) was spent on reasoning` +
                        ` (${usage.reasoningTokens ?? "?"} reasoning tokens). Raise review.maxOutputTokens or use a smaller reasoning effort.`
                    : "";
                throw new ModelError(`Model ${request.model} returned status "${data.status}"${reason ? ` (${reason})` : ""} without output.${hint}`);
            }
            return { text, model: request.model, usage };
        }
        catch (error) {
            throw this.mapError(error);
        }
    }
    async structured(request) {
        const result = await this.generate({
            model: request.model,
            messages: request.messages,
            temperature: request.temperature ?? 0.1,
            maxOutputTokens: request.maxOutputTokens,
            format: "json",
            onUsage: request.onUsage,
        });
        const raw = extractJson(result.text);
        let parsed;
        try {
            parsed = raw === null ? null : JSON.parse(raw);
        }
        catch {
            parsed = null;
        }
        if (parsed === null) {
            throw new ModelError(`Model ${request.model} did not return valid JSON${request.shapeHint ? ` for ${request.shapeHint}` : ""}.`);
        }
        let data;
        try {
            data = request.parse(parsed);
        }
        catch (error) {
            throw new ModelError(`Model ${request.model} returned JSON that does not match the expected shape: ` +
                `${error.message}`, { cause: error });
        }
        return { data, usage: result.usage, model: result.model };
    }
    httpOptions() {
        const headerName = this.options.apiKeyHeader ?? "authorization";
        const prefix = this.options.apiKeyPrefix ?? "Bearer ";
        return {
            timeoutMs: this.options.timeoutMs,
            headers: {
                ...(this.options.apiKey ? { [headerName]: `${prefix}${this.options.apiKey}` } : {}),
                ...(this.options.headers ?? {}),
            },
            onRetry: this.options.onRetry,
        };
    }
    mapError(error) {
        if (error instanceof ModelError)
            return error;
        if (error instanceof HttpError) {
            let detail = "";
            try {
                const parsed = JSON.parse(error.body);
                detail = typeof parsed.error === "string" ? parsed.error : (parsed.error?.message ?? "");
            }
            catch {
                /* not json */
            }
            const hint = error.status === 401 || error.status === 403
                ? ` Check the API key${this.options.apiKeyEnv ? ` in ${this.options.apiKeyEnv}` : ""}.`
                : "";
            return new ModelError(`${this.id} endpoint error (${error.status})${detail ? `: ${detail}` : ""}.${hint}`);
        }
        return new ModelError(`${this.id} request failed: ${error.message}`, {
            cause: error,
        });
    }
}
//# sourceMappingURL=openai-compatible.js.map