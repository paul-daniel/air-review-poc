import { ModelError } from "../errors.js";
import { extractJson } from "./json.js";
import { resolveAzureCredential } from "./azure-credential.js";
export class FoundryAgentProvider {
    id = "azure-foundry-agent";
    options;
    clientsPromise = null;
    credentialPromise = null;
    constructor(options) {
        this.options = { ...options, projectEndpoint: options.projectEndpoint.replace(/\/+$/, "") };
        if (!/\/api\/projects\/[^/]+$/i.test(this.options.projectEndpoint)) {
            throw new ModelError(`azure-foundry-agent needs the Foundry *project* endpoint ` +
                `(https://<resource>.services.ai.azure.com/api/projects/<project>), got "${options.projectEndpoint}".`);
        }
    }
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
            if (this.options.clients?.openai && this.options.clients.listAgents) {
                return this.options.clients;
            }
            const credential = await this.credential();
            if (!credential.credential) {
                throw new ModelError("The Foundry Agent Service needs a Microsoft Entra ID identity (az login, managed identity, service connection) or AIR_REVIEW_ACCESS_TOKEN; API keys are not supported for agents.");
            }
            const { AIProjectClient } = await import("@azure/ai-projects");
            const project = new AIProjectClient(this.options.projectEndpoint, credential.credential);
            const openai = project.getOpenAIClient({
                timeout: this.options.timeoutMs,
            });
            return {
                openai: this.options.clients?.openai ?? openai,
                listAgents: this.options.clients?.listAgents ??
                    (async () => {
                        const names = [];
                        for await (const agent of project.agents.list()) {
                            names.push(agent.name ?? "unknown");
                        }
                        return names;
                    }),
            };
        })();
        return this.clientsPromise;
    }
    async capabilities() {
        return { toolCalling: true, jsonMode: true, jsonSchema: false, streaming: false };
    }
    async listModels() {
        try {
            const { listAgents } = await this.clients();
            return (await listAgents()).map((name) => ({ name }));
        }
        catch (error) {
            throw this.mapError(error);
        }
    }
    async generate(request) {
        try {
            const { openai } = await this.clients();
            // The agent carries its own instructions; the role's system prompt is
            // passed as the first user turn so it is never lost on agents created by hand.
            const input = [
                ...request.messages
                    .filter((m) => m.role === "system")
                    .map((m) => ({ type: "message", role: "user", content: m.content })),
                ...request.messages
                    .filter((m) => m.role !== "system")
                    .map((m) => ({ type: "message", role: m.role, content: m.content })),
            ];
            const data = await openai.responses.create({
                input,
                store: false,
                ...(request.format ? { text: { format: { type: "json_object" } } } : {}),
                ...(request.maxOutputTokens ? { max_output_tokens: request.maxOutputTokens } : {}),
            }, { body: { agent_reference: { name: request.model, type: "agent_reference" } } });
            const text = data.output_text ??
                (data.output ?? [])
                    .filter((item) => item.type === "message")
                    .flatMap((item) => item.content ?? [])
                    .filter((part) => part.type === "output_text")
                    .map((part) => part.text ?? "")
                    .join("");
            const usage = usageOf(data);
            request.onUsage?.(usage);
            if (!text && data.status && data.status !== "completed") {
                throw new ModelError(`Agent ${request.model} returned status "${data.status}"${data.incomplete_details?.reason ? ` (${data.incomplete_details.reason})` : ""} without output.`);
            }
            return { text, usage, model: request.model };
        }
        catch (error) {
            throw this.mapError(error);
        }
    }
    async structured(request) {
        const result = await this.generate({ ...request, format: "json" });
        const raw = extractJson(result.text);
        let parsed;
        try {
            parsed = raw === null ? null : JSON.parse(raw);
        }
        catch {
            parsed = null;
        }
        if (parsed === null) {
            throw new ModelError(`Agent ${request.model} did not return valid JSON${request.shapeHint ? ` for ${request.shapeHint}` : ""}.`);
        }
        try {
            return { data: request.parse(parsed), usage: result.usage, model: result.model };
        }
        catch (error) {
            throw new ModelError(`Agent ${request.model} returned JSON that does not match the expected shape: ${error.message}`, { cause: error });
        }
    }
    mapError(error) {
        if (error instanceof ModelError)
            return error;
        const status = error.status;
        const hint = status === 401 || status === 403
            ? ' Check the Entra ID identity and the "Azure AI User" role on the project.'
            : status === 404
                ? " The agent name is unknown in this project: run scripts/foundry/sync-agents.mjs or check models.roles."
                : "";
        return new ModelError(`Foundry Agent Service error${status ? ` (${status})` : ""}: ${error.message}.${hint}`, { cause: error });
    }
}
function usageOf(data) {
    const count = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
    const inputTokens = count(data.usage?.input_tokens);
    const outputTokens = count(data.usage?.output_tokens);
    return {
        inputTokens: inputTokens ?? 0,
        outputTokens: outputTokens ?? 0,
        cachedInputTokens: count(data.usage?.input_tokens_details?.cached_tokens),
        reasoningTokens: count(data.usage?.output_tokens_details?.reasoning_tokens),
        usageIncomplete: inputTokens === undefined || outputTokens === undefined,
    };
}
//# sourceMappingURL=foundry-agent.js.map