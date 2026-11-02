# Commands

Every command has its own help with examples:

```bash
air-review --help            # all commands, common flows, exit codes
air-review help review       # same as: air-review review --help
air-review example           # copy-paste snippets, topic by topic
```

## Global options

Accepted by every command, before or after the command name.

| Option            | Effect                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| `--config <file>` | use a specific config file (default: `air-review.{yaml,yml,json,toml}` in the current directory) |
| `--plain`         | plain ASCII output for CI logs (no colors or animation)                                          |
| `--color [mode]`  | `always` (default), `auto` for terminal detection, or `never`; bare `--color` means `always`     |
| `--no-color`      | disable colors (`NO_COLOR` is respected too)                                                     |
| `--no-animation`  | disable the progress spinner and report reveal                                                   |
| `--ascii`         | ASCII separators, no animation                                                                   |
| `--version`       | print the version                                                                                |

## SCM options

Shared by `review`, `dry-run` and `inspect`.

| Option             | Effect                                                                     |
| ------------------ | -------------------------------------------------------------------------- |
| `--ci <mode>`      | `auto` (default), `github`, `azure-devops` or `local`                      |
| `--base <ref>`     | local mode base ref (default: `platform.local.base`, itself `origin/main`) |
| `--owner <owner>`  | GitHub owner (with `--ci github`)                                          |
| `--repo <repo>`    | GitHub repository name, or Azure Repos repository name or GUID             |
| `--pr <number>`    | pull request number (GitHub) or id (Azure DevOps)                          |
| `--org <url>`      | Azure DevOps organization URL, for example `https://dev.azure.com/acme`    |
| `--project <name>` | Azure DevOps project                                                       |

In `auto` mode the adapter is chosen from the config (`platform.provider`), then from the environment: GitHub Actions `pull_request` event, Azure Pipelines (`TF_BUILD` plus a pull request id), otherwise local.

## init

Write an annotated config for a provider preset. Fails loudly when a preset needs a real URL (`azure-openai`, `azure-foundry`, `openai-compatible`). Also adds `.air-review/` to `.gitignore`.

```bash
air-review init
air-review init --provider azure-openai --base-url https://my-res.openai.azure.com/openai/v1
air-review init --provider google --ci github
air-review init --provider bedrock --ci azure-devops
```

| Option                     | Effect                                                |
| -------------------------- | ----------------------------------------------------- |
| `--provider <name>`        | preset id (default `openai`)                          |
| `--base-url <url>`         | endpoint URL (required for placeholder presets)       |
| `--framework <list>`       | comma-separated frameworks (default `angular`)        |
| `--ci <mode>`              | `github`, `azure-devops` or `local` (default `local`) |
| `--model <model>`          | default model, also used as reviewer                  |
| `--planner-model <model>`  | planner role model                                    |
| `--verifier-model <model>` | verifier role model                                   |
| `--base <ref>`             | local mode base ref (default `origin/main`)           |
| `--force`                  | overwrite an existing config file                     |

## doctor

Checks config validity, endpoint resolution, credential presence, model listing or probes, git, SCM access and the cache, in the order they would bite you. The exit code reflects the worst problem (`30` provider, `40` SCM, `20` config). On endpoints without `/models` (Azure, Bedrock, Anthropic) it sends one minimal request per distinct role deployment.

```bash
air-review doctor
air-review doctor --json
```

## example

Copy-paste snippets without reading a manual.

```bash
air-review example                 # provider overview + topic list
air-review example azure-foundry   # one vendor: yaml + env + commands
air-review example ci-github
air-review example ci-azure
air-review example config
air-review example local
air-review example --all
```

## inspect

Shows what the tool understands, without calling a model: PR metadata, changed files, structural facts, mined conventions, detected secrets, and the context plan (exemplars, related modules, repository profile) with the reason for each pick and the estimated token cost.

```bash
air-review inspect --base origin/main
air-review inspect --ci github --owner acme --repo storefront --pr 483
air-review inspect --ci azure-devops --org https://dev.azure.com/acme --project Shop --repo storefront --pr 483
air-review inspect --diff            # also print the raw diff
air-review inspect --json
```

## review and dry-run

The main flow. `dry-run` is exactly `review --dry-run`: it can never publish. Without `--publish` (or `platform.publish: true`), `review` is a dry run too.

```bash
air-review dry-run                            # local branch vs platform.local.base
air-review dry-run --base origin/main
air-review review --publish                   # GitHub / Azure DevOps: comments; local: .air-review/
air-review review --ci github --owner acme --repo storefront --pr 483 --dry-run
air-review review --deterministic-only        # structural rules, zero model calls
air-review review --model gpt-4.1 --verifier-model gpt-4o-mini
air-review review --force                     # re-review the same head
air-review review --json                      # machine-readable result
```

| Option                     | Effect                                                         |
| -------------------------- | -------------------------------------------------------------- |
| `--publish`                | publish findings as PR comments or threads (`review` only)     |
| `--dry-run`                | never publish, even if the config says publish (`review` only) |
| `--model <model>`          | override the reviewer model                                    |
| `--planner-model <model>`  | override the planner model (reserved role)                     |
| `--reviewer-model <model>` | override the reviewer model                                    |
| `--verifier-model <model>` | override the verifier model                                    |
| `--deterministic-only`     | run structural rules without any model call                    |
| `--no-verifier`            | skip the model verification pass (deterministic checks stay)   |
| `--no-cache`               | disable the local result cache                                 |
| `--force`                  | re-review even if the head was already reviewed                |
| `--json`                   | machine-readable output                                        |

Exit codes: `0` gate passed, `10` gate failed, `20` config, `30` provider, `40` SCM, `50` internal. See [Exit codes](/reference/exit-codes).

## explain

Without an id: the stored findings for this PR or branch. With an id: full evidence, suggestion and lifecycle.

```bash
air-review explain
air-review explain arf_7d0b9f
air-review explain arf_7d0b9f --json
```

## models

Lists what the endpoint offers and which role uses each model. Prints a note instead of failing when the endpoint has no model listing.

```bash
air-review models
air-review models --json
```

## telemetry

Recent runs from `.air-review/telemetry.jsonl`: findings, tokens, model calls, cost estimate, duration and gate result.

```bash
air-review telemetry
air-review telemetry --last 50 --json
```

## cache

The cache is content-addressed and only accelerates; deleting it never loses review state.

```bash
air-review cache                       # same as: cache stats
air-review cache stats --json
air-review cache prune --older-than 24
air-review cache prune --kind review
```

## config

Dotted paths; YAML comments are preserved on edits. Bare `config` (or `config list`) prints the effective configuration with secrets masked (`***cdef`).

```bash
air-review config
air-review config get models.roles.reviewer
air-review config set models.roles.reviewer mistral-large-latest
air-review config set review.gate.minimumConfidence 0.95
air-review config unset models.roles.planner
```

Booleans and numbers are coerced. TOML files are rewritten by the serializer, so comments in TOML configs are not kept.

## help

```bash
air-review help
air-review help review
air-review help config set
```

Unknown commands get a typo suggestion.
