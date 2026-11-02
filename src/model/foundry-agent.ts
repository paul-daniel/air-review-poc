import type {
  GenerationRequest,
  GenerationResult,
  ModelCapabilities,
  ModelInfo,
  ModelProvider,
  StructuredRequest,
  StructuredResult,
  Usage,
} from "../contracts/model.js";
import { ModelError } from "../errors.js";
import { HttpError, requestJson } from "./http.js";
import { extractJson } from "./json.js";

/**
 * Microsoft Foundry Agent Service provider: every role is a *prompt agent*
 * living in a Foundry project, invoked through the agent's OpenAI-compatible
 * Responses endpoint. The "model" of a role is therefore an agent name, and
 * the model behind the agent is changed in the Foundry portal (or by
 * `scripts/foundry/sync-agents.mjs`), never in this code.
 *
 * REST route (Foundry projects "new" API, api-version v1), from the official
 * quickstart "Create a prompt agent":
 *   POST {project}/agents/{agentName}/endpoint/protocols/openai/responses?api-version=v1
 *   Authorization: Bearer <Entra ID token, scope https://ai.azure.com/.default>
 *   https://learn.microsoft.com/azure/foundry/agents/quickstarts/prompt-agent
 *
 * The request/response bodies are the OpenAI Responses API shapes; the agent's
 * own `instructions` apply, so the role's system prompt is sent once more as
 * `instructions` only when the caller provides one (it overrides nothing on
 * the agent side, it is appended as the first user turn for safety).
 */
export interface FoundryAgentOptions {
  /** `https://<resource>.services.ai.azure.com/api/projects/<project>` */
  projectEndpoint: string;
  token?: string;
  tokenEnv?: string;
  apiVersion?: string;
  timeoutMs: number;
  headers?: Record<string, string>;
  onRetry?: (info: { attempt: number; status: number; delayMs: number }) => void;
}

interface ResponsesResult {
  output_text?: string;
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
    output_tokens_details?: { reasoning_tokens?: number };
  };
  status?: string;
  incomplete_details?: { reason?: string } | null;
  error?: { message?: string } | null;
}

export class FoundryAgentProvider implements ModelProvider {
  readonly id = "azure-foundry-agent";
  private readonly options: FoundryAgentOptions;

  constructor(options: FoundryAgentOptions) {
    this.options = {
      apiVersion: "v1",
      ...options,
      projectEndpoint: options.projectEndpoint.replace(/\/+$/, ""),
    };
    if (!/\/api\/projects\/[^/]+$/i.test(this.options.projectEndpoint)) {
      throw new ModelError(
        `azure-foundry-agent needs the Foundry *project* endpoint ` +
          `(https://<resource>.services.ai.azure.com/api/projects/<project>), got "${options.projectEndpoint}".`,
      );
    }
  }

  async capabilities(): Promise<ModelCapabilities> {
    return { toolCalling: true, jsonMode: true, jsonSchema: false, streaming: false };
  }

  /** GET {project}/agents?api-version=v1 lists the agents of the project. */
  async listModels(): Promise<ModelInfo[]> {
    try {
      const data = (await requestJson(this.url("/agents"), { method: "GET" }, this.httpOptions())) as {
        data?: Array<{ name?: string }>;
        value?: Array<{ name?: string }>;
      };
      return (data.data ?? data.value ?? []).map((agent) => ({ name: agent.name ?? "unknown" }));
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const instructions = request.messages.filter((m) => m.role === "system").map((m) => m.content);
    const input = [
      ...instructions.map((content) => ({ type: "message", role: "user", content })),
      ...request.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ type: "message", role: m.role, content: m.content })),
    ];
    try {
      const data = (await requestJson(
        this.url(`/agents/${encodeURIComponent(request.model)}/endpoint/protocols/openai/responses`),
        {
          method: "POST",
          body: JSON.stringify({
            input,
            store: false,
            ...(request.format ? { text: { format: { type: "json_object" } } } : {}),
            ...(request.maxOutputTokens ? { max_output_tokens: request.maxOutputTokens } : {}),
          }),
        },
        this.httpOptions(),
      )) as ResponsesResult;
      if (data.error?.message) throw new ModelError(data.error.message);
      const text =
        data.output_text ??
        (data.output ?? [])
          .filter((item) => item.type === "message")
          .flatMap((item) => item.content ?? [])
          .filter((part) => part.type === "output_text")
          .map((part) => part.text ?? "")
          .join("");
      const usage = usageOf(data);
      request.onUsage?.(usage);
      if (!text && data.status && data.status !== "completed") {
        throw new ModelError(
          `Agent ${request.model} returned status "${data.status}"${data.incomplete_details?.reason ? ` (${data.incomplete_details.reason})` : ""} without output.`,
        );
      }
      return { text, usage, model: request.model };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async structured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const result = await this.generate({ ...request, format: "json" });
    const raw = extractJson(result.text);
    let parsed: unknown;
    try {
      parsed = raw === null ? null : JSON.parse(raw);
    } catch {
      parsed = null;
    }
    if (parsed === null) {
      throw new ModelError(
        `Agent ${request.model} did not return valid JSON${request.shapeHint ? ` for ${request.shapeHint}` : ""}.`,
      );
    }
    try {
      return { data: request.parse(parsed), usage: result.usage, model: result.model };
    } catch (error) {
      throw new ModelError(
        `Agent ${request.model} returned JSON that does not match the expected shape: ${(error as Error).message}`,
        { cause: error },
      );
    }
  }

  private url(path: string): string {
    return `${this.options.projectEndpoint}${path}?api-version=${encodeURIComponent(this.options.apiVersion ?? "v1")}`;
  }

  private httpOptions() {
    return {
      timeoutMs: this.options.timeoutMs,
      headers: {
        ...(this.options.token ? { authorization: `Bearer ${this.options.token}` } : {}),
        ...(this.options.headers ?? {}),
      },
      onRetry: this.options.onRetry,
    };
  }

  private mapError(error: unknown): Error {
    if (error instanceof ModelError) return error;
    if (error instanceof HttpError) {
      let detail = "";
      try {
        const parsed = JSON.parse(error.body) as { error?: { message?: string } | string; message?: string };
        detail =
          typeof parsed.error === "string" ? parsed.error : (parsed.error?.message ?? parsed.message ?? "");
      } catch {
        /* not json */
      }
      const hint =
        error.status === 401 || error.status === 403
          ? ` Check the Entra ID token${this.options.tokenEnv ? ` in ${this.options.tokenEnv}` : ""} ` +
            `(az account get-access-token --scope https://ai.azure.com/.default) and the "Azure AI User" role on the project.`
          : error.status === 404
            ? " The agent name is unknown in this project: run scripts/foundry/sync-agents.mjs or check models.roles."
            : "";
      return new ModelError(
        `Foundry Agent Service error (${error.status})${detail ? `: ${detail}` : ""}.${hint}`,
      );
    }
    return new ModelError(`Foundry Agent Service request failed: ${(error as Error).message}`, {
      cause: error,
    });
  }
}

function usageOf(data: ResponsesResult): Usage {
  const count = (value: unknown): number | undefined =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
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
