# Configuration

Every option has a default, so a minimal config can be almost empty. The authoritative machine-readable schema is `schema/air-review.schema.json` in the repository (regenerate it with `npm run schema`).

## File discovery and precedence

1. `--config <file>` or `AIR_REVIEW_CONFIG`;
2. otherwise `air-review.yaml`, `air-review.yml`, `air-review.json` or `air-review.toml` in the current directory;
3. environment variables override the file and work even when no file exists ([Environment variables](/reference/environment));
4. command-line flags (`--model`, `--base`, ...) override both.

`air-review config set/unset` preserves comments in YAML. TOML files are rewritten by the serializer, so comments in TOML are not kept.

## Complete example

```yaml
version: 1
provider: openai # preset id; see: air-review example providers
frameworks: [angular]

endpoint:
  baseUrl: https://api.openai.com/v1 # preset default
  apiKeyEnv: OPENAI_API_KEY # preset default
  timeoutMs: 120000
  headers: {}

models:
  default: gpt-4o-mini # fallback for every role
  roles:
    triage: gpt-4o-mini # decides the complexity tier
    planner: gpt-4o-mini # reserved: deterministic today
    reviewer: gpt-4.1 # strong reasoning pass (call 1)
    verifier: gpt-4o-mini # verify and calibrate before publish (call 2)

context:
  strategy: structural-selective
  maxContextRequests: 20
  maxEvidenceTokens: 30000

review:
  severities:
    publish: [BLOCKER, CRITICAL, MAJOR, MINOR]
  gate:
    severities: [BLOCKER, CRITICAL]
    minimumConfidence: 0.9
  maxFindings: 40

memory:
  backend: pr-ledger # pr-ledger | local | none
cache:
  enabled: true
  dir: .air-review/cache

privacy:
  redactSecrets: true
  sendFullFiles: false

telemetry:
  enabled: true
  log: .air-review/telemetry.jsonl
  pricing:
    gpt-4.1: { input: 2, cachedInput: 0.5, output: 8 }
    gpt-4o-mini: { input: 0.15, cachedInput: 0.075, output: 0.6 }

platform:
  provider: local # local | github | azure-devops
  publish: false
  local:
    base: origin/main
```

## Sections

### `provider` and `models`

| Key                            | Default                | Meaning                                                                                                                                                               |
| ------------------------------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provider`                     | `openai`               | preset id: `openai`, `azure-openai`, `azure-foundry`, `bedrock`, `google`, `anthropic`, `mistral`, `groq`, `openrouter`, `together`, `fireworks`, `openai-compatible` |
| `models.default`               | preset suggestion      | fallback for every role                                                                                                                                               |
| `models.roles.reviewer`        | `models.default`       | strong reasoning model, model call 1                                                                                                                                  |
| `models.roles.verifier`        | `models.default`       | cheap to medium model, model call 2                                                                                                                                   |
| `models.roles.planner`         | reviewer, then default | reserved; the planner is deterministic and does not call a model                                                                                                      |
| `models.roles.triage`          | planner, then default  | cheap triage model that decides the complexity tier; see `routing` and `models.tiers` in the repository's docs/configuration.md                                       |
| `models.tiers.light` / `heavy` | standard role          | reviewer/verifier per complexity tier (`reviewer`, `verifier`)                                                                                                        |

Roles, not models, are what the engine consumes. On Azure the value is always the **deployment name**.

### `endpoint`

| Key                  | Default                                         | Meaning                                                                                               |
| -------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `baseUrl`            | preset                                          | endpoint root, without the chat path; Foundry resource or project endpoints get `/openai/v1` appended |
| `apiKeyEnv`          | preset                                          | name of the environment variable holding the key                                                      |
| `apiKey`             | –                                               | direct key value; avoid, prefer `apiKeyEnv`                                                           |
| `auth`               | `api-key`                                       | `api-key` (preset header) or `bearer` (force `Authorization: Bearer`, for Entra ID and OAuth tokens)  |
| `api`                | `auto`                                          | wire protocol: `auto` (switch to Responses on `400 unsupported`), `chat-completions`, `responses`     |
| `apiKeyHeader`       | preset (`authorization` or `api-key`)           | header carrying the key                                                                               |
| `apiKeyPrefix`       | preset (`Bearer ` or empty)                     | prefix before the key                                                                                 |
| `chatPath`           | `/chat/completions`                             | chat completions path                                                                                 |
| `modelsPath`         | `/models`                                       | used by `models` and `doctor`                                                                         |
| `listModels`         | preset                                          | `false` when the endpoint has no `/models` route (Azure, Bedrock, Anthropic)                          |
| `timeoutMs`          | `120000`                                        | HTTP timeout per model call                                                                           |
| `headers`            | `{}`                                            | extra static headers                                                                                  |
| `temperature`        | preset (omitted on Azure)                       | number, or `null` to omit                                                                             |
| `maxTokensParameter` | `max_tokens` (`max_completion_tokens` on Azure) | name of the token-limit parameter                                                                     |

### `frameworks`

```yaml
frameworks: [angular]
```

Context packs to enable. `angular` ships today (subscription lifecycle rule, container/presenter conventions, Angular facts). The exemplar planner and the repository profile are language-agnostic and always on.

### `context`

| Key                  | Default                | Meaning                                                                 |
| -------------------- | ---------------------- | ----------------------------------------------------------------------- |
| `strategy`           | `structural-selective` | the only strategy today                                                 |
| `semanticFallback`   | `false`                | vector or semantic fallback is not built                                |
| `maxContextRequests` | `20`                   | maximum repository files read as evidence per review                    |
| `maxEvidenceTokens`  | `30000`                | maximum tokens of exemplar and related-module text sent to the reviewer |

`air-review inspect` shows the plan and its estimated token cost before any model call. See [Contextual awareness](/concepts/contextual-awareness).

### `review`

| Key                      | Default                             | Meaning                                              |
| ------------------------ | ----------------------------------- | ---------------------------------------------------- |
| `severities.publish`     | `[BLOCKER, CRITICAL, MAJOR, MINOR]` | which severities may become comments at all          |
| `gate.severities`        | `[BLOCKER, CRITICAL]`               | which open findings fail the run with exit code `10` |
| `gate.minimumConfidence` | `0.9`                               | a finding below this confidence never blocks         |
| `maxFindings`            | `40`                                | cap per run                                          |

### `memory` and `cache`

| Key              | Default             | Meaning                                                                                                                                  |
| ---------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `memory.backend` | `pr-ledger`         | `pr-ledger` keeps state in PR comments or threads; `local` writes `.air-review/state.json`; `none` disables reading and advancing memory |
| `cache.enabled`  | `true`              | content-addressed cache of model results; `false` disables reuse and writes                                                              |
| `cache.dir`      | `.air-review/cache` | where the cache lives                                                                                                                    |

The local adapter always writes `.air-review/state.json` regardless of `memory.backend`. The cache is reconstructible and never the truth.

### `privacy`

| Key             | Default | Meaning                                                         |
| --------------- | ------- | --------------------------------------------------------------- |
| `redactSecrets` | `true`  | remove well-known secret patterns from anything sent to a model |
| `sendFullFiles` | `false` | only the delta and targeted evidence are sent                   |

### `telemetry`

| Key       | Default                       | Meaning                                                                             |
| --------- | ----------------------------- | ----------------------------------------------------------------------------------- |
| `enabled` | `true`                        | record per-role usage locally                                                       |
| `log`     | `.air-review/telemetry.jsonl` | one JSON line per run; stays local                                                  |
| `pricing` | `{}`                          | per model or deployment: `input`, `cachedInput`, `output` in USD per million tokens |

`AIR_REVIEW_PRICING` (JSON) overrides `telemetry.pricing`. All called deployments must be priced for a total estimate. Nothing is ever uploaded; the file is yours to attach as a CI artifact.

### `platform`

```yaml
platform:
  provider: local # local | github | azure-devops
  publish: false # true = publish without --publish
  github:
    owner: acme # optional; detected in CI
    repo: storefront
    tokenEnv: GITHUB_TOKEN # then GH_TOKEN, GITHUB_TOKEN
    apiBaseUrl: https://api.github.com # GitHub Enterprise
  azureDevops:
    organizationUrl: https://dev.azure.com/acme # optional; detected in Azure Pipelines
    project: Shop
    repository: storefront # name or GUID
    tokenEnv: SYSTEM_ACCESSTOKEN # then AZURE_DEVOPS_ACCESS_TOKEN, AZURE_DEVOPS_EXT_PAT, AZURE_DEVOPS_TOKEN
    apiVersion: "7.1"
  local:
    base: origin/main # default base ref for local reviews
```

In local mode the diff is the merge base of `base` and the checked-out commit. In GitHub mode without a token, reads use the unauthenticated API and any publish attempt fails with exit code `40` and an actionable message.
