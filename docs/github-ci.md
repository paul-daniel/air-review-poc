# Running on GitHub

## Token

In GitHub Actions you do not need to create anything: the built-in
`${{ github.token }}` works when the job has `pull-requests: write` and
`issues: write` permissions.

For local runs against GitHub, create a fine-grained personal access token
with:

- pull requests: read
- pull request comments: write
- issues: write (for the summary/state comments)

Set it as `GH_TOKEN` or `GITHUB_TOKEN` in your shell. Without a token,
air-review still reads public repositories through the unauthenticated API
(60 requests/hour) but refuses to publish.

On public forks, keep publishing disabled and only post from `pull_request`
events you trust.

## Repository variables and secrets

The provider can be configured entirely from the repository settings, which
keeps pipelines identical across vendors:

GitHub → Settings → Secrets and variables → Actions:

| Kind     | Name                                     | Example                                          |
| -------- | ---------------------------------------- | ------------------------------------------------ |
| Variable | `AIR_REVIEW_PROVIDER`                    | `azure-openai`                                   |
| Variable | `AIR_REVIEW_BASE_URL`                    | `https://my-resource.openai.azure.com/openai/v1` |
| Variable | `AIR_REVIEW_MODEL_REVIEWER`              | `my-reviewer-deployment`                         |
| Variable | `AIR_REVIEW_MODEL_PLANNER` / `_VERIFIER` | `my-small-deployment`                            |
| Secret   | `AIR_REVIEW_API_KEY`                     | provider key                                     |

Azure DevOps → Pipelines → Library → Variable group (link it to the pipeline,
mark the key as secret): the same names, so the same config file works on both
platforms. In Azure Pipelines the Azure Repos adapter is detected automatically
and publishes to pull-request threads; see [docs/azure-devops.md](azure-devops.md).

## Workflow

Copy [.github/workflows/air-review.example.yml](../.github/workflows/air-review.example.yml)
into your repository.

The example points the model at a hosted OpenAI-compatible endpoint, so the
job installs nothing and downloads no models — only `air-review` itself.
Running the model in the job would add a cold start and a multi-gigabyte
download to every pull request, which is exactly what the review should not
cost; the pipeline path is API keys end to end.

The exit codes integrate directly with CI: `0` passes, `10` fails the PR gate,
`30`/`40` fail the job as infrastructure errors.

## Local runs against GitHub

```bash
export GITHUB_TOKEN=github_pat_...
air-review doctor
air-review inspect --ci github --owner acme --repo storefront --pr 483
air-review review --ci github --owner acme --repo storefront --pr 483 --dry-run
air-review review --ci github --owner acme --repo storefront --pr 483 --publish
```

Inside a `pull_request` workflow the event payload is read automatically, so
owner/repo/PR flags are unnecessary.

## How publishing stays safe

- A stale guard re-reads the PR head before writing; if a newer push landed,
  this run publishes nothing.
- The state comment contains only facts (SHAs, findings, fingerprints,
  metrics) — never internal model reasoning.
- Findings are inline review threads with a hidden `air-review:` marker so the
  tool can find and update them again.
