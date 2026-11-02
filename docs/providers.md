# Model providers

Every backend speaks the same OpenAI-compatible chat completions protocol, so
switching vendors is a one-line change: pick a **provider preset**, give it a
key, and the tool fills in that vendor's URL and auth conventions. Everything
a preset sets can be overridden in the `endpoint` section.

Reviews are plain HTTP calls: no model downloads, no GPU, no local runtime in
the job.

## Presets

| Preset id           | Vendor            | Default base URL                                                              | Default key env                                 | `/models`    |
| ------------------- | ----------------- | ----------------------------------------------------------------------------- | ----------------------------------------------- | ------------ |
| `openai`            | OpenAI            | `https://api.openai.com/v1`                                                   | `OPENAI_API_KEY`                                | yes          |
| `azure-openai`      | Azure OpenAI      | `https://<resource>.openai.azure.com/openai/v1`                               | `AZURE_OPENAI_API_KEY`                          | no           |
| `azure-foundry`     | Microsoft Foundry | `https://<resource>.services.ai.azure.com[/api/projects/<project>]/openai/v1` | `AZURE_AI_API_KEY` or `AIR_REVIEW_ACCESS_TOKEN` | no           |
| `bedrock`           | Amazon Bedrock    | `https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1`                   | `AWS_BEARER_TOKEN_BEDROCK`                      | no           |
| `google`            | Google Gemini     | `https://generativelanguage.googleapis.com/v1beta/openai`                     | `GEMINI_API_KEY`                                | yes          |
| `anthropic`         | Anthropic         | `https://api.anthropic.com/v1`                                                | `ANTHROPIC_API_KEY`                             | no           |
| `mistral`           | Mistral           | `https://api.mistral.ai/v1`                                                   | `MISTRAL_API_KEY`                               | yes          |
| `groq`              | Groq              | `https://api.groq.com/openai/v1`                                              | `GROQ_API_KEY`                                  | yes          |
| `openrouter`        | OpenRouter        | `https://openrouter.ai/api/v1`                                                | `OPENROUTER_API_KEY`                            | yes          |
| `together`          | Together AI       | `https://api.together.ai/v1`                                                  | `TOGETHER_API_KEY`                              | yes          |
| `fireworks`         | Fireworks AI      | `https://api.fireworks.ai/inference/v1`                                       | `FIREWORKS_API_KEY`                             | yes          |
| `openai-compatible` | Your gateway      | – (required)                                                                  | –                                               | configurable |

## Configure everything from the environment

The same knobs are available as environment variables, which is the intended
way to parameterize a pipeline:

| Variable                                                           | Effect                                               |
| ------------------------------------------------------------------ | ---------------------------------------------------- |
| `AIR_REVIEW_PROVIDER`                                              | preset id (`azure-openai`, `bedrock`, `google`, ...) |
| `AIR_REVIEW_BASE_URL`                                              | endpoint URL (overrides the preset)                  |
| `AIR_REVIEW_API_KEY`                                               | API key value (simplest for repo secrets)            |
| `AIR_REVIEW_API_KEY_ENV`                                           | name of another env var holding the key              |
| `AIR_REVIEW_MODEL_TRIAGE` / `_PLANNER` / `_REVIEWER` / `_VERIFIER` | one model per agent role                             |
| `AIR_REVIEW_MODEL_REVIEWER_LIGHT` / `_HEAVY`                       | reviewer per complexity tier (see docs/foundry.md)   |
| `AIR_REVIEW_MODEL`                                                 | shortcut for the reviewer model                      |

```bash
export AIR_REVIEW_PROVIDER=azure-openai
export AIR_REVIEW_BASE_URL=https://my-resource.openai.azure.com/openai/v1
export AIR_REVIEW_API_KEY=...            # from the repo secret store
export AIR_REVIEW_MODEL_REVIEWER=my-reviewer-deployment
air-review review --publish
```

## Vendor notes

### Azure OpenAI / Microsoft Foundry

Azure keys travel in the `api-key` header (not `Authorization: Bearer`) and
the endpoint URL carries your resource name. With Azure OpenAI v1 endpoints
the deployment name is the model name; Foundry model paths vary by model
family, so override `endpoint.chatPath` when your deployment documents a
different one.

```yaml
provider: azure-openai
endpoint:
  baseUrl: https://my-resource.openai.azure.com/openai/v1
  apiKeyEnv: AZURE_OPENAI_API_KEY
models:
  default: gpt-4o-mini
  roles:
    reviewer: my-reviewer-deployment
```

### Amazon Bedrock

Bedrock exposes an OpenAI-compatible runtime endpoint authenticated with a
Bedrock API key (`AWS_BEARER_TOKEN_BEDROCK`). Air Review currently implements
API-key authentication only, not AWS SigV4 signing. Change
the region inside `baseUrl`; model ids look like `openai.gpt-oss-120b-1:0`.

```yaml
provider: bedrock
endpoint:
  baseUrl: https://bedrock-runtime.eu-west-3.amazonaws.com/openai/v1
models:
  default: openai.gpt-oss-20b-1:0
  roles:
    reviewer: openai.gpt-oss-120b-1:0
```

### Google Gemini

```yaml
provider: google
models:
  default: gemini-3.8-flash
  roles:
    reviewer: gemini-3.8-flash
```

### Anything else

Point `provider: openai-compatible` at any gateway that speaks
`/chat/completions`, and use `endpoint.headers` for routing or organization
headers.

## Endpoint options

| Option         | Default                              | Purpose                                                              |
| -------------- | ------------------------------------ | -------------------------------------------------------------------- |
| `baseUrl`      | preset                               | endpoint root, without the chat path                                 |
| `apiKeyEnv`    | preset                               | env var holding the key                                              |
| `apiKey`       | –                                    | direct key value; prefer `apiKeyEnv` so secrets stay out of the file |
| `apiKeyHeader` | preset (`authorization` / `api-key`) | header carrying the key                                              |
| `apiKeyPrefix` | preset (`Bearer ` / empty)           | prefix before the key                                                |
| `chatPath`     | preset                               | chat completions path                                                |
| `modelsPath`   | preset                               | used by `air-review models` and `doctor`                             |
| `listModels`   | preset                               | set `false` when the endpoint has no `/models` route                 |
| `timeoutMs`    | `120000`                             | HTTP timeout per model call                                          |
| `headers`      | `{}`                                 | extra static headers                                                 |

## Verify the endpoint

```bash
air-review doctor      # key present? endpoint reachable? models resolvable?
air-review models      # what the endpoint offers, and which roles use it
```

If a reviewer or verifier request fails, review exits with code 30 and surfaces the
provider's error message, including which env var holds the key.

## Two more presets

| Preset id             | What it is                                                                                                                                                                                                                                                                             |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `azure-foundry-agent` | Microsoft Foundry Agent Service: each role model is a **prompt agent name** in a Foundry project (`endpoint.baseUrl` = `https://<resource>.services.ai.azure.com/api/projects/<project>`, Entra ID bearer token). See [foundry.md](foundry.md).                                        |
| `mock`                | Offline, free and deterministic: no network. The reviewer emits findings only from `// air-review:expect SEVERITY category rule-id: title` markers in the diff, the verifier keeps everything, triage echoes the deterministic pre-assessment. For tests, demos and pipeline dry-runs. |

Local model runtimes (Ollama and similar) are not supported: a cold start
and a model download would dominate the review time in a pipeline.

## Microsoft Foundry: the verified inference path

"Microsoft Foundry" (formerly Azure AI Foundry) is the portal; what air-review
talks to is its **OpenAI v1 API**. Three endpoint shapes are documented by
Microsoft and all three work here. Paste whichever the portal shows you; the
tool appends `/openai/v1` itself:

| What the portal shows          | Example                                                           | Works with                                         |
| ------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------- |
| Azure OpenAI resource endpoint | `https://<resource>.openai.azure.com`                             | API key or Entra ID                                |
| Foundry resource endpoint      | `https://<resource>.services.ai.azure.com`                        | API key or Entra ID                                |
| Foundry **project** endpoint   | `https://<resource>.services.ai.azure.com/api/projects/<project>` | Entra ID (recommended); project keys where enabled |

```bash
export AIR_REVIEW_PROVIDER=azure-foundry
export AIR_REVIEW_BASE_URL='https://my-res.services.ai.azure.com/api/projects/my-project'
export AIR_REVIEW_MODEL_REVIEWER=gpt-4.1          # deployment name, not model id
export AIR_REVIEW_MODEL_VERIFIER=gpt-4.1-mini     # deployment name
export AZURE_AI_API_KEY=...                       # key from the resource "Keys and Endpoint"
air-review doctor && air-review dry-run --base origin/main
```

**Entra ID (keyless) instead of a key.** Microsoft recommends Entra ID. Get a
token for the scope `https://ai.azure.com/.default` and hand it over as a bearer
token; the tool switches the header automatically:

```bash
export AIR_REVIEW_ACCESS_TOKEN="$(az account get-access-token --resource https://ai.azure.com --query accessToken -o tsv)"
```

In Azure Pipelines, an `AzureCLI@2` task with a service connection can export
that variable for the review step; the identity needs the
`Cognitive Services OpenAI User` role on the resource. Tokens expire after
about an hour, which is fine for a pipeline step. Equivalent config keys:
`endpoint.auth: bearer` with `endpoint.apiKeyEnv` naming the token variable.

**Models.** `model` is always the **deployment name**. Azure OpenAI models and
the "Foundry Models sold by Azure" (DeepSeek, Grok, MAI, Mistral, Llama…) all
work. Some deployments only speak OpenAI's newer **Responses API**
(`gpt-5-codex` is one: Chat Completions answers `400 The requested operation
is unsupported`). `endpoint.api` is `auto` by default: the first call uses
Chat Completions, and a deployment that rejects it is switched to
`/openai/v1/responses` for the rest of the run, so nothing needs configuring.
Set `endpoint.api: responses` (or `AIR_REVIEW_API=responses`) to skip the
probe, or `chat-completions` to pin the shared protocol.

Verified live on 2026-10-11 against a Foundry resource in Sweden Central:
`doctor` probed three deployments (two `gpt-4.1-mini`, one `gpt-5-codex`)
through an Entra ID bearer token, and a full review ran in 13 s for about
$0.02 with the codex reviewer and a mini verifier.

**Parameters.** Azure presets omit `temperature` and send
`max_completion_tokens`, so reasoning deployments work out of the box. For a
third-party model that insists on `max_tokens`, set
`AIR_REVIEW_MAX_TOKENS_PARAMETER=max_tokens`; `endpoint.temperature` sends an
explicit value.

**No `api-version`.** The v1 route has none. If you see `api-version=2024-…`
in old samples, that is the previous generation of the API.

**Doctor.** Azure endpoints have no `/models` listing, so `air-review doctor`
sends one minimal chat request per distinct role deployment instead (a few
tokens) to prove the key, the URL and the deployment names before any review.

Verified against Microsoft's
[v1 API guide](https://learn.microsoft.com/en-us/azure/foundry/openai/api-version-lifecycle)
and [Foundry Models chat how-to](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/use-chat-reasoning)
on 2026-10-11.

## Amazon Bedrock

AWS exposes two OpenAI-compatible hosts. `bedrock-runtime.<region>.amazonaws.com/openai/v1`
is the one AWS recommends (API key `AWS_BEARER_TOKEN_BEDROCK` or SigV4; no `/models`
route; model ids with a version suffix such as `openai.gpt-oss-120b-1:0`) and is the
preset default. `bedrock-mantle.<region>.api.aws/v1` is the compatibility host (whole
catalogue, `/models` listing, ids without suffix such as `openai.gpt-oss-120b`). Set
`endpoint.baseUrl` to your region and host. AWS SigV4 signing is not implemented; use
an API key. Google here means the Gemini Developer API, not
arbitrary Vertex AI endpoints.
