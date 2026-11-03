import type { GenerationRequest, GenerationResult, ModelCapabilities, ModelInfo, ModelProvider, StructuredRequest, StructuredResult } from "../contracts/model.js";
import { type ResolvedAzureCredential } from "./azure-credential.js";
/**
 * Microsoft Foundry Agent Service provider on the official `@azure/ai-projects`
 * SDK: every role is a *prompt agent* of a Foundry project, invoked through the
 * project's OpenAI client with an `agent_reference`, exactly as the quickstart
 * does (https://learn.microsoft.com/azure/foundry/agents/quickstarts/prompt-agent).
 * The "model" of a role is therefore an agent name; the model behind it is
 * changed in Foundry (or by scripts/foundry/sync-agents.mjs), never here.
 */
export interface FoundryAgentOptions {
    /** `https://<resource>.services.ai.azure.com/api/projects/<project>` */
    projectEndpoint: string;
    apiKey?: string;
    apiKeyEnv?: string;
    auth?: "api-key" | "bearer";
    timeoutMs: number;
    /** Test seam. */
    clients?: Partial<AgentClients>;
}
export interface AgentOpenAIDoor {
    responses: {
        create: (body: Record<string, unknown>, options?: {
            body?: Record<string, unknown>;
        }) => Promise<ResponseLike>;
    };
}
export interface AgentClients {
    openai: AgentOpenAIDoor;
    listAgents: () => Promise<string[]>;
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
export declare class FoundryAgentProvider implements ModelProvider {
    readonly id = "azure-foundry-agent";
    private readonly options;
    private clientsPromise;
    private credentialPromise;
    constructor(options: FoundryAgentOptions);
    credential(): Promise<ResolvedAzureCredential>;
    private clients;
    capabilities(): Promise<ModelCapabilities>;
    listModels(): Promise<ModelInfo[]>;
    generate(request: GenerationRequest): Promise<GenerationResult>;
    structured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>>;
    private mapError;
}
export {};
