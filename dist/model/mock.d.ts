import type { GenerationRequest, GenerationResult, ModelCapabilities, ModelInfo, ModelProvider, StructuredRequest, StructuredResult } from "../contracts/model.js";
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
export declare class MockProvider implements ModelProvider {
    readonly id = "mock";
    capabilities(): Promise<ModelCapabilities>;
    listModels(): Promise<ModelInfo[]>;
    generate(request: GenerationRequest): Promise<GenerationResult>;
    structured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>>;
}
