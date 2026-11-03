import { existsSync } from "node:fs";
import { EXIT } from "../../errors.js";
import { printJson, printTable, printBanner, c } from "../output.js";
import { resolveEndpoint } from "../../model/resolve.js";
import { probeModels } from "../../model/probe.js";
import { FoundryProvider } from "../../model/foundry.js";
import { FoundryAgentProvider } from "../../model/foundry-agent.js";
import { azureDevOpsToken } from "../../scm/detect.js";
export async function runDoctor(ctx, json) {
    const checks = [];
    checks.push({
        name: "config",
        status: "ok",
        detail: ctx.configPath
            ? `loaded ${ctx.configPath}`
            : "using built-in defaults (no air-review.yaml found)",
    });
    // Frameworks
    const unsupported = ctx.config.frameworks.filter((f) => f !== "angular");
    checks.push(unsupported.length === 0
        ? { name: "frameworks", status: "ok", detail: ctx.config.frameworks.join(", ") }
        : {
            name: "frameworks",
            status: "warn",
            detail: `unsupported: ${unsupported.join(", ")} (MVP ships angular)`,
        });
    // Model roles
    const missingRoles = Object.entries(ctx.models)
        .filter(([, model]) => !model)
        .map(([role]) => role);
    checks.push(missingRoles.length === 0
        ? {
            name: "model roles",
            status: "ok",
            detail: Object.entries(ctx.models)
                .map(([role, model]) => `${role}=${model}`)
                .join(", "),
        }
        : {
            name: "model roles",
            status: "error",
            detail: `no model for: ${missingRoles.join(", ")} — set models.default or models.roles`,
            exit: EXIT.CONFIG,
        });
    // Endpoint resolution (preset + overrides) and key presence
    let endpoint = null;
    let foundryKeyless = false;
    try {
        endpoint = resolveEndpoint(ctx.config);
        checks.push({
            name: "endpoint",
            status: "ok",
            detail: `${endpoint.preset.label} · ${endpoint.baseUrl}`,
        });
        const foundry = ctx.provider instanceof FoundryProvider || ctx.provider instanceof FoundryAgentProvider
            ? ctx.provider
            : null;
        if (foundry) {
            // Microsoft Foundry: key, provided token, or keyless Entra ID through the official SDKs.
            try {
                const credential = await foundry.credential();
                checks.push({ name: "credential", status: "ok", detail: credential.description });
                foundryKeyless = credential.kind === "entra-id";
            }
            catch (error) {
                checks.push({
                    name: "credential",
                    status: "error",
                    detail: error.message,
                    exit: EXIT.MODEL,
                });
            }
        }
        else {
            checks.push(endpoint.apiKey
                ? {
                    name: "credential",
                    status: "ok",
                    detail: `${endpoint.apiKeyEnv ? `found in ${endpoint.apiKeyEnv}` : "configured inline"} · sent as ${endpoint.apiKeyHeader === "authorization"
                        ? "Authorization: Bearer"
                        : `${endpoint.apiKeyHeader} header`}`,
                }
                : {
                    name: "api key",
                    status: "warn",
                    detail: endpoint.apiKeyEnv
                        ? `no value in ${endpoint.apiKeyEnv}; requests may be rejected by the provider`
                        : "no API key configured; requests may be rejected by the provider",
                });
        }
    }
    catch (error) {
        checks.push({
            name: "endpoint",
            status: "error",
            detail: error.message,
            exit: EXIT.CONFIG,
        });
    }
    // Provider reachability + model availability. Endpoints without a /models
    // route (Azure) are probed with one minimal request per distinct deployment:
    // that is the only way to prove the key, the URL and the deployment names.
    if (endpoint && !endpoint.listModels) {
        const deployments = [...new Set(Object.values(ctx.models).filter((m) => Boolean(m)))];
        if (!endpoint.apiKey && !foundryKeyless) {
            checks.push({
                name: ctx.provider.id,
                status: "warn",
                detail: "no model listing on this endpoint and no credential found; probe skipped",
            });
        }
        else if (deployments.length === 0) {
            checks.push({
                name: ctx.provider.id,
                status: "warn",
                detail: "no role models configured; nothing to probe",
            });
        }
        else {
            const probes = await probeModels(ctx.provider, deployments);
            const failed = probes.filter((probe) => !probe.ok);
            const tokens = probes.reduce((sum, probe) => sum + (probe.inputTokens ?? 0) + (probe.outputTokens ?? 0), 0);
            checks.push(failed.length === 0
                ? {
                    name: ctx.provider.id,
                    status: "ok",
                    detail: `probed ${probes.length} deployment(s): ${probes.map((p) => `${p.model} ${p.durationMs} ms${p.note ? " (reasoning)" : ""}`).join(", ")} · ~${tokens} tokens`,
                }
                : {
                    name: ctx.provider.id,
                    status: "error",
                    detail: failed.map((p) => `${p.model}: ${p.error}`).join(" | "),
                    exit: EXIT.MODEL,
                });
        }
    }
    else if (endpoint) {
        try {
            const available = (await ctx.provider.listModels()).map((m) => m.name);
            checks.push({
                name: ctx.provider.id,
                status: "ok",
                detail: `reachable, ${available.length} model(s) available`,
            });
            const configured = [...new Set(Object.values(ctx.models).filter((m) => Boolean(m)))];
            const missing = configured.filter((model) => !available.includes(model) && !model.includes("/"));
            checks.push(missing.length === 0
                ? { name: "models present", status: "ok", detail: "all role models are available" }
                : {
                    name: "models present",
                    status: "error",
                    detail: `missing: ${missing.join(", ")} — pull them first`,
                    exit: EXIT.MODEL,
                });
        }
        catch (error) {
            checks.push({
                name: ctx.provider.id,
                status: "error",
                detail: error.message,
                exit: EXIT.MODEL,
            });
        }
    }
    // Git
    checks.push({
        name: "git",
        status: "ok",
        detail: ctx.git.root,
    });
    // SCM
    if (ctx.scm.kind === "github") {
        const tokenEnv = ctx.config.platform.github.tokenEnv ?? "GITHUB_TOKEN";
        const hasToken = Boolean(process.env[tokenEnv] ?? process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN);
        checks.push(hasToken
            ? { name: "github token", status: "ok", detail: `found in ${tokenEnv}` }
            : ctx.config.platform.publish
                ? {
                    name: "github token",
                    status: "error",
                    detail: `platform.publish is true but no token in ${tokenEnv}, GH_TOKEN or GITHUB_TOKEN`,
                    exit: EXIT.SCM,
                }
                : {
                    name: "github token",
                    status: "warn",
                    detail: "no token — reads use the unauthenticated GitHub API (60 req/h); publishing is disabled",
                });
    }
    else if (ctx.scm.kind === "azure-devops") {
        const { token, source, checked } = azureDevOpsToken(ctx.config);
        checks.push(token
            ? { name: "azure devops token", status: "ok", detail: `found in ${source}` }
            : {
                name: "azure devops token",
                status: "error",
                detail: `no token in ${checked.join(", ")} — Azure DevOps rejects unauthenticated calls; ` +
                    `pass $(System.AccessToken) as SYSTEM_ACCESSTOKEN in the pipeline, or a PAT for manual runs`,
                exit: EXIT.SCM,
            });
    }
    else {
        checks.push({ name: "scm", status: "ok", detail: "local git adapter" });
    }
    // Cache dir
    try {
        if (ctx.config.cache.enabled && !existsSync(ctx.config.cache.dir)) {
            checks.push({
                name: "cache",
                status: "ok",
                detail: `enabled (${ctx.config.cache.dir} will be created on first use)`,
            });
        }
        else {
            checks.push({
                name: "cache",
                status: ctx.config.cache.enabled ? "ok" : "warn",
                detail: ctx.config.cache.enabled ? ctx.config.cache.dir : "disabled",
            });
        }
    }
    catch {
        checks.push({ name: "cache", status: "warn", detail: "could not inspect cache dir" });
    }
    if (json) {
        printJson({
            ok: checks.every((check) => check.status !== "error"),
            checks,
        });
    }
    else {
        await printBanner(`doctor · ${ctx.provider.id} · ${ctx.models.reviewer ?? "no reviewer model"}`);
        printTable(["check", "status", "detail"], checks.map((check) => [
            check.name,
            check.status === "ok" ? c.green("ok") : check.status === "warn" ? c.yellow("warn") : c.red("error"),
            check.detail,
        ]));
    }
    const failed = checks.find((check) => check.status === "error");
    if (failed?.exit) {
        if (!json) {
            process.stdout.write(`\n${c.red("failed")}: ${failed.name} — ${failed.detail}\n`);
        }
        return failed.exit;
    }
    return EXIT.OK;
}
//# sourceMappingURL=doctor.js.map