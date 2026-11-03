export interface InitOptions {
    config?: string;
    provider: string;
    baseUrl?: string;
    frameworks: string;
    ci: "github" | "azure-devops" | "local";
    model?: string;
    plannerModel?: string;
    verifierModel?: string;
    base?: string;
    force: boolean;
}
export declare function renderInitConfig(options: InitOptions): string;
export declare function runInit(options: InitOptions): void;
