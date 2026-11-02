# Other providers

Every provider below speaks the OpenAI Chat Completions protocol, so the integration is always the same three facts: a **preset id**, a **key variable** and, for a custom gateway, a **base URL**. The preset fills in the vendor's URL and header conventions; anything it sets can be overridden in the `endpoint` section of `air-review.yaml`.

For each provider you will find where the key comes from, the variables, and a pipeline snippet. Store the key as a secret in your CI (GitHub **secret**, Azure DevOps **secret** variable or Key Vault) and in a git-ignored `.env` locally; never in a committed file.

::: tip Console paths change
The key-creation pages below were checked on 2026-10-11. When a label differs, look for "API keys" in the provider's console or follow the linked documentation.
:::

## Summary

| Preset id           | Vendor        | Default base URL                                          | Key variable         | `/models`    |
| ------------------- | ------------- | --------------------------------------------------------- | -------------------- | ------------ |
| `openai`            | OpenAI        | `https://api.openai.com/v1`                               | `OPENAI_API_KEY`     | yes          |
| `anthropic`         | Anthropic     | `https://api.anthropic.com/v1`                            | `ANTHROPIC_API_KEY`  | no           |
| `google`            | Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | `GEMINI_API_KEY`     | yes          |
| `mistral`           | Mistral       | `https://api.mistral.ai/v1`                               | `MISTRAL_API_KEY`    | yes          |
| `groq`              | Groq          | `https://api.groq.com/openai/v1`                          | `GROQ_API_KEY`       | yes          |
| `openrouter`        | OpenRouter    | `https://openrouter.ai/api/v1`                            | `OPENROUTER_API_KEY` | yes          |
| `together`          | Together AI   | `https://api.together.ai/v1`                              | `TOGETHER_API_KEY`   | yes          |
| `fireworks`         | Fireworks AI  | `https://api.fireworks.ai/inference/v1`                   | `FIREWORKS_API_KEY`  | yes          |
| `openai-compatible` | Your gateway  | required (`AIR_REVIEW_BASE_URL`)                          | `AIR_REVIEW_API_KEY` | configurable |

`AIR_REVIEW_API_KEY` always works as a generic alternative to the preset's key variable, which is convenient when one CI secret name must serve every provider.

## OpenAI

- **Key**: OpenAI platform → your profile or organization settings → **API keys** → create a key. The key is shown once.
- **Models**: `gpt-4.1` as reviewer, `gpt-4o-mini` as verifier is the preset's suggestion.

```bash
export AIR_REVIEW_PROVIDER=openai
export OPENAI_API_KEY=sk-...
export AIR_REVIEW_MODEL_REVIEWER=gpt-4.1
export AIR_REVIEW_MODEL_VERIFIER=gpt-4o-mini
```

```yaml
- name: Review
  env:
    GITHUB_TOKEN: ${{ github.token }}
    AIR_REVIEW_PROVIDER: openai
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    AIR_REVIEW_MODEL_REVIEWER: gpt-4.1
    AIR_REVIEW_MODEL_VERIFIER: gpt-4o-mini
  run: air-review review --publish --plain
```

Documentation: [OpenAI API reference](https://platform.openai.com/docs/api-reference/chat).

## Anthropic

- **Key**: Claude Console → **Settings** → **API keys** (<https://platform.claude.com/settings/keys>).
- **Endpoint**: Anthropic's OpenAI-compatibility layer at `https://api.anthropic.com/v1`. Anthropic documents it as a way to test and compare models rather than a long-term production path; the native Claude API is not used by `air-review`.
- **Known limitation**: the compatibility layer ignores `response_format`. `air-review` asks for JSON in the prompt and parses answers wrapped in prose or code fences, so reviews work, but expect an occasional parsing retry. Model ids are Claude model names, for example `claude-sonnet-4-6`.

```bash
export AIR_REVIEW_PROVIDER=anthropic
export ANTHROPIC_API_KEY=sk-ant-...
export AIR_REVIEW_MODEL_REVIEWER=claude-sonnet-4-6
export AIR_REVIEW_MODEL_VERIFIER=claude-haiku-4-5
```

```yaml
- name: Review
  env:
    GITHUB_TOKEN: ${{ github.token }}
    AIR_REVIEW_PROVIDER: anthropic
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    AIR_REVIEW_MODEL_REVIEWER: ${{ vars.AIR_REVIEW_MODEL_REVIEWER }}
    AIR_REVIEW_MODEL_VERIFIER: ${{ vars.AIR_REVIEW_MODEL_VERIFIER }}
  run: air-review review --publish --plain
```

Documentation: [OpenAI SDK compatibility](https://platform.claude.com/docs/en/api/openai-sdk).

## Google Gemini

- **Key**: Google AI Studio → **Get API key** (<https://aistudio.google.com/>). This is the Gemini Developer API, not Vertex AI.
- **Endpoint**: `https://generativelanguage.googleapis.com/v1beta/openai`.

```bash
export AIR_REVIEW_PROVIDER=google
export GEMINI_API_KEY=AIza...
export AIR_REVIEW_MODEL_REVIEWER=gemini-3.8-flash
export AIR_REVIEW_MODEL_VERIFIER=gemini-3.8-flash
```

```yaml
- name: Review
  env:
    GITHUB_TOKEN: ${{ github.token }}
    AIR_REVIEW_PROVIDER: google
    GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
    AIR_REVIEW_MODEL_REVIEWER: ${{ vars.AIR_REVIEW_MODEL_REVIEWER }}
  run: air-review review --publish --plain
```

Documentation: [OpenAI compatibility for the Gemini API](https://ai.google.dev/gemini-api/docs/openai).

## Mistral

- **Key**: Mistral Studio (<https://console.mistral.ai/>) → **API keys**; check the console, the exact label may differ.
- **Models**: `mistral-large-latest` as reviewer, `mistral-small-latest` as verifier is the preset's suggestion.

```bash
export AIR_REVIEW_PROVIDER=mistral
export MISTRAL_API_KEY=...
export AIR_REVIEW_MODEL_REVIEWER=mistral-large-latest
export AIR_REVIEW_MODEL_VERIFIER=mistral-small-latest
```

```yaml
- name: Review
  env:
    GITHUB_TOKEN: ${{ github.token }}
    AIR_REVIEW_PROVIDER: mistral
    MISTRAL_API_KEY: ${{ secrets.MISTRAL_API_KEY }}
    AIR_REVIEW_MODEL_REVIEWER: mistral-large-latest
    AIR_REVIEW_MODEL_VERIFIER: mistral-small-latest
  run: air-review review --publish --plain
```

Documentation: [Mistral API reference](https://docs.mistral.ai/api/).

## Groq

- **Key**: Groq Console → **API Keys** (<https://console.groq.com/keys>).
- **Endpoint**: `https://api.groq.com/openai/v1`. Model ids are the ids listed in the console.

```bash
export AIR_REVIEW_PROVIDER=groq
export GROQ_API_KEY=gsk_...
export AIR_REVIEW_MODEL_REVIEWER=<model id from the console>
air-review models   # lists what the key can use
```

```yaml
- name: Review
  env:
    GITHUB_TOKEN: ${{ github.token }}
    AIR_REVIEW_PROVIDER: groq
    GROQ_API_KEY: ${{ secrets.GROQ_API_KEY }}
    AIR_REVIEW_MODEL_REVIEWER: ${{ vars.AIR_REVIEW_MODEL_REVIEWER }}
    AIR_REVIEW_MODEL_VERIFIER: ${{ vars.AIR_REVIEW_MODEL_VERIFIER }}
  run: air-review review --publish --plain
```

Documentation: [Groq OpenAI compatibility](https://console.groq.com/docs/openai).

## OpenRouter

- **Key**: OpenRouter → your account → **Keys**; check the site, the exact label may differ.
- **Models**: ids are `vendor/model` slugs (for example `openai/gpt-4.1`). `air-review models` lists them.

```bash
export AIR_REVIEW_PROVIDER=openrouter
export OPENROUTER_API_KEY=sk-or-...
export AIR_REVIEW_MODEL_REVIEWER=openai/gpt-4.1
export AIR_REVIEW_MODEL_VERIFIER=openai/gpt-4o-mini
```

```yaml
- name: Review
  env:
    GITHUB_TOKEN: ${{ github.token }}
    AIR_REVIEW_PROVIDER: openrouter
    OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
    AIR_REVIEW_MODEL_REVIEWER: ${{ vars.AIR_REVIEW_MODEL_REVIEWER }}
    AIR_REVIEW_MODEL_VERIFIER: ${{ vars.AIR_REVIEW_MODEL_VERIFIER }}
  run: air-review review --publish --plain
```

Documentation: [OpenRouter quickstart](https://openrouter.ai/docs/quickstart).

## Together AI

- **Key**: Together settings → **API keys** (<https://api.together.ai/settings/projects/~current/api-keys>).
- **Endpoint**: the preset default is `https://api.together.ai/v1`. Together's current documentation gives `https://api.together.ai/v1`; if the default answers with a DNS or certificate error, set `AIR_REVIEW_BASE_URL=https://api.together.ai/v1`.

```bash
export AIR_REVIEW_PROVIDER=together
export TOGETHER_API_KEY=...
export AIR_REVIEW_MODEL_REVIEWER=<model id from the console>
```

```yaml
- name: Review
  env:
    GITHUB_TOKEN: ${{ github.token }}
    AIR_REVIEW_PROVIDER: together
    TOGETHER_API_KEY: ${{ secrets.TOGETHER_API_KEY }}
    AIR_REVIEW_MODEL_REVIEWER: ${{ vars.AIR_REVIEW_MODEL_REVIEWER }}
  run: air-review review --publish --plain
```

Documentation: [Together OpenAI API compatibility](https://docs.together.ai/docs/openai-api-compatibility).

## Fireworks AI

- **Key**: Fireworks console → account settings → **API keys**; check the console, the exact label may differ.
- **Endpoint**: `https://api.fireworks.ai/inference/v1`. Model ids look like `accounts/fireworks/models/<name>`.

```bash
export AIR_REVIEW_PROVIDER=fireworks
export FIREWORKS_API_KEY=fw_...
export AIR_REVIEW_MODEL_REVIEWER=<model id from the console>
```

```yaml
- name: Review
  env:
    GITHUB_TOKEN: ${{ github.token }}
    AIR_REVIEW_PROVIDER: fireworks
    FIREWORKS_API_KEY: ${{ secrets.FIREWORKS_API_KEY }}
    AIR_REVIEW_MODEL_REVIEWER: ${{ vars.AIR_REVIEW_MODEL_REVIEWER }}
  run: air-review review --publish --plain
```

Documentation: [Fireworks OpenAI compatibility](https://docs.fireworks.ai/tools-sdks/openai-compatibility).

## Custom gateway (`openai-compatible`)

For an internal gateway (LiteLLM, an API-management front door, a vendor proxy) that exposes `/chat/completions`:

```bash
export AIR_REVIEW_PROVIDER=openai-compatible
export AIR_REVIEW_BASE_URL=https://llm-gateway.example.internal/v1
export AIR_REVIEW_API_KEY=...
export AIR_REVIEW_MODEL_REVIEWER=<name the gateway routes>
```

Everything about the wire format is adjustable in `air-review.yaml`:

```yaml
provider: openai-compatible
endpoint:
  baseUrl: https://llm-gateway.example.internal/v1
  apiKeyEnv: AIR_REVIEW_API_KEY
  apiKeyHeader: authorization # or "x-api-key", "api-key"
  apiKeyPrefix: "Bearer " # "" for a bare key
  chatPath: /chat/completions
  modelsPath: /models
  listModels: true # false when the gateway has no /models route
  timeoutMs: 120000
  headers:
    X-Org: platform-team # extra static headers (routing, cost center)
```

OAuth gateways: put the short-lived token in `AIR_REVIEW_ACCESS_TOKEN` (sent as `Authorization: Bearer`) instead of a key.

## Verify

```bash
air-review doctor      # key found? endpoint reachable? models resolvable?
air-review models      # what the endpoint offers, and which role uses what
air-review dry-run --base origin/main
```

## Common errors

| Symptom                         | Cause                                                      | Fix                                                                               |
| ------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `401`                           | Missing or wrong key, or wrong variable name               | `doctor` prints which variable was read; set that one                             |
| `404` on chat completions       | Model id unknown at this endpoint                          | `air-review models`; copy an exact id                                             |
| `429`                           | Vendor rate limit                                          | Smaller verifier model, retry later, or raise `endpoint.timeoutMs`                |
| Parse error on the model answer | Provider without JSON mode (Anthropic compatibility layer) | Usually recovered automatically; pick a model that follows JSON instructions well |
| `ENOTFOUND` / certificate error | Wrong base URL (for example Together's host change)        | Set `AIR_REVIEW_BASE_URL` to the URL in the vendor's documentation                |

More in [Troubleshooting](/troubleshooting).
