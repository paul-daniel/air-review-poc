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

/**
 * Offline provider for tests, demos and pipeline dry-runs: no network, no
 * cost, deterministic. It understands the three structured requests the
 * engine makes (triage, reviewer, verifier) by their `shapeHint`:
 *
 *   - triage:   returns the deterministic pre-assessment quoted in the prompt
 *               (`pre-assessment: <tier>`), so routing stays reproducible;
 *   - reviewer: emits one finding per added diff line carrying a marker
 *               `// air-review:expect SEVERITY category rule-id: title`
 *               (used by the test corpus to simulate a model finding);
 *   - verifier: keeps every finding unchanged.
 *
 * Token counts are synthetic (characters / 4) so cost reports still exercise
 * the pricing table.
 */
export class MockProvider implements ModelProvider {
  readonly id = "mock";

  async capabilities(): Promise<ModelCapabilities> {
    return { toolCalling: false, jsonMode: true, jsonSchema: false, streaming: false };
  }

  async listModels(): Promise<ModelInfo[]> {
    return [{ name: "mock-small" }, { name: "mock-large" }];
  }

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const text = JSON.stringify(mockAnswer(request.messages.map((m) => m.content).join("\n"), "json"));
    const usage = syntheticUsage(request, text);
    request.onUsage?.(usage);
    return { text, usage, model: request.model };
  }

  async structured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const prompt = request.messages.map((m) => m.content).join("\n");
    const raw = mockAnswer(prompt, request.shapeHint ?? "");
    const text = JSON.stringify(raw);
    const usage = syntheticUsage(request, text);
    request.onUsage?.(usage);
    let data: T;
    try {
      data = request.parse(raw);
    } catch (error) {
      throw new ModelError(
        `Mock provider produced an unexpected shape for ${request.shapeHint}: ${(error as Error).message}`,
      );
    }
    return { data, usage, model: request.model };
  }
}

const EXPECT_MARKER =
  /^\+.*air-review:expect\s+(BLOCKER|CRITICAL|MAJOR|MINOR|INFO)\s+([a-z-]+)\s+([a-z0-9.-]+):\s*(.+?)\s*$/i;

function mockAnswer(prompt: string, shapeHint: string): unknown {
  if (/triage/i.test(shapeHint)) {
    const tier = prompt.match(/pre-assessment:\s*(light|standard|heavy)/i)?.[1]?.toLowerCase() ?? "standard";
    return { tier, confidence: 0.75, reasons: ["mock triage echoes the deterministic pre-assessment"] };
  }
  if (/verifier/i.test(shapeHint)) {
    const count = prompt.match(/--- finding \d+ ---/g)?.length ?? 0;
    return {
      verdicts: Array.from({ length: count }, (_, index) => ({
        index,
        verdict: "keep",
        reason: "mock verifier",
      })),
    };
  }
  // Reviewer: findings from markers in the diff, anchored on the marker's line.
  const findings: unknown[] = [];
  let file = "";
  let newLine = 0;
  for (const line of prompt.split("\n")) {
    const header = line.match(/^\+\+\+ b\/(.+)$/);
    if (header) {
      file = header[1]!;
      continue;
    }
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (line.startsWith("-")) continue;
    if (line.startsWith("+")) {
      const marker = line.match(EXPECT_MARKER);
      if (marker && file) {
        findings.push({
          severity: marker[1]!.toUpperCase(),
          confidence: 0.92,
          scope: "IN_PR",
          ruleOrigin: "HEURISTIC",
          category: marker[2]!.toLowerCase(),
          ruleId: marker[3],
          title: marker[4],
          summary: `Mock reviewer finding generated from an air-review:expect marker on line ${newLine} of ${file}.`,
          suggestion: "Replace the marker with real code (mock provider).",
          file,
          startLine: newLine,
          endLine: newLine,
          symbol: null,
          evidence: [{ kind: "reference", label: "mock provider marker" }],
        });
      }
      newLine += 1;
      continue;
    }
    if (line.startsWith(" ") || line === "") newLine += line === "" ? 0 : 1;
  }
  return { findings };
}

function syntheticUsage(request: GenerationRequest, output: string): Usage {
  const input = request.messages.reduce((sum, m) => sum + m.content.length, 0);
  return {
    inputTokens: Math.ceil(input / 4),
    outputTokens: Math.ceil(output.length / 4),
    cachedInputTokens: 0,
  };
}
