# Microsoft Foundry (new): connect a deployed model and make it an agent

"Microsoft Foundry" is the current name of the platform (the portal shows a
**New Foundry** toggle; the older experience is "Foundry (classic)"). air-review
talks to it in two ways. Both are chosen by configuration only; the engine
never references a vendor, a model or an agent by name in code.

| Path                                    | `provider`            | What `models.*` names are | When to use                                                                                                     |
| --------------------------------------- | --------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| A. Foundry Models, OpenAI v1 API        | `azure-foundry`       | **deployment names**      | the default: one HTTPS call per role, works with every model sold through Foundry                               |
| B. Foundry Agent Service, prompt agents | `azure-foundry-agent` | **agent names**           | when the review roles must exist as governed agents in a Foundry project (tracing, versions, portal playground) |

## A. A deployed model behind the OpenAI v1 route

Foundry exposes every deployment of a resource behind one endpoint and one
credential; the deployment name travels in the `model` field of the request
and the `/openai/v1/` route uses implicit versioning, so no `api-version`
is needed ([Endpoints for Microsoft Foundry Models](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/endpoints)).
The same page states that the base URL accepts both
`https://<resource>.openai.azure.com/openai/v1/` and
`https://<resource>.services.ai.azure.com/openai/v1/`.

Paste whichever endpoint the portal shows; air-review appends `/openai/v1`:

| What the portal shows          | Example                                                           |
| ------------------------------ | ----------------------------------------------------------------- |
| Azure OpenAI resource endpoint | `https://<resource>.openai.azure.com`                             |
| Foundry resource endpoint      | `https://<resource>.services.ai.azure.com`                        |
| Foundry project endpoint       | `https://<resource>.services.ai.azure.com/api/projects/<project>` |

Authentication, per the same Microsoft page:

- **API key**: quick to set up but it grants full access to the resource and
  must be rotated by hand; Microsoft recommends keyless authentication for
  production. The tool sends it in the `api-key` header (`AZURE_AI_API_KEY`
  or `AIR_REVIEW_API_KEY`).
- **Microsoft Entra ID (keyless)**: tokens must be issued for the scope
  `https://ai.azure.com/.default` and travel as `Authorization: Bearer`.
  `AIR_REVIEW_ACCESS_TOKEN` does exactly that:

```bash
az login
export AIR_REVIEW_ACCESS_TOKEN="$(az account get-access-token --scope https://ai.azure.com/.default --query accessToken -o tsv)"
```

Wire protocol: the Responses API works with Azure OpenAI models and with the
Foundry Models sold by Azure that support it; a deployment that does not
answers `400 Model not supported`, in which case Chat Completions must be
used ([endpoints page, note](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/endpoints)).
air-review's `endpoint.api: auto` starts with Chat Completions and switches a
deployment to `/responses` when it reports the operation as unsupported
(gpt-5-codex does), so nothing needs configuring.

Minimal configuration:

```yaml
provider: azure-foundry
endpoint:
  baseUrl: https://my-resource.services.ai.azure.com
models:
  roles: { triage: gpt-5-mini, reviewer: gpt-5, verifier: gpt-5-mini }
  tiers:
    light: { reviewer: gpt-5-mini }
    heavy: { reviewer: gpt-5-codex }
```

## B. A prompt agent per role in Foundry Agent Service

A prompt agent is "a declaratively defined agent that combines a model from
the Foundry model catalog, instructions, tools, and natural language prompts"
([Quickstart: Create a prompt agent](https://learn.microsoft.com/en-us/azure/foundry/agents/quickstarts/prompt-agent)).
With `provider: azure-foundry-agent`, each air-review role is such an agent:
the agent holds the role's instructions and the model behind it is changed in
the portal or by the sync script, never in this repository.

Facts from the quickstart (Foundry projects "new" API, Azure AI Projects 2.x):

- Project endpoint: `https://<resource-name>.services.ai.azure.com/api/projects/<project-name>`.
- SDK: `npm install @azure/ai-projects @azure/identity`; `project.agents.createVersion(name, { kind: "prompt", model, instructions })`.
- REST, create: `POST https://<resource>.services.ai.azure.com/api/projects/<project>/agents?api-version=v1` with body `{ "name": "...", "definition": { "kind": "prompt", "model": "<deployment>", "instructions": "..." } }`.
- REST, invoke: `POST .../api/projects/<project>/agents/<name>/endpoint/protocols/openai/responses?api-version=v1` with an OpenAI Responses body (`input: [...]`).
- Token: `az account get-access-token --scope https://ai.azure.com/.default` (valid 60–90 minutes).
- Prerequisite from the quickstart: Application Insights connected to the project for agent tracing.

air-review's `FoundryAgentProvider` (`src/model/foundry-agent.ts`) uses the
REST invoke route above with a bearer token and parses the Responses usage
block, so cost reporting works the same as with path A.

Create or update the five agents from the tool's own prompts:

```bash
node scripts/foundry/sync-agents.mjs \
  --project https://my-resource.services.ai.azure.com/api/projects/reviews \
  --reviewer gpt-5 \          # standard reviewer deployment
  --light gpt-5-mini \        # light-tier reviewer deployment
  --cheap gpt-5-mini          # triage and verifier deployment
```

It creates/updates `air-review-triage`, `air-review-reviewer`,
`air-review-reviewer-light`, `air-review-reviewer-heavy` (defaults to the
`--reviewer` deployment unless `--heavy` is given) and `air-review-verifier`.
Then:

```yaml
provider: azure-foundry-agent
endpoint:
  baseUrl: https://my-resource.services.ai.azure.com/api/projects/reviews
models:
  roles: { triage: air-review-triage, reviewer: air-review-reviewer, verifier: air-review-verifier }
  tiers:
    light: { reviewer: air-review-reviewer-light }
    heavy: { reviewer: air-review-reviewer-heavy }
```

`air-review models` lists the agents of the project (`GET {project}/agents?api-version=v1`).

## Interchangeable models: configuration and environment only

| Config key                      | Environment variable                                | Meaning                                                                      |
| ------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------- |
| `provider`                      | `AIR_REVIEW_PROVIDER`                               | `azure-foundry`, `azure-foundry-agent`, `azure-openai`, `openai`, … , `mock` |
| `endpoint.baseUrl`              | `AIR_REVIEW_BASE_URL`                               | resource, project or agent-project endpoint                                  |
| `endpoint.apiKey` / `apiKeyEnv` | `AIR_REVIEW_API_KEY`, `AZURE_AI_API_KEY`            | API key                                                                      |
| `endpoint.auth: bearer` + token | `AIR_REVIEW_ACCESS_TOKEN`                           | Entra ID token, sent as `Authorization: Bearer`                              |
| `models.roles.triage`           | `AIR_REVIEW_MODEL_TRIAGE`                           | complexity triage (cheap)                                                    |
| `models.roles.planner`          | `AIR_REVIEW_MODEL_PLANNER`                          | reserved; context planning is deterministic today                            |
| `models.roles.reviewer`         | `AIR_REVIEW_MODEL_REVIEWER` (or `AIR_REVIEW_MODEL`) | standard-tier reviewer                                                       |
| `models.roles.verifier`         | `AIR_REVIEW_MODEL_VERIFIER`                         | verifier (cheap to medium)                                                   |
| `models.tiers.light.reviewer`   | `AIR_REVIEW_MODEL_REVIEWER_LIGHT`                   | reviewer for light changes                                                   |
| `models.tiers.light.verifier`   | `AIR_REVIEW_MODEL_VERIFIER_LIGHT`                   | verifier for light changes                                                   |
| `models.tiers.heavy.reviewer`   | `AIR_REVIEW_MODEL_REVIEWER_HEAVY`                   | reviewer for heavy changes                                                   |
| `models.tiers.heavy.verifier`   | `AIR_REVIEW_MODEL_VERIFIER_HEAVY`                   | verifier for heavy changes                                                   |
| `routing.mode`                  | `AIR_REVIEW_ROUTING_MODE`                           | `deterministic`, `hybrid` (default), `model`                                 |
| `telemetry.pricing`             | `AIR_REVIEW_PRICING` (JSON)                         | USD per 1M tokens per deployment/agent                                       |

Unset roles fall back to `models.default`, then to the next cheaper role;
unset tiers fall back to the standard role model. Routing therefore never
fails for lack of configuration: it only saves money when a cheaper
deployment exists and spends it when a stronger one does. The effective
decision (tier, model, reasons) is printed in every summary and report.

## Commented example

The complete file is [examples/air-review.foundry.yaml](../examples/air-review.foundry.yaml);
the essentials:

```yaml
provider: azure-foundry
endpoint:
  baseUrl: https://my-resource.services.ai.azure.com # /openai/v1 appended by the tool
  apiKeyEnv: AZURE_AI_API_KEY # or AIR_REVIEW_ACCESS_TOKEN (Entra ID)
models:
  default: gpt-5-mini
  roles:
    triage: gpt-5-mini # decides the tier
    reviewer: gpt-5 # standard tier
    verifier: gpt-5-mini # checks findings against the code
  tiers:
    light: { reviewer: gpt-5-mini } # translation file, small helper, tests only
    heavy: { reviewer: gpt-5-codex } # large or cross-module pull requests
routing:
  mode: hybrid # thresholds, then the triage model for the middle band
  light: { maxFiles: 3, maxLines: 150 }
  heavy: { minFiles: 10, minLines: 400, minModules: 3 }
telemetry:
  pricing: # USD per 1M tokens, keyed by deployment name
    gpt-5: { input: 1.25, cachedInput: 0.125, output: 10 }
    gpt-5-mini: { input: 0.25, cachedInput: 0.025, output: 2 }
    gpt-5-codex: { input: 1.25, cachedInput: 0.125, output: 10 }
observability:
  reportDir: .air-review/reports
platform:
  provider: azure-devops
  publish: true
  azureDevops:
    vote: { enabled: true, approveWithSuggestions: true }
    status: { enabled: false, genre: air-review, name: gate }
```

Prices in the example are placeholders: take the current ones from the
Foundry price list for your region and deployment type.

## Start-up procedure

1. In the Foundry portal (New Foundry on), create a Foundry resource and a
   project; note the resource endpoint (path A) or the project endpoint
   (path B).
2. Deploy two models: a cheap one (triage, verifier, light tier) and a strong
   one (standard/heavy tier). Raise the tokens-per-minute quota of the strong
   deployment if several pull requests will be reviewed in parallel.
3. Grant the identity that will review (your user for manual runs, a service
   principal or the pipeline's connection) the role Microsoft documents for
   keyless inference on the resource, or copy an API key.
4. In Azure DevOps, create the variable group `air-review` with
   `AIR_REVIEW_PROVIDER`, `AIR_REVIEW_BASE_URL`, the model variables and the
   secret credential (see [azure-devops.md](azure-devops.md)).
5. Locally, `air-review init --provider azure-foundry --base-url <endpoint>`
   and adjust the role and tier deployments.
6. `air-review doctor`: it sends one minimal request per distinct deployment
   (Azure has no `/models` listing) and proves credential, URL and names
   before a review pays for anything.
7. `air-review inspect --base origin/main` then
   `air-review dry-run --base origin/main`; read `.air-review/reports/<run>.md`.
8. Add the pipeline from [examples/azure-pipelines.yml](../examples/azure-pipelines.yml)
   as a build validation policy on the target branch.

## Microsoft's model router versus air-review's triage

Foundry also offers **model router**, "a trained language model that selects
the best large language model (LLM) to respond to a prompt in real time",
deployed as a single model named `model-router` with a routing mode
(Balanced, Quality, Cost) and an optional model subset; the response's `model`
field reveals which underlying model served the request
([How to use model router](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/model-router)).

The two are complementary:

- model router decides **per prompt**, inside Foundry, and bills the
  underlying model; you can simply set `reviewer: model-router` and let it
  choose.
- air-review's triage decides **per pull request**, before any reviewer
  prompt is built, from measurable signals (files, lines, modules, file
  kinds), prints its reasons in the summary, and can also skip the model
  entirely (docs-only push, already reviewed head). It also lets the heavy
  tier be a deployment model router does not route to.

Pricing with model router: the `model` reported back is the underlying
model, so `telemetry.pricing` must contain the underlying deployment names,
not only `model-router`.

## What could not be verified in this session

No live Foundry call was made while writing this version: no credential or
signed-in Azure CLI session was available. Path A was validated live in
October 2026 against a Foundry resource (see [providers.md](providers.md));
path B (`azure-foundry-agent`, `scripts/foundry/sync-agents.mjs`) was written
from the official quickstart and REST reference quoted above and tested
against a fake HTTP server only. The first real run should follow the
start-up procedure with `doctor`, then `dry-run`, and compare the reported
usage with the Foundry cost analysis page.
