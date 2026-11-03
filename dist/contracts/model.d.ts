/**
 * Capability-based model provider contract.
 *
 * The engine never references a concrete provider (OpenAI, Foundry, ...).
 * It asks a provider what it can do and routes requests by *role*, not by
 * hard-coded model name.
 */
/**
 * Logical agent roles. Each role is one model call with one job:
 *   - triage:   decides how complex the change is and which reviewer to use (cheap)
 *   - planner:  reserved for a bounded context-exploration step (cheap)
 *   - reviewer: reasons about the change with the evidence bundle (light or heavy)
 *   - verifier: checks each finding against the quoted code (cheap to medium)
 */
export declare const MODEL_ROLES: readonly ["triage", "planner", "reviewer", "verifier"];
export type ModelRole = (typeof MODEL_ROLES)[number];
export interface ModelCapabilities {
    toolCalling: boolean;
    jsonMode: boolean;
    jsonSchema: boolean;
    streaming: boolean;
    maxInputTokens?: number;
    maxOutputTokens?: number;
}
export interface ModelInfo {
    name: string;
    /** Size in bytes when the provider reports it. */
    size?: number;
    parameterSize?: string;
    quantizationLevel?: string;
}
export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}
export interface GenerationRequest {
    /** Called before parsing structured output, including responses with invalid JSON. */
    onUsage?: (usage: Usage) => void;
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    maxOutputTokens?: number;
    /** Request JSON output ("json"), or a JSON schema when the provider supports it. */
    format?: "json" | object;
}
export interface Usage {
    inputTokens: number;
    outputTokens: number;
    /** Subset of inputTokens; absent means the provider did not report it. */
    cachedInputTokens?: number;
    /** Subset of outputTokens, never charged a second time. */
    reasoningTokens?: number;
    /** Missing token totals or a request without a usage response. */
    usageIncomplete?: boolean;
}
export interface GenerationResult {
    text: string;
    usage: Usage;
    model: string;
}
export interface StructuredRequest<T> extends GenerationRequest {
    /** JSON schema for the expected shape (used when the provider supports it). */
    schema?: object;
    /** Human-readable description used when the provider only supports "json mode". */
    shapeHint?: string;
    parse: (raw: unknown) => T;
}
export interface StructuredResult<T> {
    data: T;
    usage: Usage;
    model: string;
}
export interface ModelProvider {
    readonly id: string;
    capabilities(): Promise<ModelCapabilities>;
    listModels(): Promise<ModelInfo[]>;
    generate(request: GenerationRequest): Promise<GenerationResult>;
    structured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>>;
}
