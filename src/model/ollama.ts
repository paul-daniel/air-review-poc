import type {
  GenerationRequest,
  GenerationResult,
  ModelCapabilities,
  ModelInfo,
  ModelProvider,
  StructuredRequest,
  StructuredResult,
} from "../contracts/model.js";
import { ModelError } from "../errors.js";
import { HttpError, requestJson } from "./http.js";
import { extractJson } from "./json.js";

export interface OllamaOptions {
  baseUrl: string;
  timeoutMs: number;
  numCtx?: number;
  keepAlive?: string | number;
  apiKey?: string;
  headers?: Record<string, string>;
}

interface OllamaTagsResponse {
  models?: Array<{
    name: string;
    size?: number;
    details?: { parameter_size?: string; quantization_level?: string };
  }>;
}

interface OllamaChatResponse {
  message?: { role?: string; content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
}

export class OllamaProvider implements ModelProvider {
  readonly id = "ollama";
  private readonly options: OllamaOptions;

  constructor(options: OllamaOptions) {
    this.options = options;
  }

  get baseUrl(): string {
    return this.options.baseUrl.replace(/\/+$/, "");
  }

  async capabilities(): Promise<ModelCapabilities> {
    return {
      toolCalling: true,
      jsonMode: true,
      jsonSchema: true,
      streaming: true,
    };
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const data = (await requestJson(
        `${this.baseUrl}/api/tags`,
        { method: "GET" },
        this.httpOptions(),
      )) as OllamaTagsResponse;
      return (data.models ?? []).map((model) => ({
        name: model.name,
        size: model.size,
        parameterSize: model.details?.parameter_size,
        quantizationLevel: model.details?.quantization_level,
      }));
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages,
      stream: false,
      ...(request.format === "json"
        ? { format: "json" }
        : typeof request.format === "object"
          ? { format: request.format }
          : {}),
      options: {
        temperature: request.temperature ?? 0.2,
        ...(this.options.numCtx ? { num_ctx: this.options.numCtx } : {}),
        ...(request.maxOutputTokens ? { num_predict: request.maxOutputTokens } : {}),
      },
      ...(this.options.keepAlive !== undefined ? { keep_alive: this.options.keepAlive } : {}),
    };

    try {
      const data = (await requestJson(
        `${this.baseUrl}/api/chat`,
        { method: "POST", body: JSON.stringify(body) },
        this.httpOptions(),
      )) as OllamaChatResponse;

      if (data.error) throw new Error(data.error);
      const text = data.message?.content ?? "";
      request.onUsage?.({ inputTokens: data.prompt_eval_count ?? 0, outputTokens: data.eval_count ?? 0 });
      return {
        text,
        model: request.model,
        usage: {
          inputTokens: data.prompt_eval_count ?? 0,
          outputTokens: data.eval_count ?? 0,
        },
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async structured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const result = await this.generate({
      model: request.model,
      messages: request.messages,
      temperature: request.temperature ?? 0.1,
      maxOutputTokens: request.maxOutputTokens,
      format: request.schema ?? "json",
      onUsage: request.onUsage,
    });
    const raw = extractJson(result.text);
    let parsed: unknown;
    try {
      parsed = raw === null ? null : JSON.parse(raw);
    } catch {
      parsed = null;
    }
    if (parsed === null) {
      throw new ModelError(
        `Model ${request.model} did not return valid JSON${request.shapeHint ? ` for ${request.shapeHint}` : ""}. ` +
          `Received: ${result.text.slice(0, 200)}`,
      );
    }
    let data: T;
    try {
      data = request.parse(parsed);
    } catch (error) {
      throw new ModelError(
        `Model ${request.model} returned JSON that does not match the expected shape: ` +
          `${(error as Error).message}`,
        { cause: error },
      );
    }
    return { data, usage: result.usage, model: result.model };
  }

  private mapError(error: unknown): Error {
    if (error instanceof ModelError) return error;
    if (error instanceof HttpError) {
      let detail = "";
      try {
        const parsed = JSON.parse(error.body) as { error?: string };
        detail = parsed.error ? `: ${parsed.error}` : "";
      } catch {
        /* not json */
      }
      const hint =
        error.status === 404 && /model .* not found/i.test(detail)
          ? " The model is not pulled locally. Run `ollama pull <model>` or use `air-review models` to list available models."
          : "";
      return new ModelError(`Ollama server error (${error.status})${detail}${hint}`);
    }
    return new ModelError(`Ollama request failed: ${(error as Error).message}`, {
      cause: error,
    });
  }

  private httpOptions(): { timeoutMs: number; headers?: Record<string, string> } {
    return {
      timeoutMs: this.options.timeoutMs,
      headers: {
        ...(this.options.apiKey ? { authorization: `Bearer ${this.options.apiKey}` } : {}),
        ...(this.options.headers ?? {}),
      },
    };
  }
}
