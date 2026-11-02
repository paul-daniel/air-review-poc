# Running on Azure DevOps (Azure Repos)

air-review reviews Azure Repos pull requests from an Azure Pipelines PR
validation build and publishes its findings as pull-request threads. Nothing
is stored outside Azure DevOps: the review memory lives in the PR itself.

## Pipeline

```yaml
# azure-pipelines.yml
trigger: none # run from the branch policy (build validation), not on push
pr:
  branches:
    include: [main]

variables:
  - group: air-review # AIR_REVIEW_* variables, AIR_REVIEW_API_KEY marked secret

steps:
  - checkout: self
    fetchDepth: 0 # full history: the diff is computed locally from the merge base
    persistCredentials: true

  - task: NodeTool@0
    inputs:
      versionSpec: "22.x"

  - script: npm install -g air-review
    displayName: Install air-review

  - script: air-review review --publish
    displayName: Air Review
    env:
      SYSTEM_ACCESSTOKEN: $(System.AccessToken) # the job token is not exported by default
      AIR_REVIEW_API_KEY: $(AIR_REVIEW_API_KEY) # secret variables are never exported to scripts either
```

Attach the pipeline to the target branch as a **build validation** policy
(Project settings → Repositories → Policies → Branch policies). Exit code `10`
fails the validation when the gate finds blocking findings; `30`/`40` fail the
build as infrastructure errors.

### Why `fetchDepth: 0`

The adapter reads the pull request from the REST API but computes the diff
with the local `git` of the agent: merge base of the target and source
commits, then `git diff`. A shallow checkout cannot compute a merge base; the
tool then fails with a message pointing back here. Keep `fetchDepth: 0`.

### Variable group

Pipelines → Library → `+ Variable group`, linked to the pipeline:

| Kind     | Name                                     | Example                                          |
| -------- | ---------------------------------------- | ------------------------------------------------ |
| Variable | `AIR_REVIEW_PROVIDER`                    | `azure-openai`                                   |
| Variable | `AIR_REVIEW_BASE_URL`                    | `https://my-resource.openai.azure.com/openai/v1` |
| Variable | `AIR_REVIEW_MODEL_REVIEWER`              | `my-reviewer-deployment`                         |
| Variable | `AIR_REVIEW_MODEL_PLANNER` / `_VERIFIER` | `my-small-deployment`                            |
| Secret   | `AIR_REVIEW_API_KEY`                     | provider key (lock icon)                         |

The same names work on GitHub Actions, so one `air-review.yaml` serves both
platforms.

## Permission: "Contribute to pull requests"

The threads are posted by the build service identity. Grant it once, on the
repository:

1. Project settings → Repositories → _your repository_ → **Security**.
2. Select **`<Project> Build Service (<Organization>)`** (or the project
   collection build service, if the pipeline uses that scope).
3. Set **Contribute to pull requests** to _Allow_.

Without it every write fails with HTTP 403 and the tool prints this exact
hint. If the organization setting _Limit job authorization scope_ is on, the
project-scoped build service is the identity to grant.

## Detection and configuration

No configuration is needed inside a PR validation build. The adapter is
selected when `TF_BUILD=True` and `SYSTEM_PULLREQUEST_PULLREQUESTID` are set,
and reads:

| Variable                                                                                                                                                          | Used for         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `SYSTEM_TEAMFOUNDATIONCOLLECTIONURI`                                                                                                                              | organization URL |
| `SYSTEM_TEAMPROJECT`                                                                                                                                              | project          |
| `BUILD_REPOSITORY_ID` (GUID) or `BUILD_REPOSITORY_NAME`                                                                                                           | repository       |
| `SYSTEM_PULLREQUEST_PULLREQUESTID`                                                                                                                                | pull request id  |
| `SYSTEM_ACCESSTOKEN` (default `platform.azureDevops.tokenEnv`), then `AZURE_DEVOPS_ACCESS_TOKEN` (Entra ID, bearer), `AZURE_DEVOPS_EXT_PAT`, `AZURE_DEVOPS_TOKEN` | token            |

On an Azure Pipelines build that is **not** a pull request (a CI build of
`main`), the tool warns and reviews locally against `platform.local.base`
instead of failing. On a pipeline that builds a GitHub or Bitbucket repository
(`BUILD_REPOSITORY_PROVIDER` ≠ `TfsGit`), it also falls back to local mode.

To pin the platform in the config file:

```yaml
platform:
  provider: azure-devops
  publish: true # publish without --publish
  azureDevops:
    organizationUrl: https://dev.azure.com/acme # optional, detected in the pipeline
    project: Shop # optional
    repository: storefront # name or GUID, optional
    tokenEnv: SYSTEM_ACCESSTOKEN
    apiVersion: "7.1"
```

`air-review doctor` reports whether a token was found and in which variable.

## Threads as review memory

| Thread          | Content                                                                                  | Status                                                                            |
| --------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| state           | the machine-readable `air-review:state` envelope (SHAs, findings, fingerprints, metrics) | `closed`, so it stays collapsed                                                   |
| summary         | the `Air Review` summary table                                                           | `active` while the gate fails, `closed` once it passes                            |
| one per finding | the finding, anchored on the head side of the file (`threadContext.rightFileStart/End`)  | `active`; set to `fixed` with a short reply when the finding no longer reproduces |

Every air-review comment carries a hidden `<!-- air-review:... -->` marker, so
the next run finds and updates its own threads instead of posting duplicates.
Findings keep their thread when code moves, because their identity is
`rule + file + symbol`, not the line number. A stale-head guard re-reads the PR
before writing: if a newer push landed meanwhile, nothing is published.

The state thread contains only facts, never model reasoning. See
[docs/security.md](security.md).

## Manual runs with a PAT

Create a personal access token with the **Code (Read & Write)** scope, then:

```bash
export SYSTEM_ACCESSTOKEN=<pat>        # or AZURE_DEVOPS_EXT_PAT
# Keyless alternative from a signed-in Azure CLI (token valid about an hour):
export AZURE_DEVOPS_ACCESS_TOKEN="$(az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798 --query accessToken -o tsv)"
cd your-repo                           # a full clone (the diff is local)
git fetch origin

air-review doctor --ci azure-devops --org https://dev.azure.com/acme --project Shop --repo storefront --pr 483
air-review inspect --ci azure-devops --org https://dev.azure.com/acme --project Shop --repo storefront --pr 483
air-review review  --ci azure-devops --org https://dev.azure.com/acme --project Shop --repo storefront --pr 483 --dry-run
air-review review  --ci azure-devops --org https://dev.azure.com/acme --project Shop --repo storefront --pr 483 --publish
```

`--repo` accepts the repository name or its GUID. For Azure DevOps Server, the
organization URL is the collection URL
(`https://tfs.example.com/tfs/DefaultCollection`). Microsoft Entra ID access
tokens work too: they are sent as `Authorization: Bearer` when the adapter is
constructed with `tokenKind: "bearer"` (PATs and `System.AccessToken` use
`Basic`).

## REST endpoints used (api-version 7.1)

| Call                    | Endpoint                                                              |
| ----------------------- | --------------------------------------------------------------------- |
| read the PR             | `GET {org}/{project}/_apis/git/repositories/{repo}/pullRequests/{id}` |
| find air-review threads | `GET .../pullRequests/{id}/threads`                                   |
| create a thread         | `POST .../pullRequests/{id}/threads`                                  |
| change a thread status  | `PATCH .../pullRequests/{id}/threads/{threadId}`                      |
| update a comment        | `PATCH .../pullRequests/{id}/threads/{threadId}/comments/{commentId}` |
| reply in a thread       | `POST .../pullRequests/{id}/threads/{threadId}/comments`              |

Reference: <https://learn.microsoft.com/en-us/rest/api/azure/devops/git/>.

## Hosted agents: new organisations have none

Microsoft grants new organisations no free hosted parallelism: the first run
fails inside a minute with "No hosted parallelism has been purchased or
granted". Either request the free grant (https://aka.ms/azpipelines-parallelism-request,
a few business days) or register a self-hosted agent, which is what the live
validation used:

```bash
# on any machine with Node 22 and git; the PAT needs the "Agent Pools (read, manage)" scope
curl -sSL -o agent.tar.gz https://download.agent.dev.azure.com/agent/5.280.0/vsts-agent-osx-arm64-5.280.0.tar.gz
mkdir agent && tar -xzf agent.tar.gz -C agent && cd agent
./config.sh --unattended --url https://dev.azure.com/<org> --auth pat --token "$AZURE_DEVOPS_EXT_PAT" --pool Default --agent my-agent --acceptTeeEula
./run.sh
```

and in the pipeline use `pool: { name: Default }` instead of `vmImage`. To keep the agent
running after you log out, install it as a service: `./svc.sh install && ./svc.sh start`
(macOS launchd / Linux systemd; `./svc.sh uninstall` removes it). On this Mac the agent
`claude-mac` lives in `~/azure-pipelines-agent` and is installed that way.

## Validated live (2026-10-12)

Organisation `dev.azure.com/dantchatchouang`, project `air-review-test-angular`
(a copy of `realworld-apps/angular-realworld-example-app` plus the air-review
source as a second repository built in the job). The build validation policy
on `main` queued the pipeline on pull request 1; on a self-hosted agent the
job checked out both repositories, built the CLI, reviewed the PR with the
Foundry deployments and published an inline CRITICAL finding, the state
thread and the summary thread as the project build service, then exited 10 so
the policy blocked the merge. Two defects were fixed from that run: Azure
DevOps refuses edits to comments authored by another identity (the adapter
now replaces or replies instead), and a moving target branch no longer
discards the ledger.

### Finding lifecycle, observed on pull request 2

| Push                                                  | What the pipeline did                                                                                                                                                                    |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. auth change + a form subscription without teardown | 2 inline threads (CRITICAL, MAJOR), one collapsed state thread, one summary thread; build red (exit 10)                                                                                  |
| 2. JWT fix only                                       | CRITICAL thread → reply "Resolved" and status _fixed_; MAJOR thread untouched; state and summary updated in place, no new thread; build green (the gate only blocks on CRITICAL/BLOCKER) |
| 3. subscription fix                                   | MAJOR thread → _fixed_; summary "0 open, 2 resolved" with status _fixed_; state updated; build green                                                                                     |

Each follow-up push cost under a cent: the incremental diff is tiny, so the
reviewer is skipped and only the deterministic pass plus the verifier run.
