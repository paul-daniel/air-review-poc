# Amazon Bedrock

`air-review` talks to Amazon Bedrock through its OpenAI-compatible Chat Completions API, authenticated with a **Bedrock API key** (a bearer token). AWS SigV4 signing is not implemented, so the key is the only credential the tool accepts.

Preset id: `bedrock`.

## 1. Enable model access and pick a Region

Bedrock is regional. The API key, the endpoint and the model availability are all tied to one Region. Choose it first and use the same Region everywhere.

Bedrock Runtime endpoints exist in these Regions (October 2026): `us-east-1`, `us-east-2`, `us-west-2`, `ca-central-1`, `sa-east-1`, `eu-west-1`, `eu-west-2`, `eu-west-3`, `eu-central-1`, `eu-central-2`, `eu-north-1`, `eu-south-1`, `eu-south-2`, `ap-south-1`, `ap-south-2`, `ap-northeast-1`, `ap-northeast-2`, `ap-northeast-3`, `ap-southeast-1`, `ap-southeast-2`, plus the GovCloud Regions. Not every model is in every Region: open the model's card in **Models at a glance** and read its Regions table.

| What to do                                    | What you get                      | Where to store it                                   |
| --------------------------------------------- | --------------------------------- | --------------------------------------------------- |
| Pick a Region where your models are available | A Region code such as `eu-west-3` | Inside `AIR_REVIEW_BASE_URL` (step 3); not a secret |

Source: [Bedrock endpoints and quotas](https://docs.aws.amazon.com/general/latest/gr/bedrock.html), [Models at a glance](https://docs.aws.amazon.com/bedrock/latest/userguide/model-cards.html).

## 2. Generate an API key (AWS console)

Sign in to the AWS Management Console with an IAM identity allowed to use the Bedrock console, open <https://console.aws.amazon.com/bedrock>, and select **API keys** in the left navigation pane. Two tabs:

- **Short-term API keys** → **Generate short-term API keys**. The key lasts up to 12 hours or until your console session ends, inherits the permissions of your IAM identity, and is what AWS recommends for production.
- **Long-term API keys** → **Generate long-term API keys** → choose an expiration, optionally **Advanced permissions**, then **Generate**. This creates an IAM user with attached policies. AWS marks long-term keys as "for exploration only".

Switch the console Region before generating: a key only works in the Region it was generated in (otherwise the API answers `Credential should be scoped to a valid region`).

::: warning Which key for which use

- **Your laptop**: a short-term key, regenerated when it expires.
- **A pipeline**: a long-term key in the CI secret store is the simplest, and a reasonable trade-off if you cap its expiry (the `iam:ServiceSpecificCredentialAgeDays` condition can enforce a maximum, for example 90 days) and rotate it. The cleaner alternative is to give the job AWS credentials and mint a short-term key at run time with the `aws-bedrock-token-generator` package (Python, JavaScript or Java), then export it as `AWS_BEARER_TOKEN_BEDROCK` for the review step.
  :::

| What to do                                      | What you get                                      | Where to store it                                                                                                            |
| ----------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Bedrock console → **API keys** → generate a key | A bearer token (long-term keys start with `ABSK`) | `AWS_BEARER_TOKEN_BEDROCK`: shell or git-ignored `.env` locally; GitHub **secret** or Azure DevOps **secret** variable in CI |

Source: [Amazon Bedrock API keys](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html).

## 3. Choose the endpoint

Bedrock exposes two OpenAI-compatible hosts. Both accept the API key as `Authorization: Bearer`.

| Host                               | Base URL                                                   | Notes                                                                                                                                                                                                                                                                                              |
| ---------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bedrock-mantle`                   | `https://bedrock-mantle.<region>.api.aws/v1`               | Compatibility endpoint: the whole catalogue through Chat Completions, and the only one with a `/models` listing. Model ids without version suffix (`openai.gpt-oss-120b`). A few models are served under `/openai/v1` instead of `/v1`; the model card's **Programmatic Access** table says which. |
| `bedrock-runtime` (preset default) | `https://bedrock-runtime.<region>.amazonaws.com/openai/v1` | AWS recommends it for new applications. No `/models` route. Model ids with the version suffix (`openai.gpt-oss-120b-1:0`).                                                                                                                                                                         |

The preset default is `https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1`, the host AWS recommends. Change the Region (or switch to `bedrock-mantle`) with `AIR_REVIEW_BASE_URL`.

| What to do                         | What you get      | Where to store it                                                                       |
| ---------------------------------- | ----------------- | --------------------------------------------------------------------------------------- |
| Build the base URL for your Region | The endpoint root | `AIR_REVIEW_BASE_URL` (variable, not secret) or `endpoint.baseUrl` in `air-review.yaml` |

Source: [Chat Completions API on Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-chat-completions.html).

## 4. Pick model ids

Model ids are the Bedrock ids from the model card, not vendor names. The preset suggests `openai.gpt-oss-120b-1:0` for the reviewer and `openai.gpt-oss-20b-1:0` for the verifier (these are the `bedrock-runtime` spellings; on `bedrock-mantle` use `openai.gpt-oss-120b` and `openai.gpt-oss-20b`). Anthropic Claude, Amazon Nova, DeepSeek, Meta Llama, Mistral and Qwen models are also available; read each card for its exact id, its Regions and the base URL it documents.

On `bedrock-mantle`, list what your key can see:

```bash
curl -s https://bedrock-mantle.eu-west-3.api.aws/v1/models -H "Authorization: Bearer $AWS_BEARER_TOKEN_BEDROCK" | head -c 2000
```

| What to do                              | What you get    | Where to store it                                                     |
| --------------------------------------- | --------------- | --------------------------------------------------------------------- |
| Copy the model ids from the model cards | One id per role | `AIR_REVIEW_MODEL_REVIEWER`, `AIR_REVIEW_MODEL_VERIFIER` (not secret) |

## Environment variables

| Variable                          | Value                                                                                                      | Secret  |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------- |
| `AIR_REVIEW_PROVIDER`             | `bedrock`                                                                                                  | no      |
| `AIR_REVIEW_BASE_URL`             | `https://bedrock-mantle.<region>.api.aws/v1` or `https://bedrock-runtime.<region>.amazonaws.com/openai/v1` | no      |
| `AIR_REVIEW_MODEL_REVIEWER`       | Bedrock model id of the strong model                                                                       | no      |
| `AIR_REVIEW_MODEL_VERIFIER`       | Bedrock model id of the small model                                                                        | no      |
| `AWS_BEARER_TOKEN_BEDROCK`        | The API key (or `AIR_REVIEW_API_KEY` with the same value)                                                  | **yes** |
| `AIR_REVIEW_MAX_TOKENS_PARAMETER` | `max_tokens` if a model rejects `max_completion_tokens`                                                    | no      |
| `AIR_REVIEW_PRICING`              | JSON price table keyed by model id, USD per million tokens                                                 | no      |

Equivalent `air-review.yaml`:

```yaml
version: 1
provider: bedrock
endpoint:
  baseUrl: https://bedrock-runtime.eu-west-3.amazonaws.com/openai/v1
  apiKeyEnv: AWS_BEARER_TOKEN_BEDROCK
models:
  roles:
    reviewer: openai.gpt-oss-120b
    verifier: openai.gpt-oss-20b
    planner: openai.gpt-oss-20b
```

Pipeline snippet (GitHub Actions; the Azure DevOps variable group works the same way):

```yaml
- name: Review
  env:
    GITHUB_TOKEN: ${{ github.token }}
    AIR_REVIEW_PROVIDER: bedrock
    AIR_REVIEW_BASE_URL: ${{ vars.AIR_REVIEW_BASE_URL }}
    AIR_REVIEW_MODEL_REVIEWER: ${{ vars.AIR_REVIEW_MODEL_REVIEWER }}
    AIR_REVIEW_MODEL_VERIFIER: ${{ vars.AIR_REVIEW_MODEL_VERIFIER }}
    AWS_BEARER_TOKEN_BEDROCK: ${{ secrets.AWS_BEARER_TOKEN_BEDROCK }}
  run: air-review review --publish --plain
```

## Verify

```bash
air-review doctor
```

Expected: the endpoint resolved to your Region, the credential found in `AWS_BEARER_TOKEN_BEDROCK`, and a successful probe per model (the preset has no model listing, so `doctor` probes). Then:

```bash
air-review dry-run --base origin/main
```

## Common errors

| Symptom                                         | Cause                                                                                                                                              | Fix                                                                             |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `Credential should be scoped to a valid region` | The key was generated in another Region                                                                                                            | Regenerate the key in the Region of the endpoint, or change the endpoint Region |
| `401` / `403`                                   | Expired short-term key, deactivated long-term key, or missing IAM permission (`bedrock:CallWithBearerToken`, `bedrock-mantle:CallWithBearerToken`) | Regenerate the key; check the IAM policies on the key's user                    |
| `model ... isn't supported on this route`       | Wrong path prefix for this model on `bedrock-mantle`                                                                                               | Use the base URL from the model card's **Programmatic Access** table            |
| `404 UnknownOperationException` on `/models`    | `bedrock-runtime` has no models listing                                                                                                            | Use `bedrock-mantle` for listing, or ignore (`doctor` probes instead)           |
| Model not found                                 | Version-suffixed id on `bedrock-mantle` (or the reverse)                                                                                           | `openai.gpt-oss-120b` on Mantle, `openai.gpt-oss-120b-1:0` on Runtime           |
| Access denied for a model                       | Model access not enabled in this account/Region                                                                                                    | Check model access in the Bedrock console for that Region                       |

More in [Troubleshooting](/troubleshooting).
