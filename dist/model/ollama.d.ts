import type { GenerationRequest, GenerationResult, ModelCapabilities, ModelInfo, ModelProvider, StructuredRequest, StructuredResult } from "../contracts/model.js";
export interface OllamaOptions {
    baseUrl: string;
    timeoutMs: number;
    numCtx?: number;
    keepAlive?: string | number;
    apiKey?: string;
    headers?: Record<string, string>;
}
export declare class OllamaProvider implements ModelProvider {
    readonly id = "ollama";
    private readonly options;
    constructor(options: OllamaOptions);
    get baseUrl(): string;
    capabilities(): Promise<ModelCapabilities>;
    listModels(): Promise<ModelInfo[]>;
    generate(request: GenerationRequest): Promise<GenerationResult>;
    structured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>>;
    private mapError;
    private httpOptions;
}
