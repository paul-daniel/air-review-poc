# Configuration reference

Every option has a default, so a minimal config can be almost empty. The
authoritative machine-readable schema is
[schema/air-review.schema.json](../schema/air-review.schema.json). A complete
commented example for Microsoft Foundry + Azure DevOps is
[examples/air-review.foundry.yaml](../examples/air-review.foundry.yaml).

## File discovery

`air-review.yaml`, `air-review.yml`, `air-review.json`, `air-review.toml` in
the current directory, or any file passed with `--config`. Environment
overrides apply on top of the file and work even when no file exists.

`air-review config set/unset` preserves comments in YAML. TOML files are
rewritten by the TOML serializer, so comments in TOML configs are not kept.

| Environment variable                                               | Effect                                                                                                             |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `AIR_REVIEW_CONFIG`                                                | config file path                                                                                                   |
| `AIR_REVIEW_PROVIDER`                                              | provider preset (`azure-foundry`, `azure-foundry-agent`, `azure-openai`, `openai`, `bedrock`, `google`, …, `mock`) |
| `AIR_REVIEW_BASE_URL`                                              | endpoint URL (overrides the preset)                                                                                |
| `AIR_REVIEW_API_KEY`                                               | API key value (simplest for repo secrets)                                                                          |
| `AIR_REVIEW_API_KEY_ENV`                                           | name of another env var holding the key                                                                            |
| `AIR_REVIEW_ACCESS_TOKEN`                                          | short-lived OAuth / Microsoft Entra ID token, sent as `Authorization: Bearer`                                      |
| `AIR_REVIEW_AUTH`                                                  | `api-key` (preset header) or `bearer` (force `Authorization: Bearer`)                                              |
| `AIR_REVIEW_API`                                                   | `auto` (default), `chat-completions` or `responses` wire protocol                                                  |
| `AIR_REVIEW_MAX_TOKENS_PARAMETER`                                  | `max_tokens` or `max_completion_tokens`                                                                            |
| `AIR_REVIEW_MODEL`                                                 | reviewer model (shortcut)                                                                                          |
| `AIR_REVIEW_MODEL_TRIAGE` / `_PLANNER` / `_REVIEWER` / `_VERIFIER` | per-role models                                                                                                    |
| `AIR_REVIEW_MODEL_REVIEWER_LIGHT` / `_HEAVY`                       | reviewer per complexity tier                                                                                       |
| `AIR_REVIEW_MODEL_VERIFIER_LIGHT` / `_HEAVY`                       | verifier per complexity tier                                                                                       |
| `AIR_REVIEW_ROUTING_MODE`                                          | `deterministic`, `hybrid` or `model`                                                                               |
| `AIR_REVIEW_PRICING`                                               | the whole `telemetry.pricing` table as JSON                                                                        |
| `AIR_REVIEW_PUBLISH`                                               | `false` reviews and reports without posting to the pull request (`platform.publish`)                                |
| `GITHUB_TOKEN`                                                     | token for the GitHub adapter                                                                                       |
| `SYSTEM_ACCESSTOKEN`                                               | token for the Azure DevOps adapter (`$(System.AccessToken)` or a PAT)                                              |

## Sections

### frameworks

```yaml
frameworks: [angular]
```

Context packs to enable. The MVP ships `angular`; the exemplar planner and the
repository profile are language-agnostic and always on.

### provider / models

```yaml
provider: azure-foundry # preset id; see providers.md for the full list
models:
  default: gpt-5-mini # fallback for every role
  roles:
    triage: gpt-5-mini # decides the complexity tier (cheap)
    planner: gpt-5-mini # reserved: context planning is deterministic today
    reviewer: gpt-5 # standard tier: the strong reasoning pass
    verifier: gpt-5-mini # verify + calibrate before publish
  tiers: # override reviewer/verifier once triage has picked a tier
    light: { reviewer: gpt-5-mini, verifier: gpt-5-mini }
    heavy: { reviewer: gpt-5-codex }
```

Roles, not models, are what the engine consumes. Fallbacks: `reviewer` ←
`default`; `planner` ← `default` ← `reviewer`; `verifier` ← `planner` ←
`default` ← `reviewer`; `triage` ← `planner` ← `verifier` ← `default` ←
`reviewer`. A tier without a model uses the standard role model. On Azure a
value is a **deployment name**; with `azure-foundry-agent` it is an **agent
name**; with `mock` any string.

### routing

```yaml
routing:
  enabled: true
  mode: hybrid # deterministic | hybrid | model
  light:
    maxFiles: 3 # ≤ files AND ≤ lines AND one module → light
    maxLines: 150
  heavy:
    minFiles: 10 # any of these → heavy
    minLines: 400
    minModules: 3 # only counts when the change exceeds light.maxLines
```

Counts are taken over the reviewed delta (files not excluded by
`review.modelSkipKinds`). Translation-, data-, docs- or config-only changes
are always light. `deterministic` never calls the triage model; `hybrid`
calls it only when the thresholds leave the change in the standard band;
`model` calls it every time. `--tier light|standard|heavy` overrides. The
decision and its reasons are printed in every summary and report
([architecture.md](architecture.md#routing-by-complexity)).

### endpoint (provider settings)

```yaml
endpoint:
  # baseUrl: https://api.openai.com/v1   # preset default; override for your vendor
  # apiKeyEnv: OPENAI_API_KEY            # preset default
  # apiKey: ...                          # direct value; prefer apiKeyEnv
  # auth: api-key                        # or "bearer" for Entra ID / OAuth tokens
  # api: auto                            # chat-completions | responses | auto (switch on 400 "unsupported")
  # apiKeyHeader: authorization          # "api-key" for Azure OpenAI
  # apiKeyPrefix: "Bearer "              # "" for Azure OpenAI
  # chatPath: /chat/completions          # deployment-style URLs override this
  # modelsPath: /models
  # listModels: false                    # endpoints without a /models route
  # temperature: null                    # number, or null to omit (Azure default)
  # maxTokensParameter: max_tokens       # max_completion_tokens on Azure
  timeoutMs: 120000
  headers: {} # extra static headers
```

Provider presets and recipes are in [providers.md](providers.md); the two
Foundry paths in [foundry.md](foundry.md). Structured output uses JSON mode
and is validated locally.

### observability

```yaml
observability:
  reportDir: .air-review/reports # <run>.md + <run>.json per run
  diagram: true # Mermaid flowchart of the path actually taken
  publishInSummary: true # cost table + diagram in the PR summary comment
```

See [observability.md](observability.md).

### telemetry

```yaml
telemetry:
  enabled: true
  log: .air-review/telemetry.jsonl # one JSON line per run; stays local
  pricing: # optional, USD per 1M tokens, keyed by deployment / agent name
    gpt-5:
      input: 1.25
      cachedInput: 0.125
      output: 10
```

Every run records usage per role (`triage`, `planner`, `reviewer`,
`verifier`), per step, model calls, cache hits, duration, the routing
decision and the verdict. When `pricing` covers every model called, a cost
estimate is included everywhere; otherwise the cost is reported as
unavailable rather than wrong. air-review never ships telemetry anywhere.

### context

```yaml
context:
  strategy: structural-selective # the only strategy in the MVP
  semanticFallback: false # vector/semantic fallback is not built
  maxContextRequests: 20 # max repository files read as evidence per review
  maxEvidenceTokens: 30000 # max tokens of exemplar + related-module text sent to the reviewer
```

### review

```yaml
review:
  severities:
    publish: [BLOCKER, CRITICAL, MAJOR, MINOR, NITPICK] # INFO stays in the report only
  gate:
    severities: [BLOCKER, CRITICAL, MAJOR, MINOR] # NITPICK and INFO never block
    minimumConfidence: 0.6
  maxFindings: 40
  maxOutputTokens: 16384 # reviewer output budget; reasoning models spend most of it on hidden reasoning
  modelSkipKinds: [docs, binary] # file kinds that never justify a model call on their own
```

`gate` decides which open `IN_PR` findings fail the CI step (exit code 10)
and turn the verdict into "request changes": by default everything down to
`MINOR` must be fixed, while `NITPICK` (reviewer preference) and `INFO` only
turn "Approved" into "Approved with suggestions". `publish` decides which
severities may become comments at all. `modelSkipKinds` accepts
`translation`, `docs`, `data`, `config`, `tests`, `binary`: a push that only
touches those kinds runs the deterministic rules and carries previous
findings over without any model call.

### memory / cache

```yaml
memory:
  backend: pr-ledger # pr-ledger | local | none
cache:
  enabled: true
  dir: .air-review/cache
```

`pr-ledger` keeps state in PR comments (GitHub) or threads (Azure DevOps);
the local adapter always writes `.air-review/state.json`. The cache is
content-addressed and reconstructible; a reviewer input already seen is
served without a request and shown as a cache hit in the step table.

### privacy

```yaml
privacy:
  redactSecrets: true
  sendFullFiles: false # only the delta + targeted evidence is sent
```

### platform

```yaml
platform:
  provider: local # local | github | azure-devops
  publish: false # true = publish comments without --publish
  github:
    owner: acme # optional; detected in CI
    repo: storefront
    tokenEnv: GITHUB_TOKEN
    apiBaseUrl: https://api.github.com # GitHub Enterprise support
  azureDevops:
    organizationUrl: https://dev.azure.com/acme # optional; detected in Azure Pipelines
    project: Shop # optional
    repository: storefront # name or GUID; optional
    tokenEnv: SYSTEM_ACCESSTOKEN # then AZURE_DEVOPS_ACCESS_TOKEN, AZURE_DEVOPS_EXT_PAT, AZURE_DEVOPS_TOKEN
    apiVersion: "7.1"
    vote:
      enabled: true # register as a reviewer and vote
      approveWithSuggestions: true # vote 5 when only nitpicks/info remain; false = no vote
      mode: pipeline # pipeline: the review step votes only -5 when blocked, `air-review approve` casts 10/5 after build and tests; immediate: the review step casts the final vote
    status:
      enabled: false # also post a pull-request status for a "Status" branch policy
      genre: air-review
      name: gate
  local:
    base: origin/main # default base ref for local reviews
```

Azure DevOps threads, votes, detection and permissions:
[docs/azure-devops.md](azure-devops.md).

In local mode the diff is computed from the merge base of `base` and the
checked-out commit, matching pull-request semantics. In GitHub mode, without
a token, reads fall back to the unauthenticated API; any publish attempt
without a token fails with exit code 40 and an actionable message.

### Notes

`telemetry.pricing.<name>.cachedInput` is the USD rate per 1M cached input
tokens; input counts include cached tokens and output counts include
reasoning tokens. `AIR_REVIEW_PRICING` accepts the complete table as JSON and
overrides YAML. No model calls means $0.

`memory.backend: none` disables reading and advancing review memory; local
summaries, reports and telemetry remain available. `cache.enabled: false`
disables result reuse and cache writes. The planner is deterministic today:
its configured model is not called.
