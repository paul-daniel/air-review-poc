# Local developer setup

How to run `air-review` on your own machine, against your working branch, without ever committing a key. The result is written to `.air-review/summary.md`; nothing is published.

## 1. Keep keys out of Git with `.env`

Create a `.env` file at the root of the repository you review (or in your home directory) and make sure it is ignored:

```bash
cat >> .gitignore <<'EOF'
.env
.env.*
.air-review/
EOF
```

Then write the variables for your provider. The template `.env.example` in the `air-review` repository lists every supported variable with a placeholder value.

```bash
# .env (never committed)
AIR_REVIEW_PROVIDER=azure-foundry
AIR_REVIEW_BASE_URL=https://my-foundry-resource.services.ai.azure.com
AIR_REVIEW_MODEL_REVIEWER=review-codex
AIR_REVIEW_MODEL_VERIFIER=critic-mini
AZURE_AI_API_KEY=...
```

Load it in the current shell:

```bash
set -a; source .env; set +a
```

::: tip direnv
With [direnv](https://direnv.net/) installed, add a `.envrc` containing `dotenv` next to the `.env` file and run `direnv allow` once. The variables load when you enter the directory and unload when you leave it. Add `.envrc` to `.gitignore` too, or commit a `.envrc` that only contains `dotenv` and keep the values in `.env`.
:::

::: danger Never commit a key
`air-review` scans the diff for well-known secret patterns and reports them as a BLOCKER finding, which protects your colleagues' branches, but the surest protection is a `.gitignore` entry. If a key reaches a remote, rotate it in the provider console immediately.
:::

| What to do                                    | What you get                           | Where to store it                                                |
| --------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------- |
| Write `.env`, ignore it, load it in the shell | Provider variables in your environment | `.env` (git-ignored) or your shell profile; never the repository |

## 2. Write the config with `air-review init`

Run `init` once at the root of the repository you want to review. It writes an annotated `air-review.yaml` for the chosen preset and adds `.air-review/` to `.gitignore`.

```bash
air-review init --provider azure-foundry --base-url https://my-foundry-resource.services.ai.azure.com --base origin/main
air-review init --provider openai --ci github
air-review init --provider bedrock --ci azure-devops
```

The file holds no secret: only the preset, the endpoint URL, the key **variable name** (`apiKeyEnv`) and the role models. Commit it so every teammate and the pipeline share the same settings. Presets with a placeholder URL (`azure-openai`, `azure-foundry`, `openai-compatible`) refuse to run without `--base-url`.

Edit later without opening the file:

```bash
air-review config                                   # effective config, secrets masked
air-review config set models.roles.reviewer gpt-4.1
air-review config set review.gate.minimumConfidence 0.95
```

| What to do                     | What you get                      | Where to store it          |
| ------------------------------ | --------------------------------- | -------------------------- |
| `air-review init --provider …` | `air-review.yaml` without secrets | The repository (commit it) |

## 3. Choose the base branch

In local mode the diff is the merge base of a **base ref** and the checked-out commit, exactly like a pull request. The default base is `origin/main` (`platform.local.base`). Fetch it first, then review:

```bash
git fetch origin main
air-review dry-run                        # vs platform.local.base
air-review dry-run --base origin/develop  # another target branch
air-review dry-run --base main            # a local branch works too
```

`Could not resolve base ref` means the ref does not exist locally: fetch it or pass `--base`.

| What to do                          | What you get               | Where to store it                                               |
| ----------------------------------- | -------------------------- | --------------------------------------------------------------- |
| Pick the branch your change targets | A pull-request-shaped diff | `platform.local.base` in `air-review.yaml`, or `--base` per run |

## 4. Review, re-review with `--force`

```bash
air-review inspect                        # what the tool sees, no model call
air-review dry-run                        # full review, nothing published
air-review dry-run --deterministic-only   # structural rules only, free
air-review dry-run --force                # review the same head again
air-review dry-run --no-cache             # ignore cached model results
```

A second run on the same head with the same configuration says "skipped": the ledger already knows this commit. `--force` re-reviews it anyway (after a model or prompt change, for example). `--no-cache` bypasses the content-addressed cache without touching the ledger.

Local runs always use the local ledger (`.air-review/state.json`): a finding keeps its id when you fix another file, is resolved when its code no longer reproduces it, and reopens if you reintroduce it.

## 5. Read `.air-review/summary.md`

After every local run:

```bash
cat .air-review/summary.md     # the summary table, as it would appear in a PR
cat .air-review/context.md     # what was sent to the model and why
air-review explain             # stored findings with their ids
air-review explain arf_7d0b9f  # full evidence and lifecycle for one finding
air-review telemetry --last 5  # tokens, cost estimate, duration per run
```

`summary.md` lists each open finding with severity, confidence, file, line and the gate result. `context.md` shows the exemplars and related modules the planner selected, which is the quickest way to understand why the model said what it said.

## Environment variables

| Variable                                               | Value                                                   | Secret  |
| ------------------------------------------------------ | ------------------------------------------------------- | ------- |
| `AIR_REVIEW_PROVIDER`                                  | preset id                                               | no      |
| `AIR_REVIEW_BASE_URL`                                  | endpoint (presets with placeholders)                    | no      |
| `AIR_REVIEW_MODEL_REVIEWER` / `_VERIFIER`              | models or deployment names                              | no      |
| the preset key variable, or `AIR_REVIEW_API_KEY`       | the key                                                 | **yes** |
| `AIR_REVIEW_ACCESS_TOKEN`                              | Entra ID / OAuth token instead of a key                 | **yes** |
| `AIR_REVIEW_CONFIG`                                    | path to the config file if not in the current directory | no      |
| `AIR_REVIEW_PLAIN`, `AIR_REVIEW_ANIMATION`, `NO_COLOR` | output switches                                         | no      |

## Verify

```bash
air-review doctor
air-review dry-run --deterministic-only   # free
air-review dry-run                        # first paid run
```

## Common errors

| Symptom                          | Cause                                               | Fix                                                           |
| -------------------------------- | --------------------------------------------------- | ------------------------------------------------------------- |
| `Could not resolve base ref`     | `origin/main` not fetched, or another target branch | `git fetch origin main` or `--base <ref>`                     |
| Review says "skipped"            | Same head and config already reviewed               | `--force`                                                     |
| `init` refuses to run            | Preset with a placeholder URL                       | Pass `--base-url`                                             |
| `air-review.yaml` already exists | Protection against overwriting                      | `air-review init --force`                                     |
| Exit code `20`                   | Invalid config or missing provider                  | `air-review doctor`, check the preset id and the endpoint URL |
| Terminal shows raw ANSI codes    | Log viewer without color support                    | `--plain` or `NO_COLOR=1`                                     |

More in [Troubleshooting](/troubleshooting).
