# Commands

Every command has its own help with examples:

```bash
air-review --help            # all commands, common flows, exit codes
air-review help review       # same as: air-review review --help
air-review example           # copy-paste snippets, topic by topic
```

Global options accepted by every command:

| Option            | Effect                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------- |
| `--config <file>` | use a specific config file                                                                   |
| `--plain`         | plain ASCII output for CI logs (no colors or animation)                                      |
| `--color [mode]`  | `always` (default), `auto` for terminal detection, or `never`; bare `--color` means `always` |
| `--no-color`      | disable colors (`NO_COLOR` is respected too)                                                 |
| `--no-animation`  | disable the progress spinner and report reveal                                               |
| `--ascii`         | use ASCII separators and disable animation                                                   |

## init

Write an annotated config for a provider preset. Fails loudly when a preset
needs a real URL (`azure-openai`, `azure-foundry`, `openai-compatible`).

```bash
air-review init
air-review init --provider azure-openai --base-url https://my-res.openai.azure.com/openai/v1
air-review init --provider bedrock --ci github
```

It also adds `.air-review/` to `.gitignore`.

## doctor

Checks config validity, endpoint resolution, API key presence, model listing,
git, SCM access and the cache — in the order they would bite you. Exit code
reflects the worst problem (30 provider, 40 SCM, 20 config).

```bash
air-review doctor
air-review doctor --json
```

## example

Copy-paste snippets without reading a manual. The default view is short; ask
for a topic or everything.

```bash
air-review example                 # provider overview + topic list
air-review example azure-openai    # one vendor: yaml + env + commands
air-review example ci-github
air-review example ci-azure
air-review example config
air-review example local
air-review example --all
```

## inspect

Shows what the tool understands — PR metadata, changed files, structural
facts, mined conventions, detected secrets — without calling a model.

```bash
air-review inspect --base origin/main
air-review inspect --ci github --owner acme --repo storefront --pr 483
air-review inspect --ci azure-devops --org https://dev.azure.com/acme --project Shop --repo storefront --pr 483
air-review inspect --diff            # also print the raw diff
air-review inspect --json
```

## review / dry-run

The main flow. `dry-run` is exactly `review --dry-run`: it can never publish.
Dry-run is the default unless `--publish` is passed or `platform.publish: true`
is set.

```bash
air-review dry-run                            # local branch vs platform.local.base
air-review dry-run --base origin/main
air-review review --publish                   # GitHub: comments; local: .air-review/
air-review review --ci github --owner acme --repo storefront --pr 483 --dry-run
air-review review --deterministic-only        # structural rules, zero model calls
air-review review --model gpt-4.1 --verifier-model gpt-4o-mini
air-review review --force                     # re-review the same head
air-review review --json                      # machine-readable result
```

Useful switches: `--ci auto|github|local`, `--base`, `--owner/--repo/--pr`,
`--model`, `--planner-model`, `--reviewer-model`, `--verifier-model`,
`--deterministic-only`, `--no-verifier`, `--no-cache`, `--json`.

Exit codes: `0` gate passed, `10` gate failed, `20` config, `30` provider,
`40` SCM, `50` internal.

## explain

Without an id: the stored findings for this PR. With an id: full evidence,
suggestion and lifecycle.

```bash
air-review explain
air-review explain arf_7d0b9f
air-review explain arf_7d0b9f --json
```

## models

Lists what the endpoint offers and which agent role uses each model. Prints a
note instead of failing when the endpoint has no model listing.

```bash
air-review models
air-review models --json
```

## telemetry

Recent runs from `.air-review/telemetry.jsonl`: findings, tokens, model calls,
cost estimate, duration and gate result.

```bash
air-review telemetry
air-review telemetry --last 50 --json
```

## cache

The cache is content-addressed and only accelerates; deleting it never loses
review state.

```bash
air-review cache                       # same as: cache stats
air-review cache stats --json
air-review cache prune --older-than 24
air-review cache prune --kind review
```

## config

Dotted paths; YAML comments are preserved on edits. Bare `config` (or
`config list`) prints the effective configuration with secrets masked.

```bash
air-review config
air-review config get models.roles.reviewer
air-review config set models.roles.reviewer mistral-large-latest
air-review config set review.gate.minimumConfidence 0.95
air-review config unset models.roles.planner
```

Non-secret values like `apiKeyEnv` (a variable name) are shown as-is; actual
key values are masked (`***cdef`).

## help

```bash
air-review help
air-review help review
air-review help config set
```

### Terminal review layout

Colors are on by default, including through terminal wrappers. Run the usual
review command with no styling flags. `NO_COLOR`, `FORCE_COLOR=0`, `--no-color`
or `--color=never` disable colors; an explicit `--color=always` (or `--color`)
overrides the environment. `--plain` always wins. Use `--color=auto` if you
prefer automatic terminal detection, or `--plain` for unstyled CI logs.
`--json` always produces unstyled machine-readable data.

Each finding starts with its severity, location and title, followed by source
code and concise review prose. Confidence and repository evidence sit in
secondary metadata. Recommendations can include a syntax-highlighted fix
example. `explain <id>` uses the same layout and adds the full evidence and
lifecycle. The model provides structured data; only the renderer controls
colors and layout.

Code excerpts come from the reviewed Git revision. They show a language label,
line numbers, a dark background and blue highlighting across the affected
range, without enclosing boxes. Long ranges show the first and last portions
with an omission marker. Text and code wrap to the terminal width (up to 112
columns), accounting for Unicode and ANSI styles. Recognized secrets and
terminal control sequences are removed from display text.

Progress animates during work; reports reveal in at most 12 short steps in
interactive terminals. `--no-animation` or `AIR_REVIEW_ANIMATION=0` disables
motion. JSON, redirected output, `--plain`, `--ascii` and limited terminals
have no animation. Review headers separate the issue count from the blocking
policy result. Usage spells out input, cached input, output and reasoning
tokens alongside the estimated cost and usage by role.

[Preview rendered from the demo review](assets/terminal-review.png)
