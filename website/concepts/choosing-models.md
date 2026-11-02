# Choosing models

The engine consumes **roles**, not models. You decide which model fills each role, and the same configuration works on every provider because every preset speaks the same protocol. This page helps you pick, and explains how the cost is reported.

## The roles

| Role     | Config key              | Called?       | What it needs                                                           |
| -------- | ----------------------- | ------------- | ----------------------------------------------------------------------- |
| reviewer | `models.roles.reviewer` | yes, call 1   | strong reasoning over code; the quality of the review depends on it     |
| verifier | `models.roles.verifier` | yes, call 2   | reliable JSON, good at checking a claim against a quoted snippet; cheap |
| planner  | `models.roles.planner`  | no (reserved) | nothing today; set it to the verifier model so the config is complete   |
| default  | `models.default`        | fallback      | used for any role left unset                                            |

If `planner` is unset it falls back to `reviewer`, then `default`. Per-role overrides exist on the command line: `--model` (reviewer), `--reviewer-model`, `--verifier-model`, `--planner-model`.

## A strong reviewer, a cheap verifier

The reviewer sees the whole evidence bundle (up to 30 000 tokens) and must reason about it; this is where a frontier or codex-class model pays for itself. The verifier sees one finding at a time with 16 lines of code; a small model does this well, and it runs on every finding, so its price matters more than its brilliance.

Starting points by provider (deployment names on Azure):

| Provider          | Reviewer                                | Verifier                    |
| ----------------- | --------------------------------------- | --------------------------- |
| OpenAI            | `gpt-4.1`                               | `gpt-4o-mini`               |
| Microsoft Foundry | a `gpt-5-codex` or `gpt-4.1` deployment | a `gpt-4.1-mini` deployment |
| Amazon Bedrock    | `openai.gpt-oss-120b`                   | `openai.gpt-oss-20b`        |
| Google            | `gemini-3.8-flash`                      | `gemini-3.8-flash`          |
| Mistral           | `mistral-large-latest`                  | `mistral-small-latest`      |

Reasoning models (`gpt-5-codex`, `o`-series, DeepSeek R1) work and often produce the best reviews; they return **reasoning tokens** that count as output and cost accordingly. Azure presets already omit `temperature` and send `max_completion_tokens` so these models work out of the box.

Observed on the demo corpus with a codex reviewer and a mini verifier on Foundry: two calls, 13 to 20 seconds, about $0.02 to $0.03 per review, with part of the input served from the provider's prompt cache.

## Fewer calls when it makes sense

- `--deterministic-only`: zero model calls; only the structural rules run. Free, instant, useful as a fallback for fork pull requests.
- `--no-verifier`: one model call; the deterministic verifier still runs. Cheaper, but model findings are published without the second check.
- Unchanged head and configuration: zero calls, the ledger says "skipped". `--force` overrides.

## Cost reporting

Every run ends with a usage block:

```text
Usage & cost
Estimated cost (USD)  ~$0.0042 · 8.3 s · 2 API calls
Input   3,100 tokens · 1,000 from provider cache
Output  1,000 tokens · 200 reasoning
Cache is included in input; reasoning is included in output.
```

Per-role usage (planner, reviewer, verifier) is recorded with tokens, calls, cache hits and duration. The same record is appended to `.air-review/telemetry.jsonl`, and `air-review telemetry` shows recent runs. Nothing is uploaded.

The dollar figure appears when **every called model is priced**. Prices are USD per million tokens, keyed by model id or deployment name:

```yaml
telemetry:
  pricing:
    review-codex: { input: 1.25, cachedInput: 0.125, output: 10 }
    critic-mini: { input: 0.4, cachedInput: 0.1, output: 1.6 }
```

or, from the environment (overrides the file):

```bash
export AIR_REVIEW_PRICING='{"review-codex":{"input":1.25,"cachedInput":0.125,"output":10},"critic-mini":{"input":0.4,"cachedInput":0.1,"output":1.6}}'
```

`cachedInput` is optional; input counts include cached tokens, output counts include reasoning tokens. Prices change: read them from your provider's pricing page and keep the table in the committed config so the whole team sees the same estimate.

## Mixing vendors

Today all roles share one endpoint. Per-role endpoints (a cheap verifier on one vendor, a strong reviewer on another) are on the roadmap; until then, pick the provider whose catalogue has both a strong and a cheap model.

## Check before you pay

```bash
air-review models                 # what the endpoint offers, and which role uses what
air-review doctor                 # probes each deployment on endpoints without a listing
air-review inspect                # the evidence bundle and its token estimate, no model call
```
