import type { GenerationRequest, GenerationResult, ModelCapabilities, ModelInfo, ModelProvider, StructuredRequest, StructuredResult } from "../contracts/model.js";
export type WireApi = "auto" | "chat-completions" | "responses";
export interface OpenAICompatibleOptions {
    /** Wire protocol; see config `endpoint.api`. Default "auto". */
    api?: WireApi;
    /** Called before each retry of a rate-limited or failed request (progress reporting). */
    onRetry?: (info: {
        attempt: number;
        status: number;
        delayMs: number;
    }) => void;
    temperature?: number | null;
    maxTokensParameter?: "max_tokens" | "max_completion_tokens";
    providerId?: string;
    baseUrl: string;
    apiKey?: string;
    /** Name of the env var holding the key, used in error hints. */
    apiKeyEnv?: string;
    apiKeyHeader?: string;
    apiKeyPrefix?: string;
    chatPath?: string;
    modelsPath?: string;
    listModels?: boolean;
    timeoutMs: number;
    headers?: Record<string, string>;
}
export declare class OpenAICompatibleProvider implements ModelProvider {
    readonly id: string;
    private readonly options;
    /** Models that `auto` mode has learned to call through the Responses API. */
    private readonly responsesModels;
    constructor(options: OpenAICompatibleOptions);
    /** Which protocol a model is called with right now (`auto` can change it after a 400). */
    apiFor(model: string): "chat-completions" | "responses";
    get baseUrl(): string;
    capabilities(): Promise<ModelCapabilities>;
    listModels(): Promise<ModelInfo[]>;
    generate(request: GenerationRequest): Promise<GenerationResult>;
    /** POST {base}/chat/completions: the protocol every vendor shares. */
    private generateChat;
    /**
     * POST {base}/responses: OpenAI's newer API (Azure v1 exposes it at the same
     * base URL). System messages become `instructions`; JSON mode is
     * `text.format`; reasoning models ignore temperature, so it is never sent.
     * Reference: https://learn.microsoft.com/azure/foundry/openai/how-to/responses
     */
    private generateResponses;
    structured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>>;
    private httpOptions;
    private mapError;
}
