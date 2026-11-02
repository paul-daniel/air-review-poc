# Running on Azure DevOps (Azure Repos)

air-review reviews Azure Repos pull requests from an Azure Pipelines
validation build and acts as a reviewer: it publishes threads, keeps its
memory in the pull request, votes, and can post a status. Nothing is stored
outside Azure DevOps.

## Pipeline

Ready to use: [examples/azure-pipelines.yml](../examples/azure-pipelines.yml).
The essential steps:

```yaml
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
    inputs: { versionSpec: "22.x" }
  - script: npm install -g github:paul-daniel/air-review-poc
    displayName: Install air-review
  - script: air-review review --publish --plain
    displayName: Air Review
    env:
      SYSTEM_ACCESSTOKEN: $(System.AccessToken) # the job token is not exported by default
      AIR_REVIEW_API_KEY: $(AIR_REVIEW_API_KEY) # secret variables are never exported to scripts either
  - publish: $(Build.SourcesDirectory)/.air-review/reports
    artifact: air-review-reports
    condition: succeededOrFailed()
```

Attach the pipeline to the target branch as a **build validation** policy
(Project settings → Repositories → Policies → Branch policies). Exit code
`10` fails the validation when blocking findings remain; `20`/`30`/`40`/`50`
fail the build as configuration, model, SCM or internal errors, so a Foundry
outage is never shown as "the PR has quality problems".

Installing from a second repository instead of GitHub: check it out in the
job (`- checkout: git://<project>/air-review-poc@main`), then
`npm ci && npm run build && npm link` in its folder. That is how the October
2026 validation ran.

### Why `fetchDepth: 0`

The adapter reads the pull request from the REST API but computes the diff
with the local `git` of the agent: merge base of the target and source
commits, then `git diff`. A shallow checkout cannot compute a merge base; the
tool then fails with a message pointing back here. Keep `fetchDepth: 0`.

### Variable group

Pipelines → Library → `+ Variable group`, linked to the pipeline:

| Kind     | Name                                         | Example                                                                              |
| -------- | -------------------------------------------- | ------------------------------------------------------------------------------------ |
| Variable | `AIR_REVIEW_PROVIDER`                        | `azure-foundry`                                                                      |
| Variable | `AIR_REVIEW_BASE_URL`                        | `https://my-resource.services.ai.azure.com`                                          |
| Variable | `AIR_REVIEW_MODEL_TRIAGE`                    | `gpt-5-mini` (cheap deployment)                                                      |
| Variable | `AIR_REVIEW_MODEL_REVIEWER`                  | `gpt-5` (standard tier)                                                              |
| Variable | `AIR_REVIEW_MODEL_VERIFIER`                  | `gpt-5-mini`                                                                         |
| Variable | `AIR_REVIEW_MODEL_REVIEWER_LIGHT`            | `gpt-5-mini` (light tier)                                                            |
| Variable | `AIR_REVIEW_MODEL_REVIEWER_HEAVY`            | `gpt-5-codex` (heavy tier)                                                           |
| Variable | `AIR_REVIEW_MODEL_VERIFIER_LIGHT` / `_HEAVY` | optional per-tier verifiers                                                          |
| Variable | `AIR_REVIEW_ROUTING_MODE`                    | `hybrid` (default), `deterministic` or `model`                                       |
| Variable | `AIR_REVIEW_PRICING`                         | `{"gpt-5":{"input":1.25,"cachedInput":0.125,"output":10},...}`                       |
| Secret   | `AIR_REVIEW_API_KEY`                         | Foundry key (lock icon); or an `AzureCLI@2` step exporting `AIR_REVIEW_ACCESS_TOKEN` |

The same names work on GitHub Actions, so one `air-review.yaml` serves both
platforms. Model and tier variables are documented in [foundry.md](foundry.md).

## Permission: "Contribute to pull requests"

The threads and the vote are posted by the build service identity. Grant it
once, on the repository:

1. Project settings → Repositories → _your repository_ → **Security**.
2. Select **`<Project> Build Service (<Organization>)`** (or the project
   collection build service, if the pipeline uses that scope).
3. Set **Contribute to pull requests** to _Allow_.

Without it every write fails with HTTP 403 and the tool prints this exact
hint. If the organization setting _Limit job authorization scope_ is on, the
project-scoped build service is the identity to grant. The REST operations
used need the `vso.code_write` scope (threads, reviewers) and
`vso.code_status` for the optional status
([Pull Request Reviewers - Create](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-reviewers/create-pull-request-reviewer?view=azure-devops-rest-7.1),
[Pull Request Statuses - Create](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-statuses/create?view=azure-devops-rest-7.1)).

## Detection and configuration

No configuration is needed inside a PR validation build. The adapter is
selected when `TF_BUILD=True` and `SYSTEM_PULLREQUEST_PULLREQUESTID` are set,
and reads:

| Variable                                                                                                                                                          | Used for                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `SYSTEM_TEAMFOUNDATIONCOLLECTIONURI`                                                                                                                              | organization URL            |
| `SYSTEM_TEAMPROJECT`                                                                                                                                              | project                     |
| `BUILD_REPOSITORY_ID` (GUID) or `BUILD_REPOSITORY_NAME`                                                                                                           | repository                  |
| `SYSTEM_PULLREQUEST_PULLREQUESTID`                                                                                                                                | pull request id             |
| `BUILD_BUILDID`                                                                                                                                                   | link on the optional status |
| `SYSTEM_ACCESSTOKEN` (default `platform.azureDevops.tokenEnv`), then `AZURE_DEVOPS_ACCESS_TOKEN` (Entra ID, bearer), `AZURE_DEVOPS_EXT_PAT`, `AZURE_DEVOPS_TOKEN` | token                       |

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
    vote:
      enabled: true # add the identity as a reviewer and cast the verdict
      approveWithSuggestions: true # vote 5 when only non-blocking findings remain (else no vote)
    status:
      enabled: false # post a pull-request status usable by a "Status" branch policy
      genre: air-review
      name: gate
```

`air-review doctor` reports whether a token was found and in which variable.

## Threads as review memory

| Thread          | Content                                                                                  | Status                                                                                               |
| --------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| state           | the machine-readable `air-review:state` envelope (SHAs, findings, fingerprints, metrics) | `closed`, so it stays collapsed                                                                      |
| summary         | verdict, routing, findings table, "since the last review", cost per step, workflow       | `active` while findings are open, `fixed` once all were resolved, `closed` if nothing to report      |
| one per finding | the finding, anchored on the head side of the file (`threadContext.rightFileStart/End`)  | `active`; `fixed` with a "Resolved" reply when it no longer reproduces; back to `active` if reopened |

Thread statuses `active`, `fixed`, `wontFix`, `closed`, `byDesign`, `pending`
are the documented `CommentThreadStatus` values
([Pull Request Threads - Create](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-threads/create?view=azure-devops-rest-7.1)).

### No duplicates

Every air-review comment carries a hidden `<!-- air-review:... -->` marker.
Before creating a thread the adapter lists the pull request's threads and
looks for the marker: a finding whose thread already exists is **updated**
(and reactivated if it had been resolved), never posted a second time, even
when the ledger was lost or the previous run used another identity. Findings
keep their thread when code moves, because their identity is
`rule + file + symbol`, not the line number. Azure DevOps lets only a
comment's author edit it: when an edit is refused (first run with a PAT,
later runs by the build service) the adapter replies in the thread or starts
a replacement thread and parks the old one. A stale-head guard re-reads the
pull request before writing: if a newer push landed meanwhile, nothing is
published.

### Incremental review on a new push

| Push                                                                 | What happens                                                                                                                                             | Model calls                                        |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| same head, same configuration (re-queued build)                      | nothing is reviewed again, even with `--publish`; `--force` overrides                                                                                    | 0                                                  |
| new commits                                                          | the delta is computed **since the last reviewed head**; only those files reach the reviewer; previous findings are reconciled (kept, resolved, reopened) | triage + reviewer + verifier on the new delta only |
| new commits touching only docs or binaries (`review.modelSkipKinds`) | deterministic rules run, previous findings carried over, summary notes "nothing new for the reviewer"                                                    | 0                                                  |
| target branch moved                                                  | full re-review against the new base; existing threads are updated, not duplicated                                                                        | as a full review                                   |
| configuration or models changed                                      | full re-review; findings are matched to existing threads                                                                                                 | as a full review                                   |

The local result cache (`cache.dir`) additionally serves identical reviewer
inputs without a request.

## Vote and status: a real reviewer

After publishing, the adapter registers the reviewing identity as a reviewer
and casts the verdict with
`PUT .../pullRequests/{id}/reviewers/{reviewerId}` and a `vote` body. The
documented values are "10 - approved 5 - approved with suggestions 0 - no vote
-5 - waiting for author -10 - rejected"
([Pull Request Reviewers - Create](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-reviewers/create-pull-request-reviewer?view=azure-devops-rest-7.1)).

| Verdict                   | Condition                                                                       | Vote                              |
| ------------------------- | ------------------------------------------------------------------------------- | --------------------------------- |
| Approved                  | no open finding                                                                 | `10`                              |
| Approved with suggestions | open findings, none blocking (gate passed), `vote.approveWithSuggestions: true` | `5`                               |
| Changes requested         | the gate failed (blocking `IN_PR` findings above the confidence threshold)      | `-5`                              |
| Commented                 | the review could not complete (model error)                                     | `0`, never a vote on partial data |

The tool never casts `-10` and never completes or merges the pull request.
With `platform.azureDevops.status.enabled: true` it also posts a pull-request
status (`context.genre`/`context.name`, default `air-review/gate`,
`succeeded` / `failed` / `error`, `targetUrl` = the build) that a **Status**
branch policy can require, independently of the build result.

## Manual runs with a PAT

Create a personal access token with the **Code (Read & Write)** scope, then:

```bash
export SYSTEM_ACCESSTOKEN=<pat>        # or AZURE_DEVOPS_EXT_PAT
# Keyless alternative from a signed-in Azure CLI (token valid about an hour). Works for
# organizations connected to a Microsoft Entra tenant; an organization backed by a personal
# Microsoft account answers such tokens with a redirect to the sign-in page (observed on
# 2026-11-03), so use a PAT there.
export AZURE_DEVOPS_ACCESS_TOKEN="$(az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798 --query accessToken -o tsv)"
cd your-repo                           # a full clone (the diff is local)
git fetch origin

air-review doctor  --ci azure-devops --org https://dev.azure.com/acme --project Shop --repo storefront --pr 483
air-review inspect --ci azure-devops --org https://dev.azure.com/acme --project Shop --repo storefront --pr 483
air-review review  --ci azure-devops --org https://dev.azure.com/acme --project Shop --repo storefront --pr 483 --dry-run
air-review review  --ci azure-devops --org https://dev.azure.com/acme --project Shop --repo storefront --pr 483 --publish
```

`--repo` accepts the repository name or its GUID. For Azure DevOps Server, the
organization URL is the collection URL
(`https://tfs.example.com/tfs/DefaultCollection`). Microsoft Entra ID access
tokens are sent as `Authorization: Bearer`; PATs and `System.AccessToken` use
`Basic`.

## REST endpoints used (api-version 7.1)

| Call                    | Endpoint                                                               |
| ----------------------- | ---------------------------------------------------------------------- |
| read the PR             | `GET {org}/{project}/_apis/git/repositories/{repo}/pullRequests/{id}`  |
| find air-review threads | `GET .../pullRequests/{id}/threads`                                    |
| create a thread         | `POST .../pullRequests/{id}/threads`                                   |
| change a thread status  | `PATCH .../pullRequests/{id}/threads/{threadId}`                       |
| update a comment        | `PATCH .../pullRequests/{id}/threads/{threadId}/comments/{commentId}`  |
| reply in a thread       | `POST .../pullRequests/{id}/threads/{threadId}/comments`               |
| who am I                | `GET {org}/_apis/connectionData` (api-version `7.1-preview.1`)         |
| vote                    | `PUT .../pullRequests/{id}/reviewers/{reviewerId}` body `{ vote, id }` |
| status (optional)       | `POST .../pullRequests/{id}/statuses`                                  |

Reference: <https://learn.microsoft.com/en-us/rest/api/azure/devops/git/>.
Pull-request iterations (`GET .../pullRequests/{id}/iterations`, one per
push) are not used: the ledger's last reviewed head gives the same
information without an extra call.

## Hosted agents: new organisations have none

Microsoft grants new organisations no free hosted parallelism: the first run
fails inside a minute with "No hosted parallelism has been purchased or
granted". Either request the free grant (https://aka.ms/azpipelines-parallelism-request,
a few business days) or register a self-hosted agent:

```bash
# on any machine with Node 22 and git; the PAT needs the "Agent Pools (read, manage)" scope
curl -sSL -o agent.tar.gz https://download.agent.dev.azure.com/agent/5.280.0/vsts-agent-osx-arm64-5.280.0.tar.gz
mkdir agent && tar -xzf agent.tar.gz -C agent && cd agent
./config.sh --unattended --url https://dev.azure.com/<org> --auth pat --token "$AZURE_DEVOPS_EXT_PAT" --pool Default --agent my-agent --acceptTeeEula
./run.sh
```

and in the pipeline use `pool: { name: Default }` instead of `vmImage`. To keep the agent
running after you log out, install it as a service: `./svc.sh install && ./svc.sh start`.

## Validated live (2026-10-12), and what is new since

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

**Not yet validated live** (added after that run, covered by unit tests with
a fake HTTP client only): the marker-based de-duplication on thread creation,
the `5` approve-with-suggestions vote, the optional status, and the
"nothing new to review" short-circuit on docs-only pushes. The scenarios in
[air-review-test-repo](https://github.com/paul-daniel/air-review-test-repo)
are designed to exercise each of them on a real organisation.
