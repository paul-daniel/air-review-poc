# Live check: first real run on Microsoft Foundry and Azure DevOps

Everything below is keyless: it uses your signed-in Azure CLI to mint
short-lived Microsoft Entra ID tokens, so no API key or PAT is ever written to
a file or a shell history. Each token lives about an hour; re-run the `export`
line when a command answers `401`.

## 0. Sign in once

```bash
az login --use-device-code
```

Open the URL it prints, enter the code, pick the "Azure Daniel Lab" account.

## 1. Your Foundry resource and its deployments

Read from the Azure portal on 2026-10-11 (subscription "Azure Daniel Lab"):

|                |                                                        |
| -------------- | ------------------------------------------------------ |
| Resource       | `airreview-resource` (kind AIServices, Sweden Central) |
| Resource group | `rg-dantchatchouang-4491`                              |
| API endpoint   | `https://airreview-resource.services.ai.azure.com/`    |

Its deployments on 2026-10-11 (names are what `AIR_REVIEW_MODEL_*` take):

| Deployment                                                                                    | Model        | Suggested role                                   |
| --------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------ |
| `airreview-review-codex`                                                                      | gpt-5-codex  | reviewer (Responses API, selected automatically) |
| `airreview-critic-mini`                                                                       | gpt-4.1-mini | verifier                                         |
| `airreview-planning-mini`                                                                     | gpt-4.1-mini | planner (reserved, no call today)                |
| `airreview-context-mini`, `airreview-context-worker-mini`, `airreview-context-synthesis-mini` | gpt-4.1-mini | reserved for the future context explorer         |
| `airreview-fix-codex`                                                                         | gpt-5-codex  | reserved (automatic fix proposals)               |

All chat deployments have the default **10,000 tokens-per-minute** quota
(New Foundry → airreview-resource → Models + endpoints → "Rate limit"). One
codex review uses about 12,000 tokens, so two reviews in the same minute hit
`429` (retried automatically, but slower). Before running pipelines in
parallel, raise `airreview-review-codex` to 50K TPM (edit the deployment,
"Tokens per minute rate limit"); it changes no price, only the ceiling.

The New Foundry portal shows two endpoints for the resource: "Project
endpoint" `https://airreview-resource.services.ai.azure.com/api/projects/`
(no project exists yet, which is fine for air-review) and "Azure OpenAI
endpoint" `https://airreview-resource.openai.azure.com/`. Both are accepted
as `AIR_REVIEW_BASE_URL`.

To re-list them:

```bash
az cognitiveservices account deployment list -n airreview-resource -g rg-dantchatchouang-4491 --query "[].{deployment:name, model:properties.model.name, version:properties.model.version}" -o table
```

## 2. Run the review against the demo corpus

```bash
cd /Users/pauldaniel/Documents/ChatGPT/AirReview2 && npm run build && npm run demo 2>/dev/null; cd test/fixtures/work/airreview-demo
```

```bash
export AIR_REVIEW_PROVIDER=azure-foundry
export AIR_REVIEW_BASE_URL='https://airreview-resource.services.ai.azure.com'   # /openai/v1 is appended automatically
export AIR_REVIEW_MODEL_REVIEWER=airreview-review-codex
export AIR_REVIEW_MODEL_VERIFIER=airreview-critic-mini
export AIR_REVIEW_MODEL_PLANNER=airreview-planning-mini
export AIR_REVIEW_PRICING='{"airreview-review-codex":{"input":1.25,"cachedInput":0.125,"output":10},"airreview-critic-mini":{"input":0.4,"cachedInput":0.1,"output":1.6}}'
export AIR_REVIEW_ACCESS_TOKEN="$(az account get-access-token --resource https://ai.azure.com --query accessToken -o tsv)"
```

```bash
node ../../../../dist/cli/index.js doctor
```

`doctor` must show the endpoint resolved to `…/openai/v1`, the credential found
in `AIR_REVIEW_ACCESS_TOKEN`, and one probe line per deployment with a response
time. If the probe fails with `401`, the identity needs the
`Cognitive Services OpenAI User` role on the resource (Azure portal → the
resource → Access control (IAM)).

```bash
node ../../../../dist/cli/index.js inspect --ci local --base main
```

```bash
node ../../../../dist/cli/index.js dry-run --ci local --base main --force --no-cache
```

Expected: the deterministic subscription finding in `widget.component.ts`, and
with a good model a second finding on `price.ts` (the discount divides by 1
instead of 100). `safe.component.ts` and `legacy.component.ts` must stay clean.
The "Usage & cost" block shows real token counts; add prices with
`AIR_REVIEW_PRICING` to get a dollar figure.

## 2b. Dry-run a public GitHub pull request (no token needed)

Done on 2026-10-11 against `angular/components#31439`. Any public PR works:

```bash
git clone --filter=blob:none --no-checkout https://github.com/angular/components.git /tmp/components && cd /tmp/components && git fetch origin pull/31439/head:pr && git checkout pr
```

```bash
air-review dry-run --ci github --owner angular --repo components --pr 31439
```

Reads use the unauthenticated API (60 requests per hour); publishing needs
`GITHUB_TOKEN`.

## 3. Dry-run a real Azure DevOps pull request

```bash
export AZURE_DEVOPS_ACCESS_TOKEN="$(az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798 --query accessToken -o tsv)"
```

From a clone of the repository that owns the PR (fetch the target branch
first, `git fetch origin main`):

```bash
air-review dry-run --ci azure-devops --org https://dev.azure.com/<org> --project <project> --repo <repository> --pr <id>
```

`dry-run` publishes nothing. When the output looks right, the same command with
`review --publish` creates the threads; `air-review explain` lists them
afterwards. Remove the three tokens from your shell when done:
`unset AIR_REVIEW_ACCESS_TOKEN AZURE_DEVOPS_ACCESS_TOKEN`.
