# GitHub Actions

`air-review` reviews GitHub pull requests from a `pull_request` workflow and publishes inline review comments, one summary comment and one hidden state comment. The built-in workflow token is enough; no personal token is needed.

This playbook assumes a model provider is already configured ([Microsoft Foundry](/integrations/microsoft-foundry), [Amazon Bedrock](/integrations/amazon-bedrock) or [another provider](/integrations/other-providers)).

## 1. Store the provider settings

Repository → **Settings** → **Secrets and variables** → **Actions**.

- **Variables** tab → **New repository variable** for each non-secret value.
- **Secrets** tab → **New repository secret** for the key.

| Kind       | Name                        | Example                                             |
| ---------- | --------------------------- | --------------------------------------------------- |
| Variable   | `AIR_REVIEW_PROVIDER`       | `azure-foundry`                                     |
| Variable   | `AIR_REVIEW_BASE_URL`       | `https://my-foundry-resource.services.ai.azure.com` |
| Variable   | `AIR_REVIEW_MODEL_REVIEWER` | `review-codex`                                      |
| Variable   | `AIR_REVIEW_MODEL_VERIFIER` | `critic-mini`                                       |
| Variable   | `AIR_REVIEW_PRICING`        | `{"review-codex":{"input":1.25,"output":10}}`       |
| **Secret** | `AIR_REVIEW_API_KEY`        | the provider key                                    |

Organization-level secrets and variables work the same way and are visible to every repository you allow.

| What to do                                        | What you get                                                   | Where to store it                                                 |
| ------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------- |
| Create the variables and the secret under Actions | Values readable as `vars.NAME` and `secrets.NAME` in workflows | GitHub repository (or organization) **variables** and **secrets** |

Source: [Store information in variables](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/store-information-in-variables), [Using secrets](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions).

## 2. Give the workflow token the right permissions

The automatic token (`github.token`, also exposed as `GITHUB_TOKEN`) is created per job. Its permissions are set with the `permissions` key. The review needs:

- `contents: read` to check out the code;
- `pull-requests: write` to post inline review comments;
- `issues: write` for the summary and state comments (PR conversation comments are issue comments in the GitHub API).

| What to do                             | What you get                           | Where to store it                  |
| -------------------------------------- | -------------------------------------- | ---------------------------------- |
| Add the `permissions` block to the job | A token that can read code and comment | The workflow file; nothing to copy |

Source: [Automatic token authentication](https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication).

## 3. Add the workflow

Create `.github/workflows/air-review.yml` (the repository ships the same file as `.github/workflows/air-review.example.yml`):

```yaml
name: air-review

on:
  pull_request:

jobs:
  air-review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      issues: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # full history: the diff is computed from the merge base

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install air-review
        run: npm install -g air-review

      - name: Review
        env:
          GITHUB_TOKEN: ${{ github.token }}
          AIR_REVIEW_PROVIDER: ${{ vars.AIR_REVIEW_PROVIDER }}
          AIR_REVIEW_BASE_URL: ${{ vars.AIR_REVIEW_BASE_URL }}
          AIR_REVIEW_MODEL_REVIEWER: ${{ vars.AIR_REVIEW_MODEL_REVIEWER }}
          AIR_REVIEW_MODEL_VERIFIER: ${{ vars.AIR_REVIEW_MODEL_VERIFIER }}
          AIR_REVIEW_PRICING: ${{ vars.AIR_REVIEW_PRICING }}
          AIR_REVIEW_API_KEY: ${{ secrets.AIR_REVIEW_API_KEY }}
        run: air-review review --publish --plain

      - name: Keep the telemetry log
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: air-review-telemetry
          path: .air-review/telemetry.jsonl
          if-no-files-found: ignore
```

Notes:

- Inside a `pull_request` workflow, the event payload gives the owner, repository and PR number; no `--owner/--repo/--pr` flags are needed.
- If `air-review` is not published to a registry you can reach, check out the `air-review` repository in a second `actions/checkout` step (with `path:`), run `npm ci && npm run build` there, and call `node <path>/dist/cli/index.js` instead.
- If `air-review.yaml` in your repository already sets the provider and models, the `AIR_REVIEW_*` lines are optional; environment variables win over the file.
- Exit code `10` fails the job when the gate finds blocking findings, so the check behaves like build and test. Use `continue-on-error: true` on the step during a trial period.

| What to do               | What you get                  | Where to store it                  |
| ------------------------ | ----------------------------- | ---------------------------------- |
| Commit the workflow file | A check on every pull request | `.github/workflows/air-review.yml` |

## 4. Forks caveat

For `pull_request` events from a forked repository, GitHub gives the workflow a **read-only** `GITHUB_TOKEN` and does **not** pass repository secrets. Two consequences:

- `AIR_REVIEW_API_KEY` is empty, so the model call fails with exit code `30`;
- even with a key, publishing would fail with exit code `40`.

Keep publishing for pull requests from the same repository only:

```yaml
- name: Review
  if: github.event.pull_request.head.repo.full_name == github.repository
  # ... same env and run as above
```

For forks you can add a second step that runs `air-review dry-run --deterministic-only --plain` (no key, no publish, zero model calls) so contributors still get the structural checks in the log. Do not use `pull_request_target` to get secrets into fork builds: the checked-out code is untrusted.

| What to do                                          | What you get                                       | Where to store it |
| --------------------------------------------------- | -------------------------------------------------- | ----------------- |
| Guard the publish step with the same-repo condition | No failed checks and no leaked secrets on fork PRs | The workflow file |

Source: [Events that trigger workflows: pull_request](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).

## 5. Local runs against GitHub (optional)

For a run from your machine, create a **fine-grained personal access token** (Settings → Developer settings → Personal access tokens) with: pull requests read, pull request comments write, issues write. Export it as `GITHUB_TOKEN` or `GH_TOKEN`.

```bash
export GITHUB_TOKEN=github_pat_...
air-review doctor
air-review inspect --ci github --owner acme --repo storefront --pr 483
air-review dry-run --ci github --owner acme --repo storefront --pr 483
air-review review  --ci github --owner acme --repo storefront --pr 483 --publish
```

Without a token the tool still reads **public** repositories through the unauthenticated API (60 requests per hour) and refuses to publish. GitHub Enterprise: set `platform.github.apiBaseUrl` in the config.

## Environment variables

| Variable                                                                                 | Value                                                 | Secret  | Set by                   |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------- | ------------------------ |
| `GITHUB_TOKEN`                                                                           | `github.token` in Actions; a fine-grained PAT locally | **yes** | you, in the step `env`   |
| `GH_TOKEN`                                                                               | Alternative name read after `GITHUB_TOKEN`            | **yes** | you                      |
| `GITHUB_ACTIONS`, `GITHUB_REPOSITORY`, `GITHUB_EVENT_NAME`, `GITHUB_EVENT_PATH`          | Detection of the PR (owner/repo, number)              | no      | the runner               |
| `AIR_REVIEW_PROVIDER`, `AIR_REVIEW_BASE_URL`, `AIR_REVIEW_MODEL_*`, `AIR_REVIEW_PRICING` | provider settings                                     | no      | repository **variables** |
| `AIR_REVIEW_API_KEY`                                                                     | provider key                                          | **yes** | repository **secret**    |

## Verify

Add a temporary step before the review with the same `env` block:

```yaml
- run: air-review doctor --plain
```

Expected: the provider probe or model listing succeeds, "SCM: github" with owner, repository and PR number, and the token found in `GITHUB_TOKEN`. Open a test pull request and run `air-review dry-run --plain` first; switch to `review --publish` when the output looks right.

## Common errors

| Symptom                                                      | Cause                                             | Fix                                                                     |
| ------------------------------------------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------- |
| `no GitHub token` on publish                                 | `GITHUB_TOKEN` not in the step `env`              | Add `GITHUB_TOKEN` to the step `env` with the `github.token` expression |
| `403` when posting comments                                  | Missing `pull-requests: write` or `issues: write` | Add the `permissions` block to the job                                  |
| `403` on a fork PR                                           | Read-only token on forks                          | Guard the step with the same-repo condition (step 4)                    |
| Exit `30` with an empty key                                  | Secrets are not passed to fork builds             | Same as above                                                           |
| `Could not resolve base ref`                                 | Shallow checkout                                  | `fetch-depth: 0` on `actions/checkout`                                  |
| `GitHub review requires owner, repo and pull request number` | Not a `pull_request` event (for example `push`)   | Trigger on `pull_request`, or pass `--owner --repo --pr`                |
| Rate-limited reads                                           | Unauthenticated API (60 requests per hour)        | Provide a token                                                         |

More in [Troubleshooting](/troubleshooting).
