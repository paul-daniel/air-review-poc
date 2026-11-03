# Microsoft Foundry (new): connect a deployed model and make it an agent

"Microsoft Foundry" is the current name of the platform (the portal shows a
**New Foundry** toggle; the older experience is "Foundry (classic)"). air-review
talks to it in two ways. Both are chosen by configuration only; the engine
never references a vendor, a model or an agent by name in code.

| Path                                         | `provider`            | What `models.*` names are | When to use                                                                                                     |
| -------------------------------------------- | --------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| A. Foundry Models (OpenAI door, Claude door) | `azure-foundry`       | **deployment names**      | the default: one call per role through the official SDKs, works with every model deployed in Foundry            |
| B. Foundry Agent Service, prompt agents      | `azure-foundry-agent` | **agent names**           | when the review roles must exist as governed agents in a Foundry project (tracing, versions, portal playground) |

Both paths are implemented with Microsoft's and the vendors' official SDKs
(`openai`, `@anthropic-ai/foundry-sdk`, `@azure/ai-projects`, `@azure/identity`),
so API changes arrive as package updates with a changelog, retries and token
refresh are the libraries' job, and the tool never hand-builds a Foundry
request. The generic hand-written HTTP client is only used for non-Azure
vendors.

## A. A deployed model: the OpenAI door and the Claude door

One Foundry resource exposes its deployments behind two documented doors,
and `provider: azure-foundry` (`src/model/foundry.ts`) opens the right one
per deployment name:

- **OpenAI door** — every model sold through the OpenAI-compatible route
  (GPT, DeepSeek, Llama, Grok, Mistral, Kimi, the model router…), called with
  the `openai` package against `https://<resource>/openai/v1`. The deployment
  name travels in the `model` field and the `/openai/v1/` route uses implicit
  versioning, so no `api-version` is needed
  ([Endpoints for Microsoft Foundry Models](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/endpoints)).
  The same page states that the base URL accepts both
  `https://<resource>.openai.azure.com/openai/v1/` and
  `https://<resource>.services.ai.azure.com/openai/v1/`.
- **Claude door** — Claude deployments are served through Anthropic's
  Messages API at `https://<resource>.services.ai.azure.com/anthropic`
  (target URI `…/anthropic/v1/messages`), called with the official
  `@anthropic-ai/foundry-sdk` package; the deployment name is the `model`
  and the same Entra ID scope or API key applies
  ([Deploy and use Claude models in Microsoft Foundry](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/use-foundry-models-claude)).
  A deployment goes through this door when its name starts with `claude`
  (the portal's default deployment name is the model name) or when the
  config writes it as `claude:<deployment>`. Claude has no JSON mode, so the
  JSON contract lives in the prompt and the parser tolerates prose around
  the document.

Claude deployments are chosen per role and tier like any other deployment:

```yaml
models:
  roles: { triage: claude-haiku-4-5, reviewer: gpt-5, verifier: claude-haiku-4-5 }
  tiers:
    light: { reviewer: claude-haiku-4-5 }
    heavy: { reviewer: claude-sonnet-4-5 } # or claude:my-sonnet-deployment
```

Paste whichever endpoint the portal shows; air-review appends `/openai/v1`:

| What the portal shows          | Example                                                           |
| ------------------------------ | ----------------------------------------------------------------- |
| Azure OpenAI resource endpoint | `https://<resource>.openai.azure.com`                             |
| Foundry resource endpoint      | `https://<resource>.services.ai.azure.com`                        |
| Foundry project endpoint       | `https://<resource>.services.ai.azure.com/api/projects/<project>` |

Authentication (`src/model/azure-credential.ts`), in this order, per the
Microsoft pages above:

1. **API key** (`AIR_REVIEW_API_KEY`, `AZURE_AI_API_KEY`, or `endpoint.apiKey`):
   quick to set up but it grants full access to the resource and must be
   rotated by hand; Microsoft recommends keyless authentication for production.
2. **A provided access token** (`AIR_REVIEW_ACCESS_TOKEN`, scope
   `https://ai.azure.com/.default`, sent as `Authorization: Bearer`) for jobs
   that fetch one themselves.
3. **Keyless Microsoft Entra ID**, when neither is set: `DefaultAzureCredential`
   from `@azure/identity` finds the identity of the environment (`az login` on
   a laptop, a managed identity or the pipeline's service connection in CI)
   and refreshes tokens on its own. This is the recommended path; nothing to
   configure.

```bash
az login            # that is all: no key, no token variable
air-review doctor   # prints "Microsoft Entra ID via DefaultAzureCredential …"
```

`air-review doctor` always says which of the three is in use.

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
official `@azure/ai-projects` SDK exactly as the quickstart does:
`new AIProjectClient(projectEndpoint, credential)`, then
`project.getOpenAIClient()` and `responses.create(..., { body: { agent_reference: { name, type: "agent_reference" } } })`.
The Responses usage block is parsed, so cost reporting works the same as with
path A. Agents need an Entra ID identity (credential order above, API keys
excluded).

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
| `endpoint.apiKey` / `apiKeyEnv` | `AIR_REVIEW_API_KEY`, `AZURE_AI_API_KEY`            | API key (optional: keyless Entra ID is used when nothing is set)             |
| `endpoint.auth: bearer` + token | `AIR_REVIEW_ACCESS_TOKEN`                           | a token you fetched yourself, sent as `Authorization: Bearer`                |
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
    triage: gpt-5-mini # decides the tier (or claude-haiku-4-5)
    reviewer: gpt-5 # standard tier (or claude-sonnet-4-5)
    verifier: gpt-5-mini # checks findings against the code
  tiers:
    light: { reviewer: gpt-5-mini } # translation file, small helper, tests only
    heavy: { reviewer: gpt-5-codex } # large or cross-module pull requests (or claude-sonnet-4-5)
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
    vote: { enabled: true, approveWithSuggestions: true, mode: pipeline } # approval cast by `air-review approve`
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
   principal or the pipeline's connection) the "Azure AI User" role on the
   resource for keyless inference, or copy an API key.
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

## Verified live, and what was not

On 3 November the SDK path (`openai` + `@azure/identity`, Anthropic Foundry
SDK, `@azure/ai-projects`) replaced the raw HTTP path for every Foundry
provider; the OpenAI door was re-validated through the SDK, the Claude door
was not run live (no Claude deployment on the resource yet) and is covered
by tests with a fake SDK client only.

Path A was exercised on 3 November 2026 against the resource
`airreview-resource` (Sweden Central) with an Entra ID token from a signed-in
Azure CLI (`az account get-access-token --scope https://ai.azure.com/.default`),
on the demo corpus of `scripts/demo.mjs`:

| Run                            | Tier / reviewer deployment                     | Calls | Duration | Estimated cost | Outcome                                                                                                |
| ------------------------------ | ---------------------------------------------- | ----- | -------- | -------------- | ------------------------------------------------------------------------------------------------------ |
| `doctor`                       | probes of three deployments                    | 3     | < 3 s    | ~70 tokens     | endpoint `…/openai/v1`, bearer credential, every deployment reachable (gpt-5-codex included)           |
| `dry-run`                      | light / `airreview-planning-mini` (4.1-mini)   | 2     | 5.2 s    | ~$0.002        | deterministic subscription finding plus one model finding, prompt injection ignored                    |
| `dry-run --tier heavy --force` | heavy / `airreview-review-codex` (gpt-5-codex) | 2     | 14.1 s   | ~$0.016        | percent-as-fraction discount bug found (MAJOR); a model duplicate of the deterministic finding dropped |

Path B (`azure-foundry-agent`, `scripts/foundry/sync-agents.mjs`) was written
from the official quickstart and REST reference quoted above and exercised
with `--dry-run` and a fake HTTP server only: no Foundry project with agents
existed in the resource. The first real run should follow the start-up
procedure with `doctor`, then `dry-run`, and compare the reported usage with
the Foundry cost analysis page.
