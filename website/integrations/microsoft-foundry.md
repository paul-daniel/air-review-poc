# Microsoft Foundry

This playbook takes you from an empty Azure subscription to a working `air-review` configuration on Microsoft Foundry (formerly Azure AI Foundry), with either an API key or a keyless Microsoft Entra ID token. Each step says what to do, what you get, and where to store it.

Preset id: `azure-foundry`. Azure OpenAI resources (`azure-openai` preset, `https://<resource>.openai.azure.com`) follow the same steps; only the default key variable differs (`AZURE_OPENAI_API_KEY`).

::: tip Before you start
Portal labels change. Every step below was checked against the Microsoft Learn pages linked in that step on 2026-10-11. When a label differs, follow the linked page.
:::

## 1. Create a Foundry resource (Azure portal)

In the Azure portal, open the create form for a Foundry resource: <https://portal.azure.com/#create/Microsoft.CognitiveServicesAIFoundry>. Fill in **Subscription**, **Resource group**, **Region** and **Name**, then **Review + create**. The resource kind is `AIServices`; in the portal it is listed under **Foundry** → **Foundry**.

You need the **Contributor** or **Owner** role on the subscription or resource group to create it.

If you prefer the CLI:

```bash
az login
az group create --name rg-air-review --location swedencentral
az cognitiveservices account create \
  --name my-foundry-resource \
  --resource-group rg-air-review \
  --kind AIServices --sku S0 \
  --location swedencentral \
  --custom-domain my-foundry-resource \
  --assign-identity --allow-project-management true
```

| What to do                                                  | What you get                                                                                 | Where to store it                     |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------- |
| Create the resource (kind `AIServices`) in the Azure portal | A resource name and a resource group; the endpoint appears on the resource **Overview** page | Nowhere yet; the name is not a secret |

Source: [Create a Foundry resource](https://learn.microsoft.com/en-us/azure/ai-services/multi-service-resource).

## 2. Create a project (Foundry portal, optional)

Open <https://ai.azure.com>, make sure the **New Foundry** toggle is on, select the project name in the upper-left corner, then **Create new project**. A project is created on a Foundry resource; the portal creates the resource for you if you skipped step 1.

A project gives you a **project endpoint** of the shape `https://<resource>.services.ai.azure.com/api/projects/<project>`. The project **Home** page shows the endpoint and an API key.

| What to do                                      | What you get                                            | Where to store it                                      |
| ----------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------ |
| Create a project (or reuse the default project) | The project endpoint shown on the project **Home** page | Later, as `AIR_REVIEW_BASE_URL` (variable, not secret) |

Source: [Create a project](https://learn.microsoft.com/en-us/azure/foundry/how-to/create-projects).

## 3. Deploy models

In the Foundry portal, select **Discover** in the upper-right navigation, then **Models** in the left pane. Pick a model, open its card, then **Deploy** → **Default settings** (or **Custom settings** to change the deployment name and type). Repeat for each role you want to fill.

- The **deployment name** is what `air-review` sends in the `model` field. By default it equals the model name; you can rename it.
- Later, **Build** → **Models** lists your deployments. A deployment's detail page shows its endpoint and keys.
- You need the **Cognitive Services Contributor** role (or equivalent) on the resource to create deployments.

Which models work:

- Anything that answers the OpenAI **Chat Completions** API: Azure OpenAI models (`gpt-4.1`, `gpt-4.1-mini`, `gpt-4o`, ...) and the Foundry Models sold by Azure (DeepSeek, Grok, MAI, Mistral, Llama, ...).
- Deployments that only speak the **Responses API**, such as `gpt-5-codex`, work too: the first call uses Chat Completions, the deployment answers `400 unsupported`, and the tool switches to `/openai/v1/responses` for the rest of the run. Nothing to configure. Set `AIR_REVIEW_API=responses` to skip the probe.
- Partner models from Azure Marketplace require a Marketplace subscription before deployment (the portal asks for it).

A sensible starting set: one strong deployment for the `reviewer` role (a codex or `gpt-4.1` class model), one small deployment for the `verifier` role (`gpt-4.1-mini`). See [Choosing models](/concepts/choosing-models).

| What to do                                           | What you get                                                             | Where to store it                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Deploy one model per role from **Discover → Models** | One deployment name per role (for example `review-codex`, `critic-mini`) | `AIR_REVIEW_MODEL_REVIEWER`, `AIR_REVIEW_MODEL_VERIFIER` (variables, not secrets) |

Source: [Deploy Foundry Models](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/deploy-foundry-models), [v1 API model support](https://learn.microsoft.com/en-us/azure/foundry/openai/api-version-lifecycle#model-support).

## 4. Get the endpoint

Three endpoint shapes are documented by Microsoft, and all three work. Paste whichever the portal shows you; `air-review` appends `/openai/v1` itself and never needs an `api-version` parameter.

| What the portal shows          | Shape                                                             | Works with                                        |
| ------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------- |
| Azure OpenAI resource endpoint | `https://<resource>.openai.azure.com`                             | API key or Entra ID                               |
| Foundry resource endpoint      | `https://<resource>.services.ai.azure.com`                        | API key or Entra ID                               |
| Foundry project endpoint       | `https://<resource>.services.ai.azure.com/api/projects/<project>` | Entra ID (recommended); project key where enabled |

Where to read it: Azure portal → your resource → **Overview** (field **Endpoint**), or **Resource Management** → **Keys and Endpoint**. In the Foundry portal the project **Home** page shows the project endpoint.

| What to do                                   | What you get     | Where to store it                                                                                 |
| -------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------- |
| Copy the endpoint from **Keys and Endpoint** | The endpoint URL | `AIR_REVIEW_BASE_URL`: shell, `.env`, GitHub variable or Azure DevOps variable group (not secret) |

Source: [v1 API: base URL formats](https://learn.microsoft.com/en-us/azure/foundry/openai/api-version-lifecycle), [reasoning models on the project endpoint](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/use-chat-reasoning).

## 5a. Credential option A: API key

Azure portal → your resource → **Resource Management** → **Keys and Endpoint** → copy **KEY 1** (or KEY 2). Viewing keys requires a management role such as **Cognitive Services Contributor**; the inference-only role **Cognitive Services OpenAI User** cannot see them.

The key travels in the `api-key` header; the preset sets this for you.

| What to do                        | What you get        | Where to store it                                                                                                                                                                   |
| --------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Copy KEY 1 from Keys and Endpoint | A 32+ character key | `AZURE_AI_API_KEY` (or `AIR_REVIEW_API_KEY`). Locally: shell export or `.env` (git-ignored). CI: GitHub **secret**, Azure DevOps variable group **secret** (lock icon) or Key Vault |

::: danger Keys are secrets
Never paste a key into `air-review.yaml`, a pipeline YAML or a chat. Rotate it from **Keys and Endpoint** → **Regenerate** if it leaks.
:::

Source: [Role-based access control: Keys and Endpoint](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/role-based-access-control).

## 5b. Credential option B: Microsoft Entra ID (keyless)

Microsoft recommends Entra ID. No key exists to rotate; a short-lived token (about one hour) is minted for an identity that has a role on the resource.

### Assign the role

Azure portal → your resource → **Access control (IAM)** → **Add** → **Add role assignment** → role **Cognitive Services OpenAI User** → **Members**: your user (local) or the service principal of your pipeline's service connection (CI) → **Review + assign**. Role assignments can take up to five minutes to apply.

### Locally

```bash
az login
export AIR_REVIEW_ACCESS_TOKEN="$(az account get-access-token --resource https://ai.azure.com --query accessToken -o tsv)"
```

The token is a JWT; the tool sends it as `Authorization: Bearer` automatically (`AIR_REVIEW_AUTH=bearer` is implied). The scope is `https://ai.azure.com/.default`. Re-run the `export` when a command answers `401`.

### In Azure Pipelines

An interactive `az login` is impossible in a pipeline. Use an **Azure Resource Manager service connection** and the `AzureCLI@2` task, which signs in with the service connection's identity. The task mints the token and hands it to the review step as a secret variable:

```yaml
steps:
  - task: AzureCLI@2
    displayName: Get a Foundry token
    inputs:
      azureSubscription: my-service-connection # Azure Resource Manager service connection
      scriptType: bash
      scriptLocation: inlineScript
      inlineScript: |
        TOKEN="$(az account get-access-token --resource https://ai.azure.com --query accessToken -o tsv)"
        echo "##vso[task.setvariable variable=AIR_REVIEW_ACCESS_TOKEN;issecret=true]$TOKEN"

  - script: air-review review --publish
    displayName: Air Review
    env:
      AIR_REVIEW_ACCESS_TOKEN: $(AIR_REVIEW_ACCESS_TOKEN) # secret variables must be mapped explicitly
      SYSTEM_ACCESSTOKEN: $(System.AccessToken)
```

Grant **Cognitive Services OpenAI User** to the service connection's identity (its service principal or managed identity) on the Foundry resource. The full pipeline is in [Azure DevOps](/integrations/azure-devops).

| What to do                                                   | What you get               | Where to store it                                                                                                      |
| ------------------------------------------------------------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Assign **Cognitive Services OpenAI User**, then mint a token | A JWT valid about one hour | `AIR_REVIEW_ACCESS_TOKEN`: shell variable locally; secret pipeline variable set by `AzureCLI@2` in CI. Never in a file |

Source: [Entra ID authentication](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/managed-identity), [AzureCLI@2 task](https://learn.microsoft.com/en-us/azure/devops/pipelines/tasks/reference/azure-cli-v2), [set secret variables from scripts](https://learn.microsoft.com/en-us/azure/devops/pipelines/process/set-variables-scripts).

## 6. Pricing variables (optional)

Azure endpoints do not return prices. To get a dollar estimate in the output and in the summary, give `air-review` a pricing table keyed by **deployment name**, in USD per million tokens:

```bash
export AIR_REVIEW_PRICING='{"review-codex":{"input":1.25,"cachedInput":0.125,"output":10},"critic-mini":{"input":0.4,"cachedInput":0.1,"output":1.6}}'
```

The same table can live in `air-review.yaml` under `telemetry.pricing`. Every called deployment must be priced for a total to appear; `cachedInput` is optional. Read the current rates on the Azure pricing page for your region; they change.

| What to do                                   | What you get             | Where to store it                                                                         |
| -------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------- |
| Write the per-deployment price table as JSON | A cost line in every run | `AIR_REVIEW_PRICING` variable (not secret) or `telemetry.pricing` in the committed config |

## Environment variables

| Variable                          | Value                                                                                              | Secret  |
| --------------------------------- | -------------------------------------------------------------------------------------------------- | ------- |
| `AIR_REVIEW_PROVIDER`             | `azure-foundry` (or `azure-openai` for an Azure OpenAI resource)                                   | no      |
| `AIR_REVIEW_BASE_URL`             | Resource or project endpoint; `/openai/v1` is appended automatically                               | no      |
| `AIR_REVIEW_MODEL_REVIEWER`       | Deployment name of the strong model                                                                | no      |
| `AIR_REVIEW_MODEL_VERIFIER`       | Deployment name of the small model                                                                 | no      |
| `AIR_REVIEW_MODEL_PLANNER`        | Reserved; the planner is deterministic today. Point it at the verifier deployment                  | no      |
| `AZURE_AI_API_KEY`                | Option A: the key from Keys and Endpoint (`AZURE_OPENAI_API_KEY` for `azure-openai`)               | **yes** |
| `AIR_REVIEW_API_KEY`              | Option A alternative: same key under the generic name                                              | **yes** |
| `AIR_REVIEW_ACCESS_TOKEN`         | Option B: Entra ID token for scope `https://ai.azure.com/.default`                                 | **yes** |
| `AIR_REVIEW_API`                  | `auto` (default), `responses` or `chat-completions`                                                | no      |
| `AIR_REVIEW_MAX_TOKENS_PARAMETER` | `max_completion_tokens` (Azure default) or `max_tokens` for a third-party model that insists on it | no      |
| `AIR_REVIEW_PRICING`              | JSON price table keyed by deployment name                                                          | no      |

Equivalent `air-review.yaml` (committed, no secrets):

```yaml
version: 1
provider: azure-foundry
endpoint:
  baseUrl: https://my-foundry-resource.services.ai.azure.com
  apiKeyEnv: AZURE_AI_API_KEY # ignored when AIR_REVIEW_ACCESS_TOKEN is set
models:
  roles:
    reviewer: review-codex
    verifier: critic-mini
    planner: critic-mini
telemetry:
  pricing:
    review-codex: { input: 1.25, cachedInput: 0.125, output: 10 }
    critic-mini: { input: 0.4, cachedInput: 0.1, output: 1.6 }
```

## Verify

```bash
air-review doctor
```

Expected: the endpoint resolved to `…/openai/v1`, the credential found in `AZURE_AI_API_KEY` or `AIR_REVIEW_ACCESS_TOKEN`, and one probe line per distinct deployment with a response time. Azure has no `/models` listing, so `doctor` sends one minimal chat request per deployment (a few tokens) to prove the key, the URL and the deployment names.

```bash
air-review dry-run --base origin/main
```

Expected: a full review, nothing published, a "Usage & cost" block with real token counts.

## Common errors

| Symptom                                      | Cause                                                                | Fix                                                                                           |
| -------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `401` on every probe                         | Wrong key, or a token for the wrong scope, or an expired token       | Re-copy KEY 1; mint the token with `--resource https://ai.azure.com`; re-run the `export`     |
| `403` / `PermissionDenied` with Entra ID     | The identity has no role on the resource, or the assignment is fresh | Assign **Cognitive Services OpenAI User** on the resource; wait up to five minutes            |
| `404` on a deployment                        | The role model is a model id, not your deployment name               | Use the deployment name from **Build → Models**                                               |
| `400 The requested operation is unsupported` | The deployment only speaks the Responses API                         | Nothing: `AIR_REVIEW_API=auto` switches automatically; pin `responses` to skip the probe      |
| `400` about `max_tokens` / `temperature`     | A third-party model rejects Azure defaults                           | `AIR_REVIEW_MAX_TOKENS_PARAMETER=max_tokens`; set `endpoint.temperature` explicitly if needed |
| `api-version` errors in old samples          | Those samples target the previous API generation                     | Ignore them; the v1 route has no `api-version`                                                |
| No cost line                                 | A called deployment is missing from the price table                  | Price every deployment used by `reviewer` and `verifier`                                      |

More in [Troubleshooting](/troubleshooting).
