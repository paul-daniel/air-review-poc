# Configuration reference

Every option has a default, so a minimal config can be almost empty. The
authoritative machine-readable schema is
[schema/air-review.schema.json](../schema/air-review.schema.json).

## File discovery

`air-review.yaml`, `air-review.yml`, `air-review.json`, `air-review.toml` in
the current directory, or any file passed with `--config`. Environment
overrides apply on top of the file and work even when no file exists.

`air-review config set/unset` preserves comments in YAML. TOML files are
rewritten by the TOML serializer, so comments in TOML configs are not kept.

| Environment variable                                   | Effect                                                                        |
| ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `AIR_REVIEW_CONFIG`                                    | config file path                                                              |
| `AIR_REVIEW_PROVIDER`                                  | provider preset (`openai`, `azure-openai`, `bedrock`, `google`, ...)          |
| `AIR_REVIEW_BASE_URL`                                  | endpoint URL (overrides the preset)                                           |
| `AIR_REVIEW_API_KEY`                                   | API key value (simplest for repo secrets)                                     |
| `AIR_REVIEW_API_KEY_ENV`                               | name of another env var holding the key                                       |
| `AIR_REVIEW_ACCESS_TOKEN`                              | short-lived OAuth / Microsoft Entra ID token, sent as `Authorization: Bearer` |
| `AIR_REVIEW_AUTH`                                      | `api-key` (preset header) or `bearer` (force `Authorization: Bearer`)         |
| `AIR_REVIEW_API`                                       | `auto` (default), `chat-completions` or `responses` wire protocol             |
| `AIR_REVIEW_MODEL`                                     | reviewer model                                                                |
| `AIR_REVIEW_MODEL_PLANNER` / `_REVIEWER` / `_VERIFIER` | per-role models                                                               |
| `AIR_REVIEW_OPENAI_BASE_URL`                           | legacy alias for `AIR_REVIEW_BASE_URL`                                        |
| `GITHUB_TOKEN`                                         | token for the GitHub adapter                                                  |
| `SYSTEM_ACCESSTOKEN`                                   | token for the Azure DevOps adapter (`$(System.AccessToken)` or a PAT)         |

## Sections

### frameworks

```yaml
frameworks: [angular]
```

Context packs to enable. The MVP ships `angular`.

### provider / models

```yaml
provider: openai # preset id; see providers.md for the full list
models:
  default: gpt-4o-mini # fallback for every role
  roles:
    planner: gpt-4o-mini # context planning / selection
    reviewer: gpt-4.1 # strong reasoning pass
    verifier: gpt-4o-mini # verify + calibrate before publish
```

Roles, not models, are what the engine consumes. If `planner` is unset it
falls back to `reviewer`, then `default`.

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
  timeoutMs: 120000
  headers: {} # extra static headers
```

Provider presets and recipes (OpenAI, Azure OpenAI, Azure AI Foundry, Amazon
Bedrock, Google, Anthropic, Mistral, Groq, OpenRouter, internal gateways) are
in [providers.md](providers.md). Structured output uses JSON mode plus a JSON
schema where supported, and is validated locally.

### features (reserved)

```yaml
features:
  ollama: false # reserved; the local-model provider is disabled in this build
```

### telemetry

```yaml
telemetry:
  enabled: true
  log: .air-review/telemetry.jsonl # one JSON line per run; stays local
  pricing: # optional, USD per 1M tokens
    gpt-4.1:
      input: 2
      output: 8
```

Every review records per-role token usage (`planner`, `reviewer`, `verifier`),
model calls, cache hits and duration, and prints them at the end of the run.
When `pricing` covers the models used, a cost estimate is included in the CLI
output, the summary comment and the telemetry log. air-review never ships
telemetry anywhere; the file is local (or a CI artifact if you upload it).

### context

```yaml
context:
  strategy: structural-selective # the only strategy in the MVP
  semanticFallback: false # vector/semantic fallback is not built
  maxContextRequests: 20 # max repository files read as evidence per review
  maxEvidenceTokens: 30000 # max tokens of exemplar + related-module text sent to the reviewer
```

The planner reads existing files of the same kind as each changed file (up to
three for a new file, one for a small edit) and the exported API of imported
in-repo modules, within these two budgets. `air-review inspect` shows the plan
and its estimated token cost before any model call. See
[architecture.md](architecture.md#contextual-awareness-the-exemplar-planner).

### review

```yaml
review:
  severities:
    publish: [BLOCKER, CRITICAL, MAJOR, MINOR]
  gate:
    severities: [BLOCKER, CRITICAL]
    minimumConfidence: 0.9
  maxFindings: 40
  maxOutputTokens: 16384 # reviewer output budget; reasoning models spend most of it on hidden reasoning
```

`gate` decides which open findings fail the CI step (exit code 10).
`publish` decides which severities may become comments at all.

### memory / cache

```yaml
memory:
  backend: pr-ledger # pr-ledger | local | none
cache:
  enabled: true
  dir: .air-review/cache
```

`pr-ledger` keeps state in PR comments on GitHub; on the local adapter it
always writes `.air-review/state.json` regardless of this setting. The cache
is content-addressed and reconstructible.

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
    tokenEnv: SYSTEM_ACCESSTOKEN # then AZURE_DEVOPS_EXT_PAT, AZURE_DEVOPS_TOKEN
    apiVersion: "7.1"
  local:
    base: origin/main # default base ref for local reviews
```

Azure DevOps threads, detection and permissions: [docs/azure-devops.md](azure-devops.md).

In local mode the diff is computed from the merge base of `base` and the
checked-out commit, matching pull-request semantics. In GitHub mode, without
a token, reads fall back to the unauthenticated API; any publish attempt
without a token fails with exit code 40 and an actionable message.

### Cached tokens and environment pricing

`telemetry.pricing.<deployment>.cachedInput` is the USD rate per 1M cached
input tokens. Input counts include cached tokens; output counts include
reasoning tokens. `AIR_REVIEW_PRICING` accepts the complete pricing table as
JSON and overrides YAML. All called deployments must be priced for a total
estimate; missing usage makes cost unavailable. No model calls means $0.

`endpoint.temperature` accepts a number or null (omit it).
`endpoint.maxTokensParameter` is `max_tokens` or `max_completion_tokens`;
`AIR_REVIEW_MAX_TOKENS_PARAMETER` overrides it. Azure defaults to omission of
temperature and `max_completion_tokens` for reasoning-model compatibility.

`memory.backend: none` disables reading and advancing review memory.
Local summaries and telemetry remain available. `cache.enabled: false`
disables result reuse and cache writes. The planner is currently structural
and deterministic: its configured model is not called.
