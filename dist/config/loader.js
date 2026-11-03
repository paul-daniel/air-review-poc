import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseDocument } from "yaml";
import { parse as parseToml } from "smol-toml";
import { ConfigError } from "../errors.js";
import { CONFIG_FILE_NAMES, configSchema } from "./schema.js";
import { defaultConfig } from "./defaults.js";
function readConfigFile(file) {
    let raw;
    try {
        raw = readFileSync(file, "utf8");
    }
    catch (error) {
        throw new ConfigError(`Cannot read config file "${file}": ${error.message}`, {
            cause: error,
        });
    }
    try {
        if (file.endsWith(".json")) {
            return JSON.parse(raw);
        }
        if (file.endsWith(".toml")) {
            return parseToml(raw);
        }
        const doc = parseDocument(raw, { prettyErrors: true });
        if (doc.errors.length > 0) {
            throw new Error(doc.errors.map((e) => e.message).join("; "));
        }
        return doc.toJS();
    }
    catch (error) {
        throw new ConfigError(`Invalid config file "${file}": ${error.message}`, {
            cause: error,
        });
    }
}
function discoverConfig(explicitPath) {
    if (explicitPath) {
        const absolute = resolve(explicitPath);
        if (!existsSync(absolute)) {
            throw new ConfigError(`Config file not found: ${explicitPath}`);
        }
        return absolute;
    }
    const envPath = process.env.AIR_REVIEW_CONFIG;
    if (envPath) {
        const absolute = resolve(envPath);
        if (!existsSync(absolute)) {
            throw new ConfigError(`Config file from AIR_REVIEW_CONFIG not found: ${envPath}`);
        }
        return absolute;
    }
    for (const name of CONFIG_FILE_NAMES) {
        if (existsSync(name))
            return resolve(name);
    }
    return null;
}
/**
 * Apply documented environment overrides on top of the file config:
 * AIR_REVIEW_PROVIDER, AIR_REVIEW_MODEL[_TRIAGE|_PLANNER|_REVIEWER|_VERIFIER],
 * AIR_REVIEW_MODEL_{REVIEWER,VERIFIER}_{LIGHT,HEAVY}, AIR_REVIEW_ROUTING_MODE,
 * AIR_REVIEW_BASE_URL, AIR_REVIEW_API_KEY, AIR_REVIEW_ACCESS_TOKEN, AIR_REVIEW_PRICING.
 */
export function applyEnvOverrides(config) {
    const next = structuredClone(config);
    if (process.env.AIR_REVIEW_PROVIDER) {
        next.provider = process.env.AIR_REVIEW_PROVIDER;
    }
    if (process.env.AIR_REVIEW_MODEL) {
        next.models.roles.reviewer = process.env.AIR_REVIEW_MODEL;
    }
    if (process.env.AIR_REVIEW_MODEL_TRIAGE)
        next.models.roles.triage = process.env.AIR_REVIEW_MODEL_TRIAGE;
    if (process.env.AIR_REVIEW_MODEL_PLANNER)
        next.models.roles.planner = process.env.AIR_REVIEW_MODEL_PLANNER;
    if (process.env.AIR_REVIEW_MODEL_REVIEWER) {
        next.models.roles.reviewer = process.env.AIR_REVIEW_MODEL_REVIEWER;
    }
    if (process.env.AIR_REVIEW_MODEL_VERIFIER) {
        next.models.roles.verifier = process.env.AIR_REVIEW_MODEL_VERIFIER;
    }
    // Complexity tiers: a cheap reviewer for light changes, a strong one for heavy pull requests.
    if (process.env.AIR_REVIEW_MODEL_REVIEWER_LIGHT) {
        next.models.tiers.light.reviewer = process.env.AIR_REVIEW_MODEL_REVIEWER_LIGHT;
    }
    if (process.env.AIR_REVIEW_MODEL_VERIFIER_LIGHT) {
        next.models.tiers.light.verifier = process.env.AIR_REVIEW_MODEL_VERIFIER_LIGHT;
    }
    if (process.env.AIR_REVIEW_MODEL_REVIEWER_HEAVY) {
        next.models.tiers.heavy.reviewer = process.env.AIR_REVIEW_MODEL_REVIEWER_HEAVY;
    }
    if (process.env.AIR_REVIEW_MODEL_VERIFIER_HEAVY) {
        next.models.tiers.heavy.verifier = process.env.AIR_REVIEW_MODEL_VERIFIER_HEAVY;
    }
    if (process.env.AIR_REVIEW_ROUTING_MODE) {
        next.routing.mode = process.env.AIR_REVIEW_ROUTING_MODE;
    }
    if (process.env.AIR_REVIEW_BASE_URL)
        next.endpoint.baseUrl = process.env.AIR_REVIEW_BASE_URL;
    // apiKeyEnv is also what `doctor` reports as the credential's source, so keep it truthful.
    if (process.env.AIR_REVIEW_API_KEY) {
        next.endpoint.apiKey = process.env.AIR_REVIEW_API_KEY;
        next.endpoint.apiKeyEnv = "AIR_REVIEW_API_KEY";
    }
    if (process.env.AIR_REVIEW_API_KEY_ENV)
        next.endpoint.apiKeyEnv = process.env.AIR_REVIEW_API_KEY_ENV;
    // A short-lived access token (Microsoft Entra ID, OAuth gateways) is sent as a bearer token.
    if (process.env.AIR_REVIEW_ACCESS_TOKEN) {
        next.endpoint.apiKey = process.env.AIR_REVIEW_ACCESS_TOKEN;
        next.endpoint.apiKeyEnv = "AIR_REVIEW_ACCESS_TOKEN";
        next.endpoint.auth = "bearer";
    }
    if (process.env.AIR_REVIEW_AUTH) {
        next.endpoint.auth = process.env.AIR_REVIEW_AUTH;
    }
    if (process.env.AIR_REVIEW_API)
        next.endpoint.api = process.env.AIR_REVIEW_API;
    if (process.env.AIR_REVIEW_MAX_TOKENS_PARAMETER) {
        next.endpoint.maxTokensParameter = process.env
            .AIR_REVIEW_MAX_TOKENS_PARAMETER;
    }
    if (process.env.AIR_REVIEW_PRICING) {
        try {
            next.telemetry.pricing = JSON.parse(process.env.AIR_REVIEW_PRICING);
        }
        catch {
            throw new ConfigError("AIR_REVIEW_PRICING must be a JSON object of model prices in USD per million tokens.");
        }
    }
    const checked = configSchema.safeParse(next);
    if (!checked.success) {
        throw new ConfigError(`Invalid environment configuration: ${checked.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    }
    return checked.data;
}
export function loadConfig(explicitPath) {
    const path = discoverConfig(explicitPath);
    if (!path)
        return { config: applyEnvOverrides(defaultConfig()), path: null };
    const raw = readConfigFile(path);
    const parsed = configSchema.safeParse(raw);
    if (!parsed.success) {
        const issues = parsed.error.issues
            .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
            .join("\n");
        throw new ConfigError(`Invalid configuration in "${path}":\n${issues}`);
    }
    return { config: applyEnvOverrides(parsed.data), path };
}
//# sourceMappingURL=loader.js.map