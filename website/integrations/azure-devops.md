# Azure DevOps (Azure Repos + Azure Pipelines)

`air-review` reviews Azure Repos pull requests from an Azure Pipelines build-validation run and publishes its findings as pull-request threads. Nothing is stored outside Azure DevOps: the review memory lives in the pull request itself.

This playbook assumes a model provider is already configured ([Microsoft Foundry](/integrations/microsoft-foundry), [Amazon Bedrock](/integrations/amazon-bedrock) or [another provider](/integrations/other-providers)).

## 1. Decide how the tool gets installed in the job

The pipeline needs the `air-review` command on the agent. Two options:

- **From npm**: `npm install -g air-review`, if the package is published to npmjs.com or to your private registry (Azure Artifacts). This is what the YAML below does.
- **From the repository**: clone the `air-review` repository as a second `checkout` step, run `npm ci && npm run build`, and call `node <path>/dist/cli/index.js` instead of `air-review`.

| What to do                           | What you get                              | Where to store it                         |
| ------------------------------------ | ----------------------------------------- | ----------------------------------------- |
| Pick an install method for the agent | A working `air-review` command in the job | The install step in `azure-pipelines.yml` |

## 2. Create the variable group

Pipelines → **Library** → **+ Variable group**. Name it `air-review`. Under **Variables**, **+ Add** each name below. Select the **lock icon** next to `AIR_REVIEW_API_KEY` to make it a secret. **Save**.

| Kind       | Name                        | Example                                               |
| ---------- | --------------------------- | ----------------------------------------------------- |
| Variable   | `AIR_REVIEW_PROVIDER`       | `azure-foundry`                                       |
| Variable   | `AIR_REVIEW_BASE_URL`       | `https://my-foundry-resource.services.ai.azure.com`   |
| Variable   | `AIR_REVIEW_MODEL_REVIEWER` | `review-codex`                                        |
| Variable   | `AIR_REVIEW_MODEL_VERIFIER` | `critic-mini`                                         |
| Variable   | `AIR_REVIEW_MODEL_PLANNER`  | `critic-mini`                                         |
| Variable   | `AIR_REVIEW_PRICING`        | `{"review-codex":{"input":1.25,"output":10}, ...}`    |
| **Secret** | `AIR_REVIEW_API_KEY`        | the provider key (skip it if you use Entra ID tokens) |

Then authorize the pipeline: open the group → **Pipeline permissions** → **+** → select your pipeline. Without this, the first run stops with a resource authorization error.

::: tip Key Vault instead of a plain secret
To keep the key in Azure Key Vault, create the variable group with the **Link secrets from an Azure key vault as variables** toggle on, select your service connection and vault, **Authorize**, then **+ Add** the secret named `AIR_REVIEW_API_KEY`. The service connection needs **Get** and **List** secret permissions on the vault. See [Link a variable group to Key Vault](https://learn.microsoft.com/en-us/azure/devops/pipelines/library/link-variable-groups-to-key-vaults).
:::

::: warning Secret variables are not exported automatically
Azure Pipelines exposes plain variables to scripts as environment variables, but **secret** variables must be mapped explicitly on the step: `env: AIR_REVIEW_API_KEY: $(AIR_REVIEW_API_KEY)`. The YAML below does this.
:::

| What to do                             | What you get                                  | Where to store it                                                              |
| -------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------ |
| Create the `air-review` variable group | Provider settings available to every pipeline | Library variable group; the key as a **secret** variable or a Key Vault secret |

Source: [Manage variable groups](https://learn.microsoft.com/en-us/azure/devops/pipelines/library/variable-groups).

## 3. Grant "Contribute to pull requests" to the build service

Threads are posted with the job's own identity, the build service. It must be allowed to comment on pull requests.

1. **Project settings** → **Repositories** → select your repository → **Security**.
2. In the search box, type `Build Service` and select **`<Project> Build Service (<Organization>)`**. If your organization does not limit the job authorization scope, the identity is **`Project Collection Build Service (<Organization>)`** instead.
3. Set **Contribute to pull requests** to **Allow**. Changes save automatically.

The project-scoped build service identity only exists after the pipeline has run once. If you cannot find it, run the pipeline once (it will fail at publish time with `403`), then come back.

| What to do                                                  | What you get                                   | Where to store it                             |
| ----------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------- |
| Allow **Contribute to pull requests** for the build service | The job token can create and update PR threads | Repository security settings; nothing to copy |

Source: [Set Git repository permissions](https://learn.microsoft.com/en-us/azure/devops/repos/git/set-git-repository-permissions), [Job access tokens](https://learn.microsoft.com/en-us/azure/devops/pipelines/process/access-tokens).

## 4. Write the pipeline

`System.AccessToken` is the job's token. It is not exported to scripts by default; map it on the review step as `SYSTEM_ACCESSTOKEN`. The adapter reads that variable, then `AZURE_DEVOPS_ACCESS_TOKEN`, `AZURE_DEVOPS_EXT_PAT`, `AZURE_DEVOPS_TOKEN`.

```yaml
# azure-pipelines.yml
trigger: none # run from the branch policy (build validation), not on push
pr:
  branches:
    include: [main]

pool:
  vmImage: ubuntu-latest

variables:
  - group: air-review # AIR_REVIEW_* variables; AIR_REVIEW_API_KEY marked secret

steps:
  - checkout: self
    fetchDepth: 0 # full history: the diff is computed locally from the merge base
    persistCredentials: true

  - task: NodeTool@0
    inputs:
      versionSpec: "22.x"

  - script: npm install -g air-review
    displayName: Install air-review

  - script: air-review review --publish --plain
    displayName: Air Review
    env:
      SYSTEM_ACCESSTOKEN: $(System.AccessToken) # the job token is not exported by default
      AIR_REVIEW_API_KEY: $(AIR_REVIEW_API_KEY) # secret variables must be mapped explicitly

  - publish: .air-review/telemetry.jsonl
    artifact: air-review-telemetry
    condition: always()
    displayName: Keep the telemetry log
```

Keyless variant with Microsoft Entra ID (Foundry): replace the `AIR_REVIEW_API_KEY` line with the `AzureCLI@2` task from [Microsoft Foundry, step 5b](/integrations/microsoft-foundry#_5b-credential-option-b-microsoft-entra-id-keyless), which sets `AIR_REVIEW_ACCESS_TOKEN` as a secret variable for the review step.

Why these settings:

- `fetchDepth: 0`: the adapter reads the PR from the REST API but computes the diff with the agent's local `git` (merge base of target and source, then `git diff`). A shallow checkout cannot compute a merge base; the tool then stops with a message pointing here.
- `--plain`: ASCII logs without colors or animation. `AIR_REVIEW_PLAIN=1` does the same.
- `trigger: none` + `pr:`: the run is started by the branch policy, so `SYSTEM_PULLREQUEST_PULLREQUESTID` is set and the adapter is detected automatically. On a build that is not a pull request (a CI build of `main`), the tool warns and reviews locally against `platform.local.base` instead of failing.

| What to do                                                   | What you get                          | Where to store it                 |
| ------------------------------------------------------------ | ------------------------------------- | --------------------------------- |
| Commit `azure-pipelines.yml` and create the pipeline from it | A pipeline that reviews pull requests | The repository (no secret inside) |

Source: [System.AccessToken](https://learn.microsoft.com/en-us/azure/devops/pipelines/build/variables).

## 5. Attach the pipeline as a build validation policy

**Project settings** → **Repositories** → your repository → **Policies** → **Branch Policies** → `main` → **Build validation** → **+**. In **Set build policy**: choose the **Build pipeline**, **Trigger**: Automatic, **Policy requirement**: Required, a **Build expiration**, optionally a **Display name**. **Save**.

Exit code `10` (blocking findings) fails the validation, so the review behaves like build and test. Codes `30` and `40` fail the build as infrastructure errors. Set **Policy requirement** to Optional during a trial period if you do not want the review to block merges yet.

| What to do                                         | What you get                                              | Where to store it              |
| -------------------------------------------------- | --------------------------------------------------------- | ------------------------------ |
| Add a Build validation policy on the target branch | Every PR to `main` runs the review before it can complete | Branch policy; nothing to copy |

Source: [Branch policies: build validation](https://learn.microsoft.com/en-us/azure/devops/repos/git/branch-policies#set-build-validation).

## 6. Manual runs with a PAT

To run against a pull request from your own machine, create a personal access token: user menu → **Personal access tokens** → **+ New Token** → scope **Code: Read & write**. Then, from a full clone of the repository that owns the PR:

```bash
export AZURE_DEVOPS_EXT_PAT=<pat>          # or SYSTEM_ACCESSTOKEN
git fetch origin main
air-review doctor  --ci azure-devops --org https://dev.azure.com/acme --project Shop --repo storefront --pr 483
air-review inspect --ci azure-devops --org https://dev.azure.com/acme --project Shop --repo storefront --pr 483
air-review dry-run --ci azure-devops --org https://dev.azure.com/acme --project Shop --repo storefront --pr 483
air-review review  --ci azure-devops --org https://dev.azure.com/acme --project Shop --repo storefront --pr 483 --publish
```

Keyless alternative from a signed-in Azure CLI (token valid about an hour; `499b84ac-1321-427f-aa17-267ca6975798` is the Azure DevOps resource id):

```bash
export AZURE_DEVOPS_ACCESS_TOKEN="$(az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798 --query accessToken -o tsv)"
```

`--repo` accepts the repository name or its GUID. For Azure DevOps Server, `--org` is the collection URL (`https://tfs.example.com/tfs/DefaultCollection`). JWT-shaped tokens are sent as `Bearer`, PATs as `Basic`.

| What to do                          | What you get    | Where to store it                                                                        |
| ----------------------------------- | --------------- | ---------------------------------------------------------------------------------------- |
| Create a PAT with Code Read & write | An opaque token | `AZURE_DEVOPS_EXT_PAT` in your shell or a git-ignored `.env`; never in a file you commit |

::: danger
A PAT acts as you. Give it the shortest expiry you can live with and revoke it when the trial is over. Prefer the keyless `az account get-access-token` form.
:::

## 7. How threads are used as memory

| Thread          | Content                                                                                  | Status                                                                            |
| --------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| state           | the machine-readable `air-review:state` envelope (SHAs, findings, fingerprints, metrics) | `closed`, so it stays collapsed                                                   |
| summary         | the `Air Review` summary table                                                           | `active` while the gate fails, `closed` once it passes                            |
| one per finding | the finding, anchored on the head side of the file                                       | `active`; set to `fixed` with a short reply when the finding no longer reproduces |

Every comment carries a hidden `air-review:` marker, so the next run finds and updates its own threads instead of posting duplicates. Findings keep their thread when code moves, because their identity is `rule + file + symbol`, not the line number. A stale-head guard re-reads the PR before writing: if a newer push landed meanwhile, nothing is published. The state thread contains only facts, never model reasoning. See [Memory and privacy](/concepts/memory-and-privacy).

## Environment variables

| Variable                                                                                 | Value                                                            | Secret  | Set by                                |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------- | ------------------------------------- |
| `SYSTEM_ACCESSTOKEN`                                                                     | `$(System.AccessToken)`, mapped on the review step               | **yes** | you, in the step `env`                |
| `AZURE_DEVOPS_ACCESS_TOKEN`                                                              | Entra ID token for manual runs (`Bearer`)                        | **yes** | you, locally                          |
| `AZURE_DEVOPS_EXT_PAT` / `AZURE_DEVOPS_TOKEN`                                            | PAT for manual runs (`Basic`)                                    | **yes** | you, locally                          |
| `TF_BUILD`                                                                               | `True` on every Azure Pipelines job; triggers detection          | no      | the agent                             |
| `SYSTEM_PULLREQUEST_PULLREQUESTID`                                                       | PR id; present only in build-validation runs                     | no      | the agent                             |
| `SYSTEM_TEAMFOUNDATIONCOLLECTIONURI`                                                     | organization URL                                                 | no      | the agent                             |
| `SYSTEM_TEAMPROJECT`                                                                     | project                                                          | no      | the agent                             |
| `BUILD_REPOSITORY_ID` / `BUILD_REPOSITORY_NAME`                                          | repository GUID or name                                          | no      | the agent                             |
| `BUILD_REPOSITORY_PROVIDER`                                                              | `TfsGit` for Azure Repos; anything else falls back to local mode | no      | the agent                             |
| `AIR_REVIEW_PROVIDER`, `AIR_REVIEW_BASE_URL`, `AIR_REVIEW_MODEL_*`, `AIR_REVIEW_PRICING` | provider settings                                                | no      | variable group                        |
| `AIR_REVIEW_API_KEY` or `AIR_REVIEW_ACCESS_TOKEN`                                        | provider credential                                              | **yes** | variable group secret or `AzureCLI@2` |

Optional pinning in `air-review.yaml` (everything is detected in the pipeline, so this is only needed for manual runs you want to shorten):

```yaml
platform:
  provider: azure-devops
  publish: true # publish without --publish
  azureDevops:
    organizationUrl: https://dev.azure.com/acme
    project: Shop
    repository: storefront
    tokenEnv: SYSTEM_ACCESSTOKEN
    apiVersion: "7.1"
```

## Verify

In the pipeline, add a temporary step before the review:

```yaml
- script: air-review doctor --plain
  env:
    SYSTEM_ACCESSTOKEN: $(System.AccessToken)
    AIR_REVIEW_API_KEY: $(AIR_REVIEW_API_KEY)
```

Expected: the provider probe succeeds, "SCM: azure-devops" with the organization, project, repository and PR id, and "token found in SYSTEM_ACCESSTOKEN". Then run the pipeline on a test pull request with `air-review dry-run --plain` first; switch to `review --publish` when the output looks right.

## Common errors

| Symptom                                         | Cause                                                             | Fix                                                                                 |
| ----------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `403` on every thread write                     | The build service lacks **Contribute to pull requests**           | Step 3; check which identity (project or collection scoped) the job uses            |
| `401` from Azure DevOps                         | `SYSTEM_ACCESSTOKEN` not mapped on the step                       | Add `env: SYSTEM_ACCESSTOKEN: $(System.AccessToken)`                                |
| `Could not resolve base ref` / merge base error | Shallow checkout                                                  | `fetchDepth: 0` on `checkout: self`                                                 |
| Review runs "locally" and posts nothing         | Not a PR validation build, or repository provider is not `TfsGit` | Attach the pipeline as a build validation policy; check `BUILD_REPOSITORY_PROVIDER` |
| `Azure DevOps review is missing: --org ...`     | Manual run without the locators                                   | Pass `--org --project --repo --pr`                                                  |
| Provider `401` while the SCM part works         | `AIR_REVIEW_API_KEY` is a secret and was not mapped on the step   | Add `env: AIR_REVIEW_API_KEY: $(AIR_REVIEW_API_KEY)`                                |
| "resource not authorized" at queue time         | The pipeline is not allowed to use the variable group             | Library → the group → **Pipeline permissions** → add the pipeline                   |

More in [Troubleshooting](/troubleshooting). REST endpoints used by the adapter (api-version 7.1) are listed in the repository file `docs/azure-devops.md`.
