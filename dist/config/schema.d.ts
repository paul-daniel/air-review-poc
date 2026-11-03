import { z } from "zod";
export declare const SEVERITY_LEVEL: z.ZodEnum<["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "NITPICK", "INFO"]>;
export declare const PROVIDER_KIND: z.ZodEffects<z.ZodString, string, string>;
export declare const configSchema: z.ZodObject<{
    version: z.ZodDefault<z.ZodLiteral<1>>;
    frameworks: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    provider: z.ZodDefault<z.ZodEffects<z.ZodString, string, string>>;
    endpoint: z.ZodDefault<z.ZodObject<{
        temperature: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        maxTokensParameter: z.ZodOptional<z.ZodEnum<["max_tokens", "max_completion_tokens"]>>;
        baseUrl: z.ZodOptional<z.ZodString>;
        /**
         * How the credential travels. "api-key" uses the preset header (Azure: `api-key`,
         * others: `Authorization: Bearer`). "bearer" forces `Authorization: Bearer <token>`,
         * which is what a Microsoft Entra ID access token or any OAuth gateway expects.
         */
        auth: z.ZodOptional<z.ZodEnum<["api-key", "bearer"]>>;
        /**
         * Wire protocol. "chat-completions" is what every vendor shares; "responses"
         * is OpenAI's newer API, required by some deployments (gpt-5-codex on Azure).
         * "auto" (default) starts with chat completions and switches a model to the
         * Responses API when the endpoint reports the operation as unsupported.
         */
        api: z.ZodOptional<z.ZodEnum<["auto", "chat-completions", "responses"]>>;
        apiKeyEnv: z.ZodOptional<z.ZodString>;
        /** Direct key value; prefer apiKeyEnv so secrets stay in the environment. */
        apiKey: z.ZodOptional<z.ZodString>;
        /** Header used to carry the key: "authorization" (default) or "api-key" (Azure). */
        apiKeyHeader: z.ZodOptional<z.ZodString>;
        /** Prefix for the key value: "Bearer " (default) or "" (Azure). */
        apiKeyPrefix: z.ZodOptional<z.ZodString>;
        /** Chat completion path; preset defaults, override for unusual gateways. */
        chatPath: z.ZodOptional<z.ZodString>;
        /** Model listing path; ignored when listModels is false. */
        modelsPath: z.ZodOptional<z.ZodString>;
        /** Some endpoints (Azure OpenAI) do not expose a compatible /models route. */
        listModels: z.ZodOptional<z.ZodBoolean>;
        timeoutMs: z.ZodDefault<z.ZodNumber>;
        headers: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        timeoutMs: number;
        headers: Record<string, string>;
        temperature?: number | null | undefined;
        maxTokensParameter?: "max_tokens" | "max_completion_tokens" | undefined;
        baseUrl?: string | undefined;
        auth?: "api-key" | "bearer" | undefined;
        api?: "auto" | "chat-completions" | "responses" | undefined;
        apiKeyEnv?: string | undefined;
        apiKey?: string | undefined;
        apiKeyHeader?: string | undefined;
        apiKeyPrefix?: string | undefined;
        chatPath?: string | undefined;
        modelsPath?: string | undefined;
        listModels?: boolean | undefined;
    }, {
        temperature?: number | null | undefined;
        maxTokensParameter?: "max_tokens" | "max_completion_tokens" | undefined;
        baseUrl?: string | undefined;
        auth?: "api-key" | "bearer" | undefined;
        api?: "auto" | "chat-completions" | "responses" | undefined;
        apiKeyEnv?: string | undefined;
        apiKey?: string | undefined;
        apiKeyHeader?: string | undefined;
        apiKeyPrefix?: string | undefined;
        chatPath?: string | undefined;
        modelsPath?: string | undefined;
        listModels?: boolean | undefined;
        timeoutMs?: number | undefined;
        headers?: Record<string, string> | undefined;
    }>>;
    models: z.ZodDefault<z.ZodObject<{
        default: z.ZodOptional<z.ZodString>;
        roles: z.ZodDefault<z.ZodObject<{
            triage: z.ZodOptional<z.ZodString>;
            planner: z.ZodOptional<z.ZodString>;
            reviewer: z.ZodOptional<z.ZodString>;
            verifier: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            planner?: string | undefined;
            reviewer?: string | undefined;
            verifier?: string | undefined;
            triage?: string | undefined;
        }, {
            planner?: string | undefined;
            reviewer?: string | undefined;
            verifier?: string | undefined;
            triage?: string | undefined;
        }>>;
        /**
         * Models used instead of `roles.reviewer` / `roles.verifier` when the triage
         * step classifies the change as light (cheap model) or heavy (strong model).
         * A tier without a model falls back to the standard role model.
         */
        tiers: z.ZodDefault<z.ZodObject<{
            light: z.ZodDefault<z.ZodObject<{
                reviewer: z.ZodOptional<z.ZodString>;
                verifier: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                reviewer?: string | undefined;
                verifier?: string | undefined;
            }, {
                reviewer?: string | undefined;
                verifier?: string | undefined;
            }>>;
            heavy: z.ZodDefault<z.ZodObject<{
                reviewer: z.ZodOptional<z.ZodString>;
                verifier: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                reviewer?: string | undefined;
                verifier?: string | undefined;
            }, {
                reviewer?: string | undefined;
                verifier?: string | undefined;
            }>>;
        }, "strip", z.ZodTypeAny, {
            light: {
                reviewer?: string | undefined;
                verifier?: string | undefined;
            };
            heavy: {
                reviewer?: string | undefined;
                verifier?: string | undefined;
            };
        }, {
            light?: {
                reviewer?: string | undefined;
                verifier?: string | undefined;
            } | undefined;
            heavy?: {
                reviewer?: string | undefined;
                verifier?: string | undefined;
            } | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        roles: {
            planner?: string | undefined;
            reviewer?: string | undefined;
            verifier?: string | undefined;
            triage?: string | undefined;
        };
        tiers: {
            light: {
                reviewer?: string | undefined;
                verifier?: string | undefined;
            };
            heavy: {
                reviewer?: string | undefined;
                verifier?: string | undefined;
            };
        };
        default?: string | undefined;
    }, {
        default?: string | undefined;
        roles?: {
            planner?: string | undefined;
            reviewer?: string | undefined;
            verifier?: string | undefined;
            triage?: string | undefined;
        } | undefined;
        tiers?: {
            light?: {
                reviewer?: string | undefined;
                verifier?: string | undefined;
            } | undefined;
            heavy?: {
                reviewer?: string | undefined;
                verifier?: string | undefined;
            } | undefined;
        } | undefined;
    }>>;
    routing: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        mode: z.ZodDefault<z.ZodEnum<["deterministic", "hybrid", "model"]>>;
        light: z.ZodDefault<z.ZodObject<{
            maxFiles: z.ZodDefault<z.ZodNumber>;
            maxLines: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            maxFiles: number;
            maxLines: number;
        }, {
            maxFiles?: number | undefined;
            maxLines?: number | undefined;
        }>>;
        heavy: z.ZodDefault<z.ZodObject<{
            minFiles: z.ZodDefault<z.ZodNumber>;
            minLines: z.ZodDefault<z.ZodNumber>;
            minModules: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            minFiles: number;
            minLines: number;
            minModules: number;
        }, {
            minFiles?: number | undefined;
            minLines?: number | undefined;
            minModules?: number | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        light: {
            maxFiles: number;
            maxLines: number;
        };
        heavy: {
            minFiles: number;
            minLines: number;
            minModules: number;
        };
        mode: "deterministic" | "hybrid" | "model";
    }, {
        enabled?: boolean | undefined;
        light?: {
            maxFiles?: number | undefined;
            maxLines?: number | undefined;
        } | undefined;
        heavy?: {
            minFiles?: number | undefined;
            minLines?: number | undefined;
            minModules?: number | undefined;
        } | undefined;
        mode?: "deterministic" | "hybrid" | "model" | undefined;
    }>>;
    observability: z.ZodDefault<z.ZodObject<{
        /** Per-run Markdown + JSON report with cost per step and the workflow diagram. */
        reportDir: z.ZodDefault<z.ZodString>;
        /** Generate the Mermaid workflow diagram of the path actually taken. */
        diagram: z.ZodDefault<z.ZodBoolean>;
        /** Include the cost table and diagram in the pull-request summary comment. */
        publishInSummary: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        reportDir: string;
        diagram: boolean;
        publishInSummary: boolean;
    }, {
        reportDir?: string | undefined;
        diagram?: boolean | undefined;
        publishInSummary?: boolean | undefined;
    }>>;
    telemetry: z.ZodDefault<z.ZodObject<{
        /** Append one JSON line per run to this file. */
        log: z.ZodDefault<z.ZodString>;
        enabled: z.ZodDefault<z.ZodBoolean>;
        /** Optional prices in USD per 1M tokens, keyed by model / deployment / agent name. */
        pricing: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodObject<{
            input: z.ZodNumber;
            output: z.ZodNumber;
            cachedInput: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            input: number;
            output: number;
            cachedInput?: number | undefined;
        }, {
            input: number;
            output: number;
            cachedInput?: number | undefined;
        }>>>;
    }, "strip", z.ZodTypeAny, {
        log: string;
        enabled: boolean;
        pricing: Record<string, {
            input: number;
            output: number;
            cachedInput?: number | undefined;
        }>;
    }, {
        log?: string | undefined;
        enabled?: boolean | undefined;
        pricing?: Record<string, {
            input: number;
            output: number;
            cachedInput?: number | undefined;
        }> | undefined;
    }>>;
    context: z.ZodDefault<z.ZodObject<{
        strategy: z.ZodDefault<z.ZodEnum<["structural-selective"]>>;
        semanticFallback: z.ZodDefault<z.ZodBoolean>;
        maxContextRequests: z.ZodDefault<z.ZodNumber>;
        maxEvidenceTokens: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        strategy: "structural-selective";
        semanticFallback: boolean;
        maxContextRequests: number;
        maxEvidenceTokens: number;
    }, {
        strategy?: "structural-selective" | undefined;
        semanticFallback?: boolean | undefined;
        maxContextRequests?: number | undefined;
        maxEvidenceTokens?: number | undefined;
    }>>;
    review: z.ZodDefault<z.ZodObject<{
        severities: z.ZodDefault<z.ZodObject<{
            publish: z.ZodDefault<z.ZodArray<z.ZodEnum<["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "NITPICK", "INFO"]>, "many">>;
        }, "strip", z.ZodTypeAny, {
            publish: ("BLOCKER" | "CRITICAL" | "MAJOR" | "MINOR" | "NITPICK" | "INFO")[];
        }, {
            publish?: ("BLOCKER" | "CRITICAL" | "MAJOR" | "MINOR" | "NITPICK" | "INFO")[] | undefined;
        }>>;
        gate: z.ZodDefault<z.ZodObject<{
            /**
             * Severities that block approval while open. Everything down to MINOR
             * must be fixed; NITPICK (reviewer preference) and INFO (existing debt,
             * follow-ups) never block.
             */
            severities: z.ZodDefault<z.ZodArray<z.ZodEnum<["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "NITPICK", "INFO"]>, "many">>;
            /** Findings below this confidence are published as suggestions but do not block. */
            minimumConfidence: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            severities: ("BLOCKER" | "CRITICAL" | "MAJOR" | "MINOR" | "NITPICK" | "INFO")[];
            minimumConfidence: number;
        }, {
            severities?: ("BLOCKER" | "CRITICAL" | "MAJOR" | "MINOR" | "NITPICK" | "INFO")[] | undefined;
            minimumConfidence?: number | undefined;
        }>>;
        maxFindings: z.ZodDefault<z.ZodNumber>;
        /**
         * Output budget of the reviewer call. Reasoning models (gpt-5, o-series,
         * DeepSeek-R) spend most of it on hidden reasoning, so 4k is not enough for
         * a real pull request; 16k keeps the worst-case output cost around a few
         * cents while leaving room for the findings JSON.
         */
        maxOutputTokens: z.ZodDefault<z.ZodNumber>;
        /**
         * File kinds (see review/triage.ts changeKindOf) that never justify a model
         * call on their own: a push that only touches these is "nothing new to
         * review" for the agents. Deterministic rules (secret scanning) still run.
         */
        modelSkipKinds: z.ZodDefault<z.ZodArray<z.ZodEnum<["translation", "docs", "data", "config", "tests", "binary"]>, "many">>;
    }, "strip", z.ZodTypeAny, {
        severities: {
            publish: ("BLOCKER" | "CRITICAL" | "MAJOR" | "MINOR" | "NITPICK" | "INFO")[];
        };
        gate: {
            severities: ("BLOCKER" | "CRITICAL" | "MAJOR" | "MINOR" | "NITPICK" | "INFO")[];
            minimumConfidence: number;
        };
        maxFindings: number;
        maxOutputTokens: number;
        modelSkipKinds: ("binary" | "translation" | "docs" | "data" | "config" | "tests")[];
    }, {
        severities?: {
            publish?: ("BLOCKER" | "CRITICAL" | "MAJOR" | "MINOR" | "NITPICK" | "INFO")[] | undefined;
        } | undefined;
        gate?: {
            severities?: ("BLOCKER" | "CRITICAL" | "MAJOR" | "MINOR" | "NITPICK" | "INFO")[] | undefined;
            minimumConfidence?: number | undefined;
        } | undefined;
        maxFindings?: number | undefined;
        maxOutputTokens?: number | undefined;
        modelSkipKinds?: ("binary" | "translation" | "docs" | "data" | "config" | "tests")[] | undefined;
    }>>;
    memory: z.ZodDefault<z.ZodObject<{
        backend: z.ZodDefault<z.ZodEnum<["pr-ledger", "local", "none"]>>;
    }, "strip", z.ZodTypeAny, {
        backend: "pr-ledger" | "local" | "none";
    }, {
        backend?: "pr-ledger" | "local" | "none" | undefined;
    }>>;
    cache: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        dir: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        dir: string;
    }, {
        enabled?: boolean | undefined;
        dir?: string | undefined;
    }>>;
    privacy: z.ZodDefault<z.ZodObject<{
        redactSecrets: z.ZodDefault<z.ZodBoolean>;
        sendFullFiles: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        redactSecrets: boolean;
        sendFullFiles: boolean;
    }, {
        redactSecrets?: boolean | undefined;
        sendFullFiles?: boolean | undefined;
    }>>;
    platform: z.ZodDefault<z.ZodObject<{
        provider: z.ZodDefault<z.ZodEnum<["github", "azure-devops", "local"]>>;
        publish: z.ZodDefault<z.ZodBoolean>;
        github: z.ZodDefault<z.ZodObject<{
            owner: z.ZodOptional<z.ZodString>;
            repo: z.ZodOptional<z.ZodString>;
            tokenEnv: z.ZodDefault<z.ZodString>;
            apiBaseUrl: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            tokenEnv: string;
            owner?: string | undefined;
            repo?: string | undefined;
            apiBaseUrl?: string | undefined;
        }, {
            owner?: string | undefined;
            repo?: string | undefined;
            tokenEnv?: string | undefined;
            apiBaseUrl?: string | undefined;
        }>>;
        azureDevops: z.ZodDefault<z.ZodObject<{
            /** Organization URL, e.g. https://dev.azure.com/acme; detected from SYSTEM_TEAMFOUNDATIONCOLLECTIONURI in Azure Pipelines. */
            organizationUrl: z.ZodOptional<z.ZodString>;
            /** Project name or id; detected from SYSTEM_TEAMPROJECT. */
            project: z.ZodOptional<z.ZodString>;
            /** Repository name or GUID; detected from BUILD_REPOSITORY_ID. */
            repository: z.ZodOptional<z.ZodString>;
            /** Env var holding the PAT or $(System.AccessToken); AZURE_DEVOPS_EXT_PAT and AZURE_DEVOPS_TOKEN are fallbacks. */
            tokenEnv: z.ZodDefault<z.ZodString>;
            /** REST api-version the adapter was written against. */
            apiVersion: z.ZodDefault<z.ZodString>;
            /**
             * Reviewer vote cast after publishing: 10 approved when nothing is open,
             * 5 approved-with-suggestions when only non-blocking findings remain,
             * -5 waiting-for-author when the gate fails. Never merges.
             */
            vote: z.ZodDefault<z.ZodObject<{
                enabled: z.ZodDefault<z.ZodBoolean>;
                approveWithSuggestions: z.ZodDefault<z.ZodBoolean>;
                /**
                 * "pipeline" (default): the review step only ever votes *against*
                 * (waiting for author); the approving vote is cast by a separate
                 * `air-review approve` step that the pipeline runs once the review,
                 * the build and the tests have all succeeded. "immediate": the review
                 * step casts the final vote itself (single-step pipelines).
                 */
                mode: z.ZodDefault<z.ZodEnum<["pipeline", "immediate"]>>;
            }, "strip", z.ZodTypeAny, {
                enabled: boolean;
                mode: "pipeline" | "immediate";
                approveWithSuggestions: boolean;
            }, {
                enabled?: boolean | undefined;
                mode?: "pipeline" | "immediate" | undefined;
                approveWithSuggestions?: boolean | undefined;
            }>>;
            /** Optional pull-request status (`air-review/gate`) usable by a "Status" branch policy. */
            status: z.ZodDefault<z.ZodObject<{
                enabled: z.ZodDefault<z.ZodBoolean>;
                genre: z.ZodDefault<z.ZodString>;
                name: z.ZodDefault<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                enabled: boolean;
                genre: string;
                name: string;
            }, {
                enabled?: boolean | undefined;
                genre?: string | undefined;
                name?: string | undefined;
            }>>;
        }, "strip", z.ZodTypeAny, {
            status: {
                enabled: boolean;
                genre: string;
                name: string;
            };
            tokenEnv: string;
            apiVersion: string;
            vote: {
                enabled: boolean;
                mode: "pipeline" | "immediate";
                approveWithSuggestions: boolean;
            };
            organizationUrl?: string | undefined;
            project?: string | undefined;
            repository?: string | undefined;
        }, {
            status?: {
                enabled?: boolean | undefined;
                genre?: string | undefined;
                name?: string | undefined;
            } | undefined;
            tokenEnv?: string | undefined;
            organizationUrl?: string | undefined;
            project?: string | undefined;
            repository?: string | undefined;
            apiVersion?: string | undefined;
            vote?: {
                enabled?: boolean | undefined;
                mode?: "pipeline" | "immediate" | undefined;
                approveWithSuggestions?: boolean | undefined;
            } | undefined;
        }>>;
        local: z.ZodDefault<z.ZodObject<{
            base: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            base?: string | undefined;
        }, {
            base?: string | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        publish: boolean;
        local: {
            base?: string | undefined;
        };
        github: {
            tokenEnv: string;
            owner?: string | undefined;
            repo?: string | undefined;
            apiBaseUrl?: string | undefined;
        };
        provider: "local" | "github" | "azure-devops";
        azureDevops: {
            status: {
                enabled: boolean;
                genre: string;
                name: string;
            };
            tokenEnv: string;
            apiVersion: string;
            vote: {
                enabled: boolean;
                mode: "pipeline" | "immediate";
                approveWithSuggestions: boolean;
            };
            organizationUrl?: string | undefined;
            project?: string | undefined;
            repository?: string | undefined;
        };
    }, {
        publish?: boolean | undefined;
        local?: {
            base?: string | undefined;
        } | undefined;
        github?: {
            owner?: string | undefined;
            repo?: string | undefined;
            tokenEnv?: string | undefined;
            apiBaseUrl?: string | undefined;
        } | undefined;
        provider?: "local" | "github" | "azure-devops" | undefined;
        azureDevops?: {
            status?: {
                enabled?: boolean | undefined;
                genre?: string | undefined;
                name?: string | undefined;
            } | undefined;
            tokenEnv?: string | undefined;
            organizationUrl?: string | undefined;
            project?: string | undefined;
            repository?: string | undefined;
            apiVersion?: string | undefined;
            vote?: {
                enabled?: boolean | undefined;
                mode?: "pipeline" | "immediate" | undefined;
                approveWithSuggestions?: boolean | undefined;
            } | undefined;
        } | undefined;
    }>>;
}, "strict", z.ZodTypeAny, {
    provider: string;
    version: 1;
    frameworks: string[];
    endpoint: {
        timeoutMs: number;
        headers: Record<string, string>;
        temperature?: number | null | undefined;
        maxTokensParameter?: "max_tokens" | "max_completion_tokens" | undefined;
        baseUrl?: string | undefined;
        auth?: "api-key" | "bearer" | undefined;
        api?: "auto" | "chat-completions" | "responses" | undefined;
        apiKeyEnv?: string | undefined;
        apiKey?: string | undefined;
        apiKeyHeader?: string | undefined;
        apiKeyPrefix?: string | undefined;
        chatPath?: string | undefined;
        modelsPath?: string | undefined;
        listModels?: boolean | undefined;
    };
    models: {
        roles: {
            planner?: string | undefined;
            reviewer?: string | undefined;
            verifier?: string | undefined;
            triage?: string | undefined;
        };
        tiers: {
            light: {
                reviewer?: string | undefined;
                verifier?: string | undefined;
            };
            heavy: {
                reviewer?: string | undefined;
                verifier?: string | undefined;
            };
        };
        default?: string | undefined;
    };
    routing: {
        enabled: boolean;
        light: {
            maxFiles: number;
            maxLines: number;
        };
        heavy: {
            minFiles: number;
            minLines: number;
            minModules: number;
        };
        mode: "deterministic" | "hybrid" | "model";
    };
    observability: {
        reportDir: string;
        diagram: boolean;
        publishInSummary: boolean;
    };
    telemetry: {
        log: string;
        enabled: boolean;
        pricing: Record<string, {
            input: number;
            output: number;
            cachedInput?: number | undefined;
        }>;
    };
    context: {
        strategy: "structural-selective";
        semanticFallback: boolean;
        maxContextRequests: number;
        maxEvidenceTokens: number;
    };
    review: {
        severities: {
            publish: ("BLOCKER" | "CRITICAL" | "MAJOR" | "MINOR" | "NITPICK" | "INFO")[];
        };
        gate: {
            severities: ("BLOCKER" | "CRITICAL" | "MAJOR" | "MINOR" | "NITPICK" | "INFO")[];
            minimumConfidence: number;
        };
        maxFindings: number;
        maxOutputTokens: number;
        modelSkipKinds: ("binary" | "translation" | "docs" | "data" | "config" | "tests")[];
    };
    memory: {
        backend: "pr-ledger" | "local" | "none";
    };
    cache: {
        enabled: boolean;
        dir: string;
    };
    privacy: {
        redactSecrets: boolean;
        sendFullFiles: boolean;
    };
    platform: {
        publish: boolean;
        local: {
            base?: string | undefined;
        };
        github: {
            tokenEnv: string;
            owner?: string | undefined;
            repo?: string | undefined;
            apiBaseUrl?: string | undefined;
        };
        provider: "local" | "github" | "azure-devops";
        azureDevops: {
            status: {
                enabled: boolean;
                genre: string;
                name: string;
            };
            tokenEnv: string;
            apiVersion: string;
            vote: {
                enabled: boolean;
                mode: "pipeline" | "immediate";
                approveWithSuggestions: boolean;
            };
            organizationUrl?: string | undefined;
            project?: string | undefined;
            repository?: string | undefined;
        };
    };
}, {
    provider?: string | undefined;
    version?: 1 | undefined;
    frameworks?: string[] | undefined;
    endpoint?: {
        temperature?: number | null | undefined;
        maxTokensParameter?: "max_tokens" | "max_completion_tokens" | undefined;
        baseUrl?: string | undefined;
        auth?: "api-key" | "bearer" | undefined;
        api?: "auto" | "chat-completions" | "responses" | undefined;
        apiKeyEnv?: string | undefined;
        apiKey?: string | undefined;
        apiKeyHeader?: string | undefined;
        apiKeyPrefix?: string | undefined;
        chatPath?: string | undefined;
        modelsPath?: string | undefined;
        listModels?: boolean | undefined;
        timeoutMs?: number | undefined;
        headers?: Record<string, string> | undefined;
    } | undefined;
    models?: {
        default?: string | undefined;
        roles?: {
            planner?: string | undefined;
            reviewer?: string | undefined;
            verifier?: string | undefined;
            triage?: string | undefined;
        } | undefined;
        tiers?: {
            light?: {
                reviewer?: string | undefined;
                verifier?: string | undefined;
            } | undefined;
            heavy?: {
                reviewer?: string | undefined;
                verifier?: string | undefined;
            } | undefined;
        } | undefined;
    } | undefined;
    routing?: {
        enabled?: boolean | undefined;
        light?: {
            maxFiles?: number | undefined;
            maxLines?: number | undefined;
        } | undefined;
        heavy?: {
            minFiles?: number | undefined;
            minLines?: number | undefined;
            minModules?: number | undefined;
        } | undefined;
        mode?: "deterministic" | "hybrid" | "model" | undefined;
    } | undefined;
    observability?: {
        reportDir?: string | undefined;
        diagram?: boolean | undefined;
        publishInSummary?: boolean | undefined;
    } | undefined;
    telemetry?: {
        log?: string | undefined;
        enabled?: boolean | undefined;
        pricing?: Record<string, {
            input: number;
            output: number;
            cachedInput?: number | undefined;
        }> | undefined;
    } | undefined;
    context?: {
        strategy?: "structural-selective" | undefined;
        semanticFallback?: boolean | undefined;
        maxContextRequests?: number | undefined;
        maxEvidenceTokens?: number | undefined;
    } | undefined;
    review?: {
        severities?: {
            publish?: ("BLOCKER" | "CRITICAL" | "MAJOR" | "MINOR" | "NITPICK" | "INFO")[] | undefined;
        } | undefined;
        gate?: {
            severities?: ("BLOCKER" | "CRITICAL" | "MAJOR" | "MINOR" | "NITPICK" | "INFO")[] | undefined;
            minimumConfidence?: number | undefined;
        } | undefined;
        maxFindings?: number | undefined;
        maxOutputTokens?: number | undefined;
        modelSkipKinds?: ("binary" | "translation" | "docs" | "data" | "config" | "tests")[] | undefined;
    } | undefined;
    memory?: {
        backend?: "pr-ledger" | "local" | "none" | undefined;
    } | undefined;
    cache?: {
        enabled?: boolean | undefined;
        dir?: string | undefined;
    } | undefined;
    privacy?: {
        redactSecrets?: boolean | undefined;
        sendFullFiles?: boolean | undefined;
    } | undefined;
    platform?: {
        publish?: boolean | undefined;
        local?: {
            base?: string | undefined;
        } | undefined;
        github?: {
            owner?: string | undefined;
            repo?: string | undefined;
            tokenEnv?: string | undefined;
            apiBaseUrl?: string | undefined;
        } | undefined;
        provider?: "local" | "github" | "azure-devops" | undefined;
        azureDevops?: {
            status?: {
                enabled?: boolean | undefined;
                genre?: string | undefined;
                name?: string | undefined;
            } | undefined;
            tokenEnv?: string | undefined;
            organizationUrl?: string | undefined;
            project?: string | undefined;
            repository?: string | undefined;
            apiVersion?: string | undefined;
            vote?: {
                enabled?: boolean | undefined;
                mode?: "pipeline" | "immediate" | undefined;
                approveWithSuggestions?: boolean | undefined;
            } | undefined;
        } | undefined;
    } | undefined;
}>;
export type AirReviewConfig = z.output<typeof configSchema>;
export declare const CONFIG_FILE_NAMES: string[];
