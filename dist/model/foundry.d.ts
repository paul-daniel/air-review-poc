import type { GenerationRequest, GenerationResult, ModelCapabilities, ModelInfo, ModelProvider, StructuredRequest, StructuredResult } from "../contracts/model.js";
import { type ResolvedAzureCredential } from "./azure-credential.js";
/**
 * Microsoft Foundry provider built on the official SDKs.
 *
 * One Foundry resource exposes two documented "doors", and this provider
 * opens the right one per deployment name:
 *
 *   - `https://<resource>/openai/v1` through the `openai` package for every
 *     model sold through the OpenAI-compatible route (GPT, DeepSeek, Llama,
 *     Grok, Mistral, the model router...). Deployment name = `model`.
 *     https://learn.microsoft.com/azure/foundry/foundry-models/concepts/endpoints
 *   - `https://<resource>/anthropic` through `@anthropic-ai/foundry-sdk`
 *     for Claude deployments (Anthropic Messages API).
 *     https://learn.microsoft.com/azure/foundry/foundry-models/how-to/use-foundry-models-claude
 *
 * A deployment is treated as Claude when its name starts with `claude` (the
 * portal's default deployment name is the model name) or when the config
 * writes it as `claude:<deployment>`. Authentication is shared: API key, a
 * provided access token, or keyless Microsoft Entra ID (DefaultAzureCredential)
 * with scope https://ai.azure.com/.default. The SDKs own retries and timeouts.
 */
import type { WireApi } from "./openai-compatible.js";
export interface FoundryProviderOptions {
    /** Resource or project endpoint as pasted from the portal (any documented shape). */
    endpoint: string;
    apiKey?: string;
    apiKeyEnv?: string;
    auth?: "api-key" | "bearer";
    api?: WireApi;
    timeoutMs: number;
    maxTokensParameter?: "max_tokens" | "max_completion_tokens";
    headers?: Record<string, string>;
    /** Test seam: build the SDK clients from a resolved credential. */
    clients?: Partial<FoundryClients>;
}
/** The slice of the SDK clients this provider calls (structural, so tests can fake them). */
export interface OpenAIDoor {
    chat: {
        completions: {
            create: (body: Record<string, unknown>) => Promise<ChatCompletionLike>;
        };
    };
    responses: {
        create: (body: Record<string, unknown>) => Promise<ResponseLike>;
    };
    models?: {
        list: () => Promise<{
            data?: Array<{
                id?: string;
            }>;
        }>;
    };
}
export interface AnthropicDoor {
    messages: {
        create: (body: Record<string, unknown>) => Promise<MessageLike>;
    };
}
export interface FoundryClients {
    openai: OpenAIDoor;
    anthropic: AnthropicDoor;
}
interface ChatCompletionLike {
    choices?: Array<{
        message?: {
            content?: string | null;
        };
    }>;
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        prompt_tokens_details?: {
            cached_tokens?: number;
        };
        completion_tokens_details?: {
            reasoning_tokens?: number;
        };
    } | null;
}
interface ResponseLike {
    output_text?: string;
    output?: Array<{
        type?: string;
        content?: Array<{
            type?: string;
            text?: string;
        }>;
    }>;
    usage?: {
        input_tokens?: number;
        output_tokens?: number;
        input_tokens_details?: {
            cached_tokens?: number;
        };
        output_tokens_details?: {
            reasoning_tokens?: number;
        };
    };
    status?: string;
    incomplete_details?: {
        reason?: string;
    } | null;
}
interface MessageLike {
    content?: Array<{
        type?: string;
        text?: string;
    }>;
    usage?: {
        input_tokens?: number;
        output_tokens?: number;
        cache_read_input_tokens?: number | null;
    };
    stop_reason?: string | null;
}
/** `https://<res>.services.ai.azure.com[/api/projects/<p>][/openai/v1]` → the two base URLs. */
export declare function foundryBaseUrls(endpoint: string): {
    openai: string;
    anthropic: string;
    resource: string;
};
/** `claude:<deployment>` → Claude door; a name starting with "claude" too. */
export declare function splitDeployment(model: string): {
    door: "openai" | "anthropic";
    deployment: string;
};
export declare class FoundryProvider implements ModelProvider {
    readonly id = "azure-foundry";
    private readonly options;
    private clientsPromise;
    private credentialPromise;
    private readonly responsesModels;
    constructor(options: FoundryProviderOptions);
    get baseUrls(): {
        openai: string;
        anthropic: string;
        resource: string;
    };
    /** The credential in use, for `doctor`. */
    credential(): Promise<ResolvedAzureCredential>;
    private clients;
    capabilities(): Promise<ModelCapabilities>;
    /** Foundry has no deployment listing on the data plane; `doctor` probes instead. */
    listModels(): Promise<ModelInfo[]>;
    apiFor(model: string): "chat-completions" | "responses";
    generate(request: GenerationRequest): Promise<GenerationResult>;
    private generateChat;
    private generateResponses;
    /** Claude Messages API: system prompt apart, text blocks joined, cache reads as cached tokens. */
    private generateClaude;
    structured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>>;
    private mapError;
}
export {};
