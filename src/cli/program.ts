import { Command, Option } from "commander";
import { VERSION } from "../version.js";
import { EXIT } from "../errors.js";
import { loadConfig } from "../config/index.js";
import { resolveEndpoint } from "../model/resolve.js";
import { buildContext } from "./context.js";
import { runCatching } from "./run.js";
import { c, printBanner } from "./output.js";
import { runInit } from "./commands/init.js";
import { runDoctor } from "./commands/doctor.js";
import { runModels } from "./commands/models.js";
import { runReviewCommand } from "./commands/review.js";
import { runInspect } from "./commands/inspect.js";
import { runExplain } from "./commands/explain.js";
import { runCacheStats, runCachePrune } from "./commands/cache.js";
import { runConfigGet, runConfigList, runConfigSet, runConfigUnset } from "./commands/config.js";
import { renderExamples, EXAMPLE_TOPICS } from "./commands/example.js";
import { runTelemetry } from "./commands/telemetry.js";
import { CI_MODES, type CiMode } from "../scm/detect.js";

function examples(lines: string[]): string {
  return `\nExamples:\n${lines.map((line) => `  ${line}`).join("\n")}\n`;
}

function configPath(program: Command): string | undefined {
  return program.optsWithGlobals().config as string | undefined;
}

async function reviewFlow(
  program: Command,
  options: Record<string, unknown>,
  forceDryRun: boolean,
): Promise<void> {
  const overrides = {
    model: options.model as string | undefined,
    triage: options.triageModel as string | undefined,
    planner: options.plannerModel as string | undefined,
    reviewer: options.reviewerModel as string | undefined,
    verifier: options.verifierModel as string | undefined,
  };
  const ctx = await buildContext({
    configPath: configPath(program),
    requireModels: !options.deterministicOnly,
    ci: options.ci as CiMode,
    owner: options.owner as string | undefined,
    repo: options.repo as string | undefined,
    pr: options.pr ? Number(options.pr) : undefined,
    base: options.base as string | undefined,
    org: options.org as string | undefined,
    project: options.project as string | undefined,
    modelOverrides: overrides,
  });
  const code = await runReviewCommand(ctx, {
    ci: options.ci as CiMode,
    publish: options.publish ? true : undefined,
    dryRun: forceDryRun || Boolean(options.dryRun),
    force: Boolean(options.force),
    deterministicOnly: Boolean(options.deterministicOnly),
    noVerifier: options.verifier === false,
    noCache: options.cache === false,
    tier: options.tier as "light" | "standard" | "heavy" | undefined,
    base: options.base as string | undefined,
    owner: options.owner as string | undefined,
    repo: options.repo as string | undefined,
    pr: options.pr ? Number(options.pr) : undefined,
    org: options.org as string | undefined,
    project: options.project as string | undefined,
    modelOverrides: overrides,
    json: Boolean(options.json),
  });
  process.exitCode = code;
}

/** `--ci`, `--base` and the pull-request locators shared by review, dry-run and inspect. */
function addScmOptions(command: Command): Command {
  return command
    .addOption(
      new Option("--ci <mode>", "auto, github, azure-devops or local").choices([...CI_MODES]).default("auto"),
    )
    .option("--base <ref>", "local mode base ref (default: platform.local.base)")
    .option("--owner <owner>", "GitHub owner (with --ci github)")
    .option("--org <url>", "Azure DevOps organization URL (with --ci azure-devops)")
    .option("--project <name>", "Azure DevOps project (with --ci azure-devops)")
    .option("--repo <repo>", "repository: GitHub name, or Azure Repos name/GUID")
    .option("--pr <number>", "pull request number (GitHub) or id (Azure DevOps)");
}

function addReviewOptions(command: Command): Command {
  return addScmOptions(command)
    .option("--model <model>", "override the reviewer model")
    .option("--triage-model <model>", "override the triage model")
    .option("--planner-model <model>", "override the planner model")
    .option("--reviewer-model <model>", "override the reviewer model")
    .option("--verifier-model <model>", "override the verifier model")
    .addOption(
      new Option("--tier <tier>", "force the complexity tier instead of letting triage decide").choices([
        "light",
        "standard",
        "heavy",
      ]),
    )
    .option("--deterministic-only", "run structural rules without any model call")
    .option("--no-verifier", "skip the LLM verification pass (deterministic checks stay)")
    .option("--no-cache", "disable the local result cache")
    .option("--force", "re-review even if the head was already reviewed")
    .option("--json", "machine-readable output");
}

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("air-review")
    .description(
      "Contextual AI code review. Understands each change, gathers only the evidence " +
        "it needs, verifies findings before publishing, and remembers what it already reviewed.",
    )
    .version(VERSION)
    .option("--config <file>", "path to the config file (default: air-review.yaml)")
    .option("--plain", "plain ASCII output for CI logs (no colors or animation)")
    .addOption(
      new Option("--color [mode]", "terminal color policy")
        .choices(["auto", "always", "never"])
        .preset("always")
        .default("always"),
    )
    .option("--ascii", "use ASCII gutters and separators without animation")
    .option("--no-color", "disable colored output")
    .option("--no-animation", "disable progress animation and report reveal")
    .configureHelp({ sortSubcommands: true })
    .showSuggestionAfterError()
    .showHelpAfterError("(run with --help for usage)")
    .helpCommand(true)
    .addHelpText(
      "after",
      [
        "",
        "Common flows:",
        "  air-review example                       copy-paste snippets (providers, CI, config)",
        "  air-review init --provider bedrock       write a provider-ready config",
        "  air-review doctor                        check config, key, endpoint, git, SCM",
        "  air-review inspect --base origin/main    what the tool sees, without model calls",
        "  air-review dry-run --base origin/main    full review, nothing published",
        "  air-review review --publish              review and publish to the pull request",
        "",
        "Docs: README.md · docs/commands.md · docs/providers.md · docs/configuration.md",
        "Exit codes: 0 ok · 10 gate failed · 20 config · 30 model · 40 scm · 50 internal",
        "Reports: .air-review/reports/<run>.md (cost per step, routing, workflow diagram)",
      ].join("\n"),
    );

  program
    .command("init")
    .description("Create an air-review.yaml config for this project")
    .option("--provider <name>", "provider preset (see: air-review example providers)", "openai")
    .option("--base-url <url>", "endpoint URL (required for placeholder presets)")
    .option("--framework <list>", "comma-separated frameworks", "angular")
    .addOption(
      new Option("--ci <mode>", "github, azure-devops or local")
        .choices(["github", "azure-devops", "local"])
        .default("local"),
    )
    .option("--model <model>", "default model (also used as reviewer)")
    .option("--planner-model <model>", "planner role model")
    .option("--verifier-model <model>", "verifier role model")
    .option("--base <ref>", "local mode base ref", "origin/main")
    .option("--force", "overwrite an existing config file")
    .addHelpText(
      "after",
      examples([
        "air-review init",
        "air-review init --provider azure-openai --base-url https://my-res.openai.azure.com/openai/v1",
        "air-review init --provider google --ci github",
        "air-review init --provider azure-openai --base-url https://my-res.openai.azure.com/openai/v1 --ci azure-devops",
      ]),
    )
    .action(
      runCatching(async (options: Record<string, unknown>) => {
        await printBanner(undefined, { force: false });
        runInit({
          config: configPath(program),
          provider: String(options.provider ?? "openai"),
          baseUrl: options.baseUrl as string | undefined,
          frameworks: String(options.framework ?? "angular"),
          ci: (options.ci as "github" | "azure-devops" | "local") ?? "local",
          model: options.model as string | undefined,
          plannerModel: options.plannerModel as string | undefined,
          verifierModel: options.verifierModel as string | undefined,
          base: options.base as string | undefined,
          force: Boolean(options.force),
        });
      }),
    );

  program
    .command("doctor")
    .description("Check config, key, endpoint, models, git and SCM access")
    .option("--json", "machine-readable output")
    .addHelpText("after", examples(["air-review doctor", "air-review doctor --json"]))
    .action(
      runCatching(async (options: Record<string, unknown>) => {
        const ctx = await buildContext({ configPath: configPath(program), requireModels: false });
        process.exitCode = await runDoctor(ctx, Boolean(options.json));
      }),
    );

  program
    .command("models")
    .description("List models the configured endpoint offers, and which roles use them")
    .option("--json", "machine-readable output")
    .addHelpText("after", examples(["air-review models", "air-review models --json"]))
    .action(
      runCatching(async (options: Record<string, unknown>) => {
        const ctx = await buildContext({ configPath: configPath(program), requireModels: false });
        const endpoint = resolveEndpoint(ctx.config);
        await runModels(ctx.provider, ctx.models, Boolean(options.json), {
          listModels: endpoint.listModels,
        });
      }),
    );

  addReviewOptions(
    program
      .command("review")
      .description("Review the pull request or branch and optionally publish findings")
      .option("--publish", "publish findings as PR comments (or set platform.publish)")
      .option("--dry-run", "never publish, even if the config says publish"),
  )
    .addHelpText(
      "after",
      examples([
        "air-review review --dry-run --base origin/main",
        "air-review review --publish",
        "air-review review --ci github --owner acme --repo storefront --pr 483 --dry-run",
        "air-review review --ci azure-devops --org https://dev.azure.com/acme --project Shop --repo storefront --pr 483 --dry-run",
        "air-review review --deterministic-only --json",
      ]),
    )
    .action(
      runCatching(async (options: Record<string, unknown>) => {
        await reviewFlow(program, options, false);
      }),
    );

  addReviewOptions(
    program.command("dry-run").description("Shortcut for: review --dry-run (nothing is ever published)"),
  )
    .addHelpText(
      "after",
      examples([
        "air-review dry-run",
        "air-review dry-run --base origin/main",
        "air-review dry-run --model gpt-4.1 --json",
      ]),
    )
    .action(
      runCatching(async (options: Record<string, unknown>) => {
        await reviewFlow(program, options, true);
      }),
    );

  addScmOptions(
    program
      .command("inspect")
      .description("Show the PR, structural facts and conventions without calling a model"),
  )
    .option("--diff", "also print the raw diff")
    .option("--json", "machine-readable output")
    .addHelpText(
      "after",
      examples([
        "air-review inspect --base origin/main",
        "air-review inspect --ci github --owner acme --repo storefront --pr 483",
        "air-review inspect --ci azure-devops --org https://dev.azure.com/acme --project Shop --repo storefront --pr 483",
        "air-review inspect --diff",
      ]),
    )
    .action(
      runCatching(async (options: Record<string, unknown>) => {
        const ctx = await buildContext({
          configPath: configPath(program),
          requireModels: false,
          ci: options.ci as CiMode,
          owner: options.owner as string | undefined,
          repo: options.repo as string | undefined,
          pr: options.pr ? Number(options.pr) : undefined,
          base: options.base as string | undefined,
          org: options.org as string | undefined,
          project: options.project as string | undefined,
        });
        await runInspect(ctx, { diff: Boolean(options.diff), json: Boolean(options.json) });
      }),
    );

  program
    .command("explain")
    .description("List stored findings, or show the full evidence for one")
    .argument("[finding-id]", "finding id, e.g. arf_7d0b9f (omit to list all)")
    .option("--json", "machine-readable output")
    .addHelpText("after", examples(["air-review explain", "air-review explain arf_7d0b9f"]))
    .action(
      runCatching(async (id: string | undefined, options: Record<string, unknown>) => {
        const ctx = await buildContext({ configPath: configPath(program), requireModels: false });
        await runExplain(ctx, id, Boolean(options.json));
      }),
    );

  program
    .command("example")
    .description("Print copy-paste examples (providers, CI, config, local flows)")
    .argument("[topic]", `one of: ${EXAMPLE_TOPICS.join(", ")}`)
    .option("--all", "print every topic")
    .addHelpText(
      "after",
      examples([
        "air-review example",
        "air-review example azure-openai",
        "air-review example ci-github",
        "air-review example --all",
      ]),
    )
    .action(
      runCatching((topic: string | undefined, options: Record<string, unknown>) => {
        process.stdout.write(`${renderExamples(topic, Boolean(options.all))}\n`);
      }),
    );

  program
    .command("telemetry")
    .description("Show the recent local runs recorded in the telemetry log")
    .option("--last <n>", "how many runs to show", "10")
    .option("--json", "machine-readable output")
    .addHelpText("after", examples(["air-review telemetry", "air-review telemetry --last 50"]))
    .action(
      runCatching(async (options: Record<string, unknown>) => {
        const loaded = loadConfig(configPath(program));
        runTelemetry(loaded.config.telemetry.log, {
          last: Number(options.last ?? 10),
          json: Boolean(options.json),
        });
      }),
    );

  const cacheCommand = program
    .command("cache")
    .description("Inspect or prune the local content-addressed cache")
    .addHelpText("after", examples(["air-review cache", "air-review cache prune --older-than 24"]))
    .action(
      runCatching(async () => {
        const ctx = await buildContext({ configPath: configPath(program), requireModels: false });
        runCacheStats(ctx.cache, false);
      }),
    );

  cacheCommand
    .command("stats")
    .description("Show cache size and entry kinds")
    .option("--json", "machine-readable output")
    .action(
      runCatching(async (options: Record<string, unknown>) => {
        const ctx = await buildContext({ configPath: configPath(program), requireModels: false });
        runCacheStats(ctx.cache, Boolean(options.json));
      }),
    );

  cacheCommand
    .command("prune")
    .description("Remove cache entries")
    .option("--older-than <hours>", "remove entries older than N hours", (value) => Number(value))
    .option("--kind <kind>", "remove only entries of this kind")
    .addHelpText(
      "after",
      examples([
        "air-review cache prune",
        "air-review cache prune --older-than 24",
        "air-review cache prune --kind review",
      ]),
    )
    .action(
      runCatching(async (options: Record<string, unknown>) => {
        const ctx = await buildContext({ configPath: configPath(program), requireModels: false });
        runCachePrune(ctx.cache, {
          olderThanHours: options.olderThan as number | undefined,
          kind: options.kind as string | undefined,
        });
      }),
    );

  const configCommand = program
    .command("config")
    .description("Read or edit configuration (values are dotted paths)")
    .option("--json", "machine-readable output")
    .addHelpText(
      "after",
      examples([
        "air-review config                     effective config, secrets masked",
        "air-review config get models.roles.reviewer",
        "air-review config set models.roles.reviewer mistral-large-latest",
      ]),
    )
    .action(
      runCatching(async (options: Record<string, unknown>) => {
        const loaded = loadConfig(configPath(program));
        runConfigList(loaded.config, loaded.path, Boolean(options.json));
      }),
    );

  configCommand
    .command("list")
    .description("Print the effective config with secrets masked")
    .option("--json", "machine-readable output")
    .action(
      runCatching(async (options: Record<string, unknown>) => {
        const loaded = loadConfig(configPath(program));
        runConfigList(loaded.config, loaded.path, Boolean(options.json));
      }),
    );

  configCommand
    .command("get")
    .description("Print one config value")
    .argument("<path>", "dotted path, e.g. models.roles.reviewer")
    .action(
      runCatching(async (path: string) => {
        runConfigGet(path, configPath(program));
      }),
    );

  configCommand
    .command("set")
    .description("Set one config value (YAML comments are preserved)")
    .argument("<path>", "dotted path, e.g. models.roles.reviewer")
    .argument("<value>", "new value (booleans and numbers are coerced)")
    .addHelpText(
      "after",
      examples([
        "air-review config set models.roles.reviewer gpt-4.1",
        "air-review config set provider bedrock",
        "air-review config set review.gate.minimumConfidence 0.95",
      ]),
    )
    .action(
      runCatching(async (path: string, value: string) => {
        runConfigSet(path, value, configPath(program));
      }),
    );

  configCommand
    .command("unset")
    .description("Remove one config key")
    .argument("<path>", "dotted path, e.g. models.roles.planner")
    .action(
      runCatching(async (path: string) => {
        runConfigUnset(path, configPath(program));
      }),
    );

  return program;
}

/** Shared error rendering for the entry point. */
export function handleProgramError(error: unknown): void {
  process.stderr.write(`${c.red("error")}: ${(error as Error).message}\n`);
  process.exitCode = EXIT.ENGINE;
}
