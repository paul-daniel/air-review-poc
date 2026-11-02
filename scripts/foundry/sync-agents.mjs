#!/usr/bin/env node
/**
 * Create or update the air-review prompt agents in a Microsoft Foundry project.
 *
 * One Foundry Agent Service "prompt agent" per air-review role, each carrying
 * the role's instructions and the deployed model it should run on:
 *
 *   air-review-triage           (--cheap)      decides the complexity tier
 *   air-review-reviewer         (--reviewer)   standard-tier reviewer
 *   air-review-reviewer-light   (--light)      light-tier reviewer (cheap)
 *   air-review-reviewer-heavy   (--heavy)      heavy-tier reviewer (strongest)
 *   air-review-verifier         (--cheap)      checks findings against code
 *
 * Afterwards, point the tool at the agents instead of raw deployments:
 *
 *   provider: azure-foundry-agent
 *   endpoint.baseUrl: https://<resource>.services.ai.azure.com/api/projects/<project>
 *   models.roles: { triage: air-review-triage, reviewer: air-review-reviewer, verifier: air-review-verifier }
 *   models.tiers: { light: { reviewer: air-review-reviewer-light }, heavy: { reviewer: air-review-reviewer-heavy } }
 *
 * Changing the model behind a role is then a Foundry operation (new agent
 * version with another `model`), never a code change.
 *
 * REST API (Foundry projects "new" API, api-version v1), from the official
 * quickstart https://learn.microsoft.com/azure/foundry/agents/quickstarts/prompt-agent :
 *   POST {project}/agents?api-version=v1
 *     { "name": "<agent>", "definition": { "kind": "prompt", "model": "<deployment>", "instructions": "..." } }
 * Creating an agent with an existing name creates a new version of it.
 * Auth: Microsoft Entra ID bearer token, scope https://ai.azure.com/.default
 *   (az account get-access-token --scope https://ai.azure.com/.default --query accessToken -o tsv)
 *
 * Usage:
 *   node scripts/foundry/sync-agents.mjs --project https://res.services.ai.azure.com/api/projects/reviews \
 *     --reviewer gpt-5 --light gpt-5-mini --heavy gpt-5 --cheap gpt-5-mini [--prefix air-review] [--dry-run]
 *   Token: AIR_REVIEW_ACCESS_TOKEN or AZURE_AI_AUTH_TOKEN, else `az` is called.
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));

function parseArgs(argv) {
  const options = { prefix: "air-review", dryRun: false, apiVersion: "v1" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case "--project":
        options.project = next();
        break;
      case "--reviewer":
        options.reviewer = next();
        break;
      case "--light":
        options.light = next();
        break;
      case "--heavy":
        options.heavy = next();
        break;
      case "--cheap":
        options.cheap = next();
        break;
      case "--prefix":
        options.prefix = next();
        break;
      case "--api-version":
        options.apiVersion = next();
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument ${arg}`);
    }
  }
  return options;
}

function usage() {
  console.log(
    [
      "Create or update the air-review prompt agents in a Microsoft Foundry project.",
      "",
      "  node scripts/foundry/sync-agents.mjs --project <https://<res>.services.ai.azure.com/api/projects/<project>>",
      "      --reviewer <deployment> [--light <deployment>] [--heavy <deployment>] --cheap <deployment>",
      "      [--prefix air-review] [--api-version v1] [--dry-run]",
      "",
      "Token: AIR_REVIEW_ACCESS_TOKEN or AZURE_AI_AUTH_TOKEN; otherwise `az account get-access-token` is used.",
    ].join("\n"),
  );
}

async function loadPrompts() {
  // The prompts are the engine's own, built to dist/ (npm run build).
  const prompts = await import(resolve(root, "dist/review/prompts.js"));
  const verifier = await import(resolve(root, "dist/review/verifier.js"));
  const triage = await import(resolve(root, "dist/review/triage.js"));
  return {
    reviewer: prompts.SYSTEM_POLICY.replace("{{maxFindings}}", "40"),
    verifier: verifier.VERIFIER_SYSTEM_PROMPT,
    triage: triage.TRIAGE_SYSTEM_PROMPT,
  };
}

function token() {
  const fromEnv = process.env.AIR_REVIEW_ACCESS_TOKEN || process.env.AZURE_AI_AUTH_TOKEN;
  if (fromEnv) return fromEnv;
  try {
    return execFileSync(
      "az",
      [
        "account",
        "get-access-token",
        "--scope",
        "https://ai.azure.com/.default",
        "--query",
        "accessToken",
        "-o",
        "tsv",
      ],
      { encoding: "utf8" },
    ).trim();
  } catch (error) {
    throw new Error(
      `No token: set AIR_REVIEW_ACCESS_TOKEN (scope https://ai.azure.com/.default) or sign in with \`az login\` (${error.message}).`,
      { cause: error },
    );
  }
}

async function upsertAgent(options, bearer, name, model, instructions) {
  const url = `${options.project.replace(/\/+$/, "")}/agents?api-version=${encodeURIComponent(options.apiVersion)}`;
  const body = { name, definition: { kind: "prompt", model, instructions } };
  if (options.dryRun) {
    console.log(
      `dry-run  POST ${url}\n         ${JSON.stringify({ ...body, definition: { ...body.definition, instructions: `${instructions.slice(0, 60)}…` } })}`,
    );
    return;
  }
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${bearer}` },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`POST ${url} → ${response.status}: ${text.slice(0, 400)}`);
  }
  let created = {};
  try {
    created = JSON.parse(text);
  } catch {
    /* non-JSON body */
  }
  console.log(`ok       ${name} → model ${model}${created.version ? ` (version ${created.version})` : ""}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return usage();
  if (!options.project || !/\/api\/projects\/[^/]+\/?$/.test(options.project)) {
    throw new Error(
      "--project must be the Foundry project endpoint: https://<resource>.services.ai.azure.com/api/projects/<project>",
    );
  }
  if (!options.reviewer || !options.cheap) throw new Error("--reviewer and --cheap deployments are required");
  const prompts = await loadPrompts();
  const bearer = options.dryRun ? "" : token();
  const agents = [
    [`${options.prefix}-triage`, options.cheap, prompts.triage],
    [`${options.prefix}-reviewer`, options.reviewer, prompts.reviewer],
    [`${options.prefix}-reviewer-light`, options.light ?? options.cheap, prompts.reviewer],
    [`${options.prefix}-reviewer-heavy`, options.heavy ?? options.reviewer, prompts.reviewer],
    [`${options.prefix}-verifier`, options.cheap, prompts.verifier],
  ];
  for (const [name, model, instructions] of agents) {
    await upsertAgent(options, bearer, name, model, instructions);
  }
  console.log(
    [
      "",
      "Configure air-review:",
      "  provider: azure-foundry-agent",
      `  endpoint: { baseUrl: ${options.project} }`,
      `  models: { roles: { triage: ${options.prefix}-triage, planner: ${options.prefix}-triage, reviewer: ${options.prefix}-reviewer, verifier: ${options.prefix}-verifier },`,
      `            tiers: { light: { reviewer: ${options.prefix}-reviewer-light }, heavy: { reviewer: ${options.prefix}-reviewer-heavy } } }`,
      "  AIR_REVIEW_ACCESS_TOKEN=<Entra ID token, scope https://ai.azure.com/.default>",
    ].join("\n"),
  );
}

main().catch((error) => {
  console.error(`error: ${error.message}`);
  process.exitCode = 1;
});
