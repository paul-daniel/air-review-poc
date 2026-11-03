import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConfigError } from "../../errors.js";
import { PROVIDER_PRESETS, VISIBLE_PRESET_IDS } from "../../model/presets.js";
import { c } from "../output.js";
const GENERIC_MODELS = {
    planner: "your-small-model",
    reviewer: "your-strong-model",
    verifier: "your-small-model",
};
export function renderInitConfig(options) {
    const preset = PROVIDER_PRESETS[options.provider];
    if (!preset) {
        throw new ConfigError(`Unknown provider "${options.provider}". Available: ${VISIBLE_PRESET_IDS.join(", ")}.`);
    }
    const suggested = preset.models ?? GENERIC_MODELS;
    const frameworks = options.frameworks
        .split(",")
        .map((framework) => framework.trim())
        .filter(Boolean)
        .map((framework) => `  - ${framework}`)
        .join("\n");
    const modelsBlock = [
        "models:",
        "  # Role names are what the engine consumes; point them at models your",
        "  # provider offers (or at deployment names for Azure).",
        `  default: ${options.model ?? suggested.reviewer}`,
        "  roles:",
        `    triage: ${options.plannerModel ?? suggested.triage ?? suggested.planner}`,
        `    planner: ${options.plannerModel ?? suggested.planner}`,
        `    reviewer: ${options.model ?? suggested.reviewer}`,
        `    verifier: ${options.verifierModel ?? suggested.verifier}`,
        "  # Complexity tiers (see routing below): a cheaper reviewer for light changes,",
        "  # a stronger one for heavy pull requests. Unset tiers use the standard role model.",
        "  tiers:",
        "    light:",
        `      reviewer: ${options.verifierModel ?? suggested.verifier}`,
        "    heavy:",
        `      reviewer: ${options.model ?? suggested.reviewer}`,
        "",
        "# Routing by complexity: deterministic thresholds decide the clear cases and the",
        "# triage model is consulted for the ambiguous middle band (mode: hybrid).",
        "routing:",
        "  enabled: true",
        "  mode: hybrid",
        "  light: { maxFiles: 3, maxLines: 150 }",
        "  heavy: { minFiles: 10, minLines: 400, minModules: 3 }",
    ].join("\n");
    const endpointLines = ["endpoint:"];
    const baseUrl = options.baseUrl ?? preset.baseUrl;
    if (baseUrl && !baseUrl.includes("<")) {
        endpointLines.push(`  baseUrl: ${baseUrl}`);
    }
    else {
        endpointLines.push(`  # ${preset.label} needs your endpoint URL.`, `  # baseUrl: ${baseUrl ?? "https://your-endpoint"}`);
        if (preset.note)
            endpointLines.push(`  # ${preset.note}`);
    }
    endpointLines.push(preset.apiKeyEnv ? `  apiKeyEnv: ${preset.apiKeyEnv}` : "  # apiKeyEnv: YOUR_PROVIDER_KEY_ENV");
    if (preset.apiKeyHeader !== "authorization" || preset.apiKeyPrefix !== "Bearer ") {
        endpointLines.push(`  apiKeyHeader: ${preset.apiKeyHeader}`, `  apiKeyPrefix: "${preset.apiKeyPrefix}"`);
    }
    if (options.provider === "azure-openai" || options.provider === "azure-foundry") {
        endpointLines.push("  # chatPath: /chat/completions?api-version=<version>   # if your deployment needs it");
    }
    endpointLines.push("  timeoutMs: 120000");
    const endpointBlock = endpointLines.join("\n");
    const platformBlock = options.ci === "github"
        ? [
            "platform:",
            "  provider: github",
            "  # Set to true to publish comments automatically in CI.",
            "  publish: false",
            "  github:",
            "    tokenEnv: GITHUB_TOKEN",
            "  local:",
            `    base: ${options.base ?? "origin/main"}`,
        ].join("\n")
        : options.ci === "azure-devops"
            ? [
                "platform:",
                "  provider: azure-devops",
                "  # Set to true to publish threads automatically in the PR validation build.",
                "  publish: false",
                "  azureDevops:",
                "    # Organization, project and repository are read from the Azure Pipelines",
                "    # variables when omitted; set them for manual runs with a PAT.",
                "    # organizationUrl: https://dev.azure.com/acme",
                "    # project: Shop",
                "    # repository: storefront",
                "    tokenEnv: SYSTEM_ACCESSTOKEN",
                "  local:",
                `    base: ${options.base ?? "origin/main"}`,
            ].join("\n")
            : [
                "platform:",
                "  provider: local",
                "  publish: false",
                "  local:",
                `    base: ${options.base ?? "origin/main"}`,
            ].join("\n");
    return `# air-review configuration
# Every option has a default; this file only pins the choices for this project.
# Full reference: docs/configuration.md

version: 1

# Language/framework analyzers to enable. The MVP ships the angular pack.
frameworks:
${frameworks}

# Model backend preset. Other options: ${VISIBLE_PRESET_IDS.join(", ")}.
provider: ${options.provider}

${endpointBlock}

${modelsBlock}

context:
  strategy: structural-selective
  semanticFallback: false
  maxContextRequests: 20
  maxEvidenceTokens: 30000

review:
  severities:
    publish: [BLOCKER, CRITICAL, MAJOR, MINOR]
  gate:
    severities: [BLOCKER, CRITICAL]
    minimumConfidence: 0.6
  maxFindings: 40

memory:
  # pr-ledger keeps review state in PR comments; "local" keeps it in .air-review/.
  backend: pr-ledger

cache:
  enabled: true
  dir: .air-review/cache

telemetry:
  enabled: true
  log: .air-review/telemetry.jsonl
  # Optional prices in USD per 1M tokens, used for the cost estimate:
  # pricing:
  #   ${options.model ?? suggested.reviewer}:
  #     input: 1
  #     output: 4

privacy:
  redactSecrets: true
  sendFullFiles: false

${platformBlock}
`;
}
export function runInit(options) {
    const preset = PROVIDER_PRESETS[options.provider];
    if (!preset || preset.hidden) {
        throw new ConfigError(`Unsupported provider "${options.provider}". Available providers: ${VISIBLE_PRESET_IDS.join(", ")}.`);
    }
    const baseUrl = options.baseUrl ?? preset.baseUrl;
    if (!baseUrl || baseUrl.includes("<")) {
        throw new ConfigError(`Provider "${options.provider}" needs --base-url <your endpoint URL>. ${preset.note ?? ""}`.trim());
    }
    const target = resolve(options.config ?? "air-review.yaml");
    if (existsSync(target) && !options.force) {
        throw new ConfigError(`Config file already exists: ${target}. Use --force to overwrite it.`);
    }
    writeFileSync(target, renderInitConfig(options));
    ensureGitignored();
    process.stdout.write(`${c.green("created")} ${target}\n\n`);
    process.stdout.write(`Next steps:\n`);
    process.stdout.write(`  1. Export the key:       ${preset.apiKeyEnv ? `export ${preset.apiKeyEnv}=...` : "export YOUR_PROVIDER_KEY_ENV=..."}\n`);
    process.stdout.write(`  2. Adjust the models:    air-review config set models.roles.reviewer <model>\n`);
    process.stdout.write(`  3. Check your setup:     air-review doctor\n`);
    process.stdout.write(`  4. Review this branch:   air-review review --dry-run\n`);
    process.stdout.write(`  5. Publish findings:     air-review review --publish\n`);
}
function ensureGitignored() {
    const gitignore = resolve(".gitignore");
    const entry = ".air-review/";
    try {
        if (existsSync(gitignore) && readFileSync(gitignore, "utf8").split("\n").includes(entry)) {
            return;
        }
        appendFileSync(gitignore, existsSync(gitignore) ? `\n${entry}\n` : `${entry}\n`);
        process.stdout.write(`${c.dim("updated")} .gitignore (added ${entry})\n`);
    }
    catch {
        /* .gitignore is optional */
    }
}
//# sourceMappingURL=init.js.map