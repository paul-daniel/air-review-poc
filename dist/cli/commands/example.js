import { ConfigError } from "../../errors.js";
import { PROVIDER_PRESETS, VISIBLE_PRESET_IDS } from "../../model/presets.js";
import { c } from "../output.js";
/**
 * `air-review example` prints copy-paste snippets. By default it shows a short
 * overview; details live behind a topic name so the CLI never dumps a wall of
 * text on someone who just needs the quickstart.
 */
export const EXAMPLE_TOPICS = [
    "providers",
    ...VISIBLE_PRESET_IDS,
    "ci-github",
    "ci-azure",
    "config",
    "local",
];
function heading(title, pointer) {
    return `\n${c.bold(title)}${pointer ? c.dim(`  (${pointer})`) : ""}\n`;
}
function providerOverview() {
    const rows = VISIBLE_PRESET_IDS.map((id) => {
        const preset = PROVIDER_PRESETS[id];
        return `${id.padEnd(18)}  ${(preset.baseUrl ?? "set endpoint.baseUrl").padEnd(58)}  ${preset.apiKeyEnv ?? "your key env"}`;
    }).join("\n");
    return [
        heading("Providers", "docs/providers.md"),
        "Pick a preset in air-review.yaml, or override everything from the environment:",
        "",
        "  provider: openai            # or azure-openai, bedrock, google, ...",
        "  endpoint:",
        "    baseUrl: https://api.openai.com/v1",
        "    apiKeyEnv: OPENAI_API_KEY",
        "",
        "  # same thing, no config file:",
        "  AIR_REVIEW_PROVIDER=google AIR_REVIEW_API_KEY=... air-review review --dry-run",
        "",
        `${"Preset".padEnd(18)}  ${"default base URL".padEnd(58)}  default key env`,
        rows,
        "",
        `Details for one provider: ${c.cyan("air-review example azure-openai")}`,
    ].join("\n");
}
function providerExample(id) {
    const preset = PROVIDER_PRESETS[id];
    const models = preset.models ?? { planner: "your-model", reviewer: "your-model", verifier: "your-model" };
    const lines = [
        heading(`${preset.label} (${id})`, preset.docsUrl),
        "air-review.yaml:",
        "",
        `  provider: ${id}`,
        "  endpoint:",
    ];
    if (preset.baseUrl && !preset.baseUrl.includes("<")) {
        lines.push(`    baseUrl: ${preset.baseUrl}`);
    }
    else {
        lines.push(`    baseUrl: ${preset.baseUrl ?? "https://your-endpoint"}`);
        if (preset.note)
            lines.push(`    # ${preset.note}`);
    }
    if (preset.apiKeyHeader !== "authorization" || preset.apiKeyPrefix !== "Bearer ") {
        lines.push(`    apiKeyHeader: ${preset.apiKeyHeader}`, `    apiKeyPrefix: "${preset.apiKeyPrefix}"`);
    }
    lines.push(`    apiKeyEnv: ${preset.apiKeyEnv ?? "YOUR_KEY_ENV"}`, "", "  models:", "    roles:", `      planner: ${models.planner}`, `      reviewer: ${models.reviewer}`, `      verifier: ${models.verifier}`, "", "Environment equivalent (no config file needed):", "", `  export AIR_REVIEW_PROVIDER=${id}`, `  export AIR_REVIEW_API_KEY=...        # or ${preset.apiKeyEnv ?? "your key env"}`, `  export AIR_REVIEW_MODEL_REVIEWER=${models.reviewer}`, "  air-review doctor", "  air-review review --dry-run");
    if (preset.note)
        lines.push("", c.dim(preset.note));
    return lines.join("\n");
}
function ciGithub() {
    return [
        heading("GitHub Actions", "docs/github-ci.md"),
        "1. Repository → Settings → Secrets and variables → Actions:",
        "",
        "   variable  AIR_REVIEW_PROVIDER      azure-openai",
        "   variable  AIR_REVIEW_BASE_URL      https://my-resource.openai.azure.com/openai/v1",
        "   secret    AIR_REVIEW_API_KEY       <provider key>",
        "   variable  AIR_REVIEW_MODEL_REVIEWER  my-reviewer-deployment",
        "",
        "2. Workflow step:",
        "",
        "   - name: Air Review",
        "     env:",
        "       GITHUB_TOKEN: ${{ github.token }}",
        "     run: air-review review --publish",
        "",
        "Nothing is installed in the job: the review is HTTP calls to your endpoint.",
    ].join("\n");
}
function ciAzure() {
    return [
        heading("Azure Pipelines (Azure Repos)", "docs/azure-devops.md"),
        "1. Pipelines → Library → Variable group (mark the key as secret):",
        "",
        "   AIR_REVIEW_PROVIDER, AIR_REVIEW_BASE_URL, AIR_REVIEW_MODEL_REVIEWER (variables)",
        "   AIR_REVIEW_API_KEY (secret)",
        "",
        "2. Project settings → Repositories → Security: give the build service identity",
        "   'Contribute to pull requests' (it posts the review threads).",
        "",
        "3. Pipeline steps (PR validation build; the adapter is auto-detected):",
        "",
        "   steps:",
        "     - checkout: self",
        "       fetchDepth: 0              # full history: the diff is computed locally",
        "       persistCredentials: true",
        "     - script: air-review review --publish",
        "       displayName: Air Review",
        "       env:",
        "         SYSTEM_ACCESSTOKEN: $(System.AccessToken)",
        "",
        "Review memory (state, summary, one thread per finding) lives in PR threads.",
        "Manual run with a PAT:",
        "",
        "   export SYSTEM_ACCESSTOKEN=<pat with Code read & write>",
        "   air-review review --ci azure-devops --org https://dev.azure.com/acme \\",
        "     --project Shop --repo storefront --pr 483 --dry-run",
        "",
        "Exit code 10 fails the job when the gate finds blocking findings.",
    ].join("\n");
}
function configExample() {
    return [
        heading("Configuration", "docs/configuration.md"),
        "Minimal file:",
        "",
        "  version: 1",
        "  provider: openai",
        "  models:",
        "    roles:",
        "      planner: gpt-4o-mini",
        "      reviewer: gpt-4.1",
        "      verifier: gpt-4o-mini",
        "  platform:",
        "    provider: github",
        "    publish: false",
        "",
        "Edit without hand-writing YAML:",
        "",
        "  air-review config set models.roles.reviewer mistral-large-latest",
        "  air-review config set review.gate.minimumConfidence 0.95",
        "  air-review config get models.roles.reviewer",
        "  air-review config list                 # effective config, secrets masked",
        "",
        "YAML, TOML and JSON are all read; env variables override the file.",
    ].join("\n");
}
function localExample() {
    return [
        heading("Local / any CI", "docs/commands.md"),
        "  air-review init --provider google",
        "  air-review doctor",
        "  air-review inspect --base origin/main          # what the tool sees, no model calls",
        "  air-review dry-run --base origin/main          # full review, nothing published",
        "  air-review review --base origin/main --publish # writes findings (local: .air-review/)",
        "",
        "Local mode diffs from the merge base of the target branch, so unrelated",
        "commits on main never show up as changes.",
    ].join("\n");
}
export function renderExamples(topic, all = false) {
    if (all) {
        return [
            providerOverview(),
            ...VISIBLE_PRESET_IDS.map(providerExample),
            ciGithub(),
            ciAzure(),
            configExample(),
            localExample(),
        ].join("\n");
    }
    if (!topic) {
        return [
            providerOverview(),
            "",
            c.dim(`Topics: ${EXAMPLE_TOPICS.join(", ")}`),
            c.dim("More in one go: air-review example --all"),
        ].join("\n");
    }
    if (topic === "providers")
        return providerOverview();
    if (topic === "ci-github")
        return ciGithub();
    if (topic === "ci-azure")
        return ciAzure();
    if (topic === "config")
        return configExample();
    if (topic === "local")
        return localExample();
    if (PROVIDER_PRESETS[topic] && !PROVIDER_PRESETS[topic].hidden)
        return providerExample(topic);
    throw new ConfigError(`Unknown example topic "${topic}". Available: ${EXAMPLE_TOPICS.join(", ")}.`);
}
//# sourceMappingURL=example.js.map