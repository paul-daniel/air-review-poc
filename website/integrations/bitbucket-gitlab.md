# Bitbucket Pipelines and GitLab CI

`air-review` has no Bitbucket or GitLab adapter yet: it cannot read a Bitbucket pull request or a GitLab merge request through their APIs, and it cannot post comments there. It can still review the change in **local mode** inside the job, fail the job on blocking findings, and keep the summary as an artifact. This page shows how.

## What you get in `--ci local`

- The diff is computed locally from the merge base of the target branch and the job's commit, like a pull request.
- Findings are printed in the job log and written to `.air-review/summary.md`.
- Exit code `10` fails the job when the gate finds blocking findings.
- The ledger (`.air-review/state.json`) is local to the job workspace, so every run is a full review unless you cache the folder between runs.

## Bitbucket Pipelines

### 1. Store the provider settings

**Repository settings** → **Pipelines** → **Repository variables** → **Add variable**. Check **Secured** for the key. Secured variables are masked in logs and cannot be read back.

| Kind    | Name                        | Example         |
| ------- | --------------------------- | --------------- |
| plain   | `AIR_REVIEW_PROVIDER`       | `azure-foundry` |
| plain   | `AIR_REVIEW_BASE_URL`       | the endpoint    |
| plain   | `AIR_REVIEW_MODEL_REVIEWER` | deployment name |
| plain   | `AIR_REVIEW_MODEL_VERIFIER` | deployment name |
| secured | `AIR_REVIEW_API_KEY`        | the key         |

| What to do                                   | What you get                     | Where to store it                             |
| -------------------------------------------- | -------------------------------- | --------------------------------------------- |
| Add repository variables, key as **Secured** | Variables exported to every step | Bitbucket repository (or workspace) variables |

Source: [Variables and secrets](https://support.atlassian.com/bitbucket-cloud/docs/variables-and-secrets/).

### 2. Write the pipeline

Bitbucket clones the last 50 commits by default; a merge base needs the full history (`clone: depth: full`). In a pull-request pipeline, `BITBUCKET_PR_DESTINATION_BRANCH` holds the target branch and `BITBUCKET_PR_ID` the pull request id.

```yaml
# bitbucket-pipelines.yml
image: node:22

clone:
  depth: full # the diff is computed from the merge base

pipelines:
  pull-requests:
    "**":
      - step:
          name: Air Review
          script:
            - npm install -g air-review
            - git fetch origin "$BITBUCKET_PR_DESTINATION_BRANCH"
            - air-review doctor --plain
            - air-review review --ci local --base "origin/$BITBUCKET_PR_DESTINATION_BRANCH" --plain
          artifacts:
            - .air-review/summary.md
            - .air-review/telemetry.jsonl
```

The `pull-requests` section only runs for pull requests, so the destination variable is always set. `--publish` is useless here (local mode writes to `.air-review/` only).

| What to do                       | What you get                                  | Where to store it |
| -------------------------------- | --------------------------------------------- | ----------------- |
| Commit `bitbucket-pipelines.yml` | A review step that fails on blocking findings | The repository    |

Source: [Git clone behavior](https://support.atlassian.com/bitbucket-cloud/docs/git-clone-behavior/).

## GitLab CI

### 1. Store the provider settings

Project → **Settings** → **CI/CD** → **Variables** → **Add variable**. For the key, select **Mask variable** (and **Protect variable** if only protected branches should see it). Check the project settings; the exact labels may differ by GitLab version.

| What to do                      | What you get               | Where to store it                   |
| ------------------------------- | -------------------------- | ----------------------------------- |
| Add CI/CD variables, key masked | Variables exported to jobs | GitLab project (or group) variables |

### 2. Write the job

Run the job only in merge request pipelines, where `CI_MERGE_REQUEST_TARGET_BRANCH_NAME` is set. `GIT_DEPTH: 0` disables the shallow clone (new projects default to a depth of 20).

```yaml
# .gitlab-ci.yml
air-review:
  image: node:22
  stage: test
  variables:
    GIT_DEPTH: 0 # full history: the diff is computed from the merge base
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  script:
    - npm install -g air-review
    - git fetch origin "$CI_MERGE_REQUEST_TARGET_BRANCH_NAME"
    - air-review doctor --plain
    - air-review review --ci local --base "origin/$CI_MERGE_REQUEST_TARGET_BRANCH_NAME" --plain
  artifacts:
    when: always
    paths:
      - .air-review/summary.md
      - .air-review/telemetry.jsonl
```

| What to do                         | What you get                                        | Where to store it |
| ---------------------------------- | --------------------------------------------------- | ----------------- |
| Commit the job in `.gitlab-ci.yml` | A merge-request job that fails on blocking findings | The repository    |

Source: [Predefined variables](https://docs.gitlab.com/ci/variables/predefined_variables/), [Git shallow clone setting](https://docs.gitlab.com/ci/pipelines/settings/).

## Installing the tool in the job

Both snippets use `npm install -g air-review`, which assumes the package is published to a registry the job can reach. If it is not, clone the `air-review` repository in the job, run `npm ci && npm run build`, and call `node <path>/dist/cli/index.js` instead of `air-review`.

## Environment variables

| Variable                                                           | Value                   | Secret  | Set by                     |
| ------------------------------------------------------------------ | ----------------------- | ------- | -------------------------- |
| `AIR_REVIEW_PROVIDER`, `AIR_REVIEW_BASE_URL`, `AIR_REVIEW_MODEL_*` | provider settings       | no      | CI variables               |
| `AIR_REVIEW_API_KEY` (or the preset's key variable)                | provider key            | **yes** | CI secured/masked variable |
| `BITBUCKET_PR_DESTINATION_BRANCH`, `BITBUCKET_PR_ID`               | target branch and PR id | no      | Bitbucket                  |
| `CI_MERGE_REQUEST_TARGET_BRANCH_NAME`, `CI_MERGE_REQUEST_IID`      | target branch and MR id | no      | GitLab                     |

No SCM token is needed: local mode never calls the Bitbucket or GitLab API.

## Verify

`air-review doctor --plain` in the job must show the provider probe or model listing succeeding and "SCM: local". Then open a test pull request or merge request and read the job log and the `summary.md` artifact.

## Common errors

| Symptom                      | Cause                                 | Fix                                                                             |
| ---------------------------- | ------------------------------------- | ------------------------------------------------------------------------------- |
| `Could not resolve base ref` | Target branch not fetched             | Keep the `git fetch origin "$TARGET"` line                                      |
| Merge base error             | Shallow clone                         | `clone: depth: full` (Bitbucket) or `GIT_DEPTH: 0` (GitLab)                     |
| Review runs on every push    | Job not restricted to PR/MR pipelines | `pull-requests:` section (Bitbucket) or the `merge_request_event` rule (GitLab) |
| Nothing is published         | Expected: no adapter                  | Read the job log or the `summary.md` artifact                                   |

## What the roadmap says

A Bitbucket adapter is on the roadmap, "same shape as the Azure one" (the Azure DevOps adapter is the template: a `ScmAdapter` implementation that reads the pull request, computes the diff with the local `git`, and keeps the ledger in pull-request comments). It is listed after the quality benchmark, the bounded context explorer and the additional framework packs. A GitLab adapter is not planned yet; the same interface is where it would go. Until then, local mode in the job is the supported path.
