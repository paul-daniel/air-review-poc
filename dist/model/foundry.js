import { ModelError } from "../errors.js";
import { extractJson } from "./json.js";
import { resolveAzureCredential } from "./azure-credential.js";
/** `https://<res>.services.ai.azure.com[/api/projects/<p>][/openai/v1]` → the two base URLs. */
export function foundryBaseUrls(endpoint) {
    let trimmed = endpoint
        .replace(/\/+$/, "")
        .replace(/\/openai(\/v1)?$/i, "")
        .replace(/\/anthropic$/i, "");
    trimmed = trimmed.replace(/\/api\/projects$/i, "");
    const origin = new URL(trimmed).origin;
    return { openai: `${trimmed}/openai/v1`, anthropic: `${origin}/anthropic`, resource: trimmed };
}
/** `claude:<deployment>` → Claude door; a name starting with "claude" too. */
export function splitDeployment(model) {
    if (/^claude:/i.test(model))
        return { door: "anthropic", deployment: model.slice("claude:".length) };
    if (/^claude/i.test(model))
        return { door: "anthropic", deployment: model };
    return { door: "openai", deployment: model };
}
const UNSUPPORTED_OPERATION = /unsupported|not supported|use the responses api|responses api/i;
export class FoundryProvider {
    id = "azure-foundry";
    options;
    clientsPromise = null;
    credentialPromise = null;
    responsesModels = new Set();
    constructor(options) {
        this.options = options;
    }
    get baseUrls() {
        return foundryBaseUrls(this.options.endpoint);
    }
    /** The credential in use, for `doctor`. */
    credential() {
        this.credentialPromise ??= resolveAzureCredential({
            apiKey: this.options.apiKey,
            apiKeyEnv: this.options.apiKeyEnv,
            auth: this.options.auth,
        });
        return this.credentialPromise;
    }
    clients() {
        this.clientsPromise ??= (async () => {
            const credential = await this.credential();
            const urls = this.baseUrls;
            const openai = this.options.clients?.openai ??
                (await (async () => {
                    const { default: OpenAI } = await import("openai");
                    return new OpenAI({
                        baseURL: urls.openai,
                        // The OpenAI SDK sends `Authorization: Bearer <value>`; Foundry's v1 route
                        // accepts both an API key and an Entra ID token that way (official docs).
                        apiKey: credential.kind === "api-key" ? credential.apiKey : credential.tokenProvider,
                        timeout: this.options.timeoutMs,
                        maxRetries: 3,
                        defaultHeaders: this.options.headers,
                    });
                })());
            const anthropic = this.options.clients?.anthropic ??
                (await (async () => {
                    const { AnthropicFoundry } = await import("@anthropic-ai/foundry-sdk");
                    return new AnthropicFoundry({
                        baseURL: urls.anthropic,
                        ...(credential.kind === "api-key"
                            ? { apiKey: credential.apiKey }
                            : { azureADTokenProvider: credential.tokenProvider }),
                        timeout: this.options.timeoutMs,
                        maxRetries: 3,
                        defaultHeaders: this.options.headers,
                    });
                })());
            return { openai, anthropic };
        })();
        return this.clientsPromise;
    }
    async capabilities() {
        return { toolCalling: true, jsonMode: true, jsonSchema: false, streaming: true };
    }
    /** Foundry has no deployment listing on the data plane; `doctor` probes instead. */
    async listModels() {
        const { openai } = await this.clients();
        if (!openai.models)
            return [];
        try {
            const data = await openai.models.list();
            return (data.data ?? []).map((m) => ({ name: m.id ?? "unknown" }));
        }
        catch (error) {
            throw this.mapError(error);
        }
    }
    apiFor(model) {
        const api = this.options.api ?? "auto";
        if (api !== "auto")
            return api;
        return this.responsesModels.has(model) ? "responses" : "chat-completions";
    }
    async generate(request) {
        const { door, deployment } = splitDeployment(request.model);
        try {
            if (door === "anthropic")
                return await this.generateClaude(request, deployment);
            if (this.apiFor(deployment) === "responses")
                return await this.generateResponses(request, deployment);
            try {
                return await this.generateChat(request, deployment);
            }
            catch (error) {
                if ((this.options.api ?? "auto") === "auto" && isUnsupportedOperation(error)) {
                    this.responsesModels.add(deployment);
                    return await this.generateResponses(request, deployment);
                }
                throw error;
            }
        }
        catch (error) {
            throw this.mapError(error);
        }
    }
    async generateChat(request, deployment) {
        const { openai } = await this.clients();
        const data = await openai.chat.completions.create({
            model: deployment,
            messages: request.messages,
            ...(request.format ? { response_format: { type: "json_object" } } : {}),
            ...(request.maxOutputTokens
                ? { [this.options.maxTokensParameter ?? "max_completion_tokens"]: request.maxOutputTokens }
                : {}),
        });
        const text = data.choices?.[0]?.message?.content ?? "";
        const usage = usageOf(data.usage?.prompt_tokens, data.usage?.completion_tokens, data.usage?.prompt_tokens_details?.cached_tokens, data.usage?.completion_tokens_details?.reasoning_tokens);
        request.onUsage?.(usage);
        return { text, model: request.model, usage };
    }
    async generateResponses(request, deployment) {
        const { openai } = await this.clients();
        const instructions = request.messages
            .filter((m) => m.role === "system")
            .map((m) => m.content)
            .join("\n\n");
        const input = request.messages
            .filter((m) => m.role !== "system")
            .map((m) => ({ type: "message", role: m.role, content: m.content }));
        const data = await openai.responses.create({
            model: deployment,
            ...(instructions ? { instructions } : {}),
            input,
            store: false,
            ...(request.format ? { text: { format: { type: "json_object" } } } : {}),
            ...(request.maxOutputTokens ? { max_output_tokens: request.maxOutputTokens } : {}),
        });
        const text = data.output_text ??
            (data.output ?? [])
                .filter((item) => item.type === "message")
                .flatMap((item) => item.content ?? [])
                .filter((part) => part.type === "output_text")
                .map((part) => part.text ?? "")
                .join("");
        const usage = usageOf(data.usage?.input_tokens, data.usage?.output_tokens, data.usage?.input_tokens_details?.cached_tokens, data.usage?.output_tokens_details?.reasoning_tokens);
        request.onUsage?.(usage);
        if (!text && data.status && data.status !== "completed") {
            const reason = data.incomplete_details?.reason;
            const hint = reason === "max_output_tokens"
                ? ` The output budget (${request.maxOutputTokens ?? "default"} tokens) was spent on reasoning` +
                    ` (${usage.reasoningTokens ?? "?"} reasoning tokens). Raise review.maxOutputTokens.`
                : "";
            throw new ModelError(`Model ${deployment} returned status "${data.status}"${reason ? ` (${reason})` : ""} without output.${hint}`);
        }
        return { text, model: request.model, usage };
    }
    /** Claude Messages API: system prompt apart, text blocks joined, cache reads as cached tokens. */
    async generateClaude(request, deployment) {
        const { anthropic } = await this.clients();
        const system = request.messages
            .filter((m) => m.role === "system")
            .map((m) => m.content)
            .join("\n\n");
        const messages = request.messages
            .filter((m) => m.role !== "system")
            .map((m) => ({ role: m.role, content: m.content }));
        // Claude has no JSON mode: the JSON contract lives in the prompt, and the
        // extraction tolerates prose around the document.
        const data = await anthropic.messages.create({
            model: deployment,
            ...(system ? { system } : {}),
            messages,
            max_tokens: request.maxOutputTokens ?? 4096,
            ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
        });
        const text = (data.content ?? [])
            .filter((block) => block.type === "text")
            .map((block) => block.text ?? "")
            .join("");
        const usage = usageOf(data.usage?.input_tokens, data.usage?.output_tokens, data.usage?.cache_read_input_tokens ?? undefined, undefined);
        request.onUsage?.(usage);
        if (!text) {
            throw new ModelError(`Claude deployment ${deployment} returned no text (stop reason ${data.stop_reason ?? "unknown"}).`);
        }
        return { text, model: request.model, usage };
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
        try {
            return { data: request.parse(parsed), usage: result.usage, model: result.model };
        }
        catch (error) {
            throw new ModelError(`Model ${request.model} returned JSON that does not match the expected shape: ${error.message}`, { cause: error });
        }
    }
    mapError(error) {
        if (error instanceof ModelError)
            return error;
        const status = error.status;
        const message = error.message ?? String(error);
        const hint = status === 401 || status === 403
            ? ` Check the credential (${this.options.apiKeyEnv ? `${this.options.apiKeyEnv}, or` : ""} az login / Entra ID role "Azure AI User" on the resource).`
            : status === 404
                ? " Unknown deployment name for this resource: check models.roles / models.tiers against the Foundry portal."
                : "";
        return new ModelError(`Microsoft Foundry error${status ? ` (${status})` : ""}: ${message}.${hint}`, {
            cause: error,
        });
    }
}
function isUnsupportedOperation(error) {
    const status = error.status;
    const message = error.message ?? "";
    return status === 400 && UNSUPPORTED_OPERATION.test(message);
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
//# sourceMappingURL=foundry.js.map