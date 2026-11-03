import type { ModelProvider } from "../../contracts/model.js";
export declare function runModels(provider: ModelProvider, models: Record<string, string | undefined>, json: boolean, options?: {
    listModels: boolean;
}): Promise<void>;
