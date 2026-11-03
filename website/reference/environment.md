# Environment variables

Environment variables override `air-review.yaml` and work even when no file exists, which is the intended way to parameterize a pipeline. The template `.env.example` in the repository lists every name with a placeholder value; copy it to `.env` (git-ignored) for local use.

Secrets are marked **yes**: store them in a CI secret store or a git-ignored `.env`, never in a committed file.

## Provider

| Variable                          | Secret  | Meaning                                                                                                                                                                                                                                                                            |
| --------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AIR_REVIEW_PROVIDER`             | no      | preset id: `openai`, `azure-openai`, `azure-foundry`, `bedrock`, `google`, `anthropic`, `mistral`, `groq`, `openrouter`, `together`, `fireworks`, `openai-compatible`                                                                                                              |
| `AIR_REVIEW_BASE_URL`             | no      | endpoint root, without the chat path; overrides the preset default                                                                                                                                                                                                                 |
| `AIR_REVIEW_API_KEY`              | **yes** | the key value itself (simplest for CI secret stores)                                                                                                                                                                                                                               |
| `AIR_REVIEW_API_KEY_ENV`          | no      | the **name** of another variable that holds the key                                                                                                                                                                                                                                |
| `AIR_REVIEW_ACCESS_TOKEN`         | **yes** | short-lived token (Microsoft Entra ID, OAuth gateways); sent as `Authorization: Bearer`, implies `AIR_REVIEW_AUTH=bearer`. On Foundry presets, with no key and no token set, keyless Entra ID (`DefaultAzureCredential`: `az login`, managed identity, service connection) is used |
| `AIR_REVIEW_AUTH`                 | no      | `api-key` or `bearer`                                                                                                                                                                                                                                                              |
| `AIR_REVIEW_API`                  | no      | `auto` (default), `chat-completions` or `responses`                                                                                                                                                                                                                                |
| `AIR_REVIEW_MAX_TOKENS_PARAMETER` | no      | `max_tokens` or `max_completion_tokens` (Azure defaults to the latter)                                                                                                                                                                                                             |

### Preset key variables

Each preset reads its own variable when `AIR_REVIEW_API_KEY` and `AIR_REVIEW_API_KEY_ENV` are not set. Set only the one you use.

| Variable                   | Preset                                                 | Secret  |
| -------------------------- | ------------------------------------------------------ | ------- |
| `OPENAI_API_KEY`           | `openai`                                               | **yes** |
| `AZURE_OPENAI_API_KEY`     | `azure-openai`                                         | **yes** |
| `AZURE_AI_API_KEY`         | `azure-foundry` (optional: keyless Entra ID otherwise) | **yes** |
| `AWS_BEARER_TOKEN_BEDROCK` | `bedrock` (API key, not SigV4)                         | **yes** |
| `GEMINI_API_KEY`           | `google`                                               | **yes** |
| `ANTHROPIC_API_KEY`        | `anthropic`                                            | **yes** |
| `MISTRAL_API_KEY`          | `mistral`                                              | **yes** |
| `GROQ_API_KEY`             | `groq`                                                 | **yes** |
| `OPENROUTER_API_KEY`       | `openrouter`                                           | **yes** |
| `TOGETHER_API_KEY`         | `together`                                             | **yes** |
| `FIREWORKS_API_KEY`        | `fireworks`                                            | **yes** |

## Model roles

| Variable                                     | Secret | Meaning                                                    |
| -------------------------------------------- | ------ | ---------------------------------------------------------- |
| `AIR_REVIEW_MODEL`                           | no     | shortcut for the reviewer model                            |
| `AIR_REVIEW_MODEL_REVIEWER`                  | no     | reviewer role (model call 1)                               |
| `AIR_REVIEW_MODEL_VERIFIER`                  | no     | verifier role (model call 2)                               |
| `AIR_REVIEW_MODEL_PLANNER`                   | no     | planner role; reserved, the planner is deterministic today |
| `AIR_REVIEW_MODEL_TRIAGE`                    | no     | triage role (complexity tier)                              |
| `AIR_REVIEW_MODEL_REVIEWER_LIGHT` / `_HEAVY` | no     | reviewer per complexity tier                               |
| `AIR_REVIEW_MODEL_VERIFIER_LIGHT` / `_HEAVY` | no     | verifier per complexity tier                               |
| `AIR_REVIEW_ROUTING_MODE`                    | no     | `deterministic`, `hybrid` (default) or `model`             |

On Azure these are **deployment names**, not model ids.

## Configuration file

| Variable            | Secret | Meaning                                                                                        |
| ------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| `AIR_REVIEW_CONFIG` | no     | path to the config file (otherwise `air-review.{yaml,yml,json,toml}` in the current directory) |

## GitHub adapter

| Variable            | Secret  | Meaning                                                                                                            |
| ------------------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| `GITHUB_TOKEN`      | **yes** | token for reading the PR and publishing; in Actions `github.token` with `pull-requests: write` and `issues: write` |
| `GH_TOKEN`          | **yes** | alternative name, read after the variable named by `platform.github.tokenEnv` and before `GITHUB_TOKEN`            |
| `GITHUB_ACTIONS`    | no      | set by the runner                                                                                                  |
| `GITHUB_REPOSITORY` | no      | `owner/repo`, set by the runner                                                                                    |
| `GITHUB_EVENT_NAME` | no      | `pull_request` triggers detection                                                                                  |
| `GITHUB_EVENT_PATH` | no      | path to the event payload (PR number, SHAs)                                                                        |

## Azure DevOps adapter

| Variable                             | Secret  | Meaning                                                                                               |
| ------------------------------------ | ------- | ----------------------------------------------------------------------------------------------------- |
| `SYSTEM_ACCESSTOKEN`                 | **yes** | the job token, mapped on the step as `$(System.AccessToken)`; default `platform.azureDevops.tokenEnv` |
| `AZURE_DEVOPS_ACCESS_TOKEN`          | **yes** | Entra ID access token for Azure DevOps, sent as `Bearer`                                              |
| `AZURE_DEVOPS_EXT_PAT`               | **yes** | personal access token for manual runs (scope Code: Read & write), sent as `Basic`                     |
| `AZURE_DEVOPS_TOKEN`                 | **yes** | same, alternative name                                                                                |
| `TF_BUILD`                           | no      | `True` on every Azure Pipelines job; set by the agent                                                 |
| `SYSTEM_TEAMFOUNDATIONCOLLECTIONURI` | no      | organization URL; set by the agent                                                                    |
| `SYSTEM_TEAMPROJECT`                 | no      | project; set by the agent                                                                             |
| `SYSTEM_PULLREQUEST_PULLREQUESTID`   | no      | pull request id; present only in build-validation runs                                                |
| `BUILD_REPOSITORY_ID`                | no      | repository GUID; set by the agent                                                                     |
| `BUILD_REPOSITORY_NAME`              | no      | repository name; fallback for the GUID                                                                |
| `BUILD_REPOSITORY_PROVIDER`          | no      | `TfsGit` for Azure Repos; anything else makes the tool fall back to local mode                        |

Only set the agent variables by hand to simulate a pipeline locally; `--ci azure-devops --org --project --repo --pr` does the same.

## Output and colors

| Variable               | Secret | Meaning                                                       |
| ---------------------- | ------ | ------------------------------------------------------------- |
| `AIR_REVIEW_PLAIN`     | no     | `1` = plain ASCII logs (same as `--plain`)                    |
| `AIR_REVIEW_ANIMATION` | no     | `0` = no spinner or report reveal (same as `--no-animation`)  |
| `NO_COLOR`             | no     | any value disables color (<https://no-color.org>)             |
| `FORCE_COLOR`          | no     | `0` disables, any other value forces color even without a TTY |
| `TERM`                 | no     | `dumb` disables colors and animation                          |

## Telemetry

| Variable             | Secret | Meaning                                                                                                         |
| -------------------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| `AIR_REVIEW_PRICING` | no     | pricing table as JSON, USD per million tokens, keyed by model or deployment name; overrides `telemetry.pricing` |

Example: `{"gpt-4.1":{"input":2,"cachedInput":0.5,"output":8}}`. Telemetry is local only; nothing is ever uploaded.

## Bitbucket and GitLab (read by your pipeline, not by the tool)

| Variable                              | Meaning                                                         |
| ------------------------------------- | --------------------------------------------------------------- |
| `BITBUCKET_PR_DESTINATION_BRANCH`     | pass it as `--base origin/$BITBUCKET_PR_DESTINATION_BRANCH`     |
| `CI_MERGE_REQUEST_TARGET_BRANCH_NAME` | pass it as `--base origin/$CI_MERGE_REQUEST_TARGET_BRANCH_NAME` |

See [Bitbucket and GitLab](/integrations/bitbucket-gitlab).
