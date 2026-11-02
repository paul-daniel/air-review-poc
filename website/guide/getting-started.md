# Getting started

This tutorial takes you from a fresh clone to a first real review in about fifteen minutes. You will:

1. install `air-review` from the repository;
2. run a free, offline review on the demo corpus (no API key, no model call);
3. run a first real review with a model provider;
4. read the output and the files it writes.

## Prerequisites

- Node.js 22.12 or newer (`node --version`).
- Git.
- For step 3 only: an API key or token for one model provider. The [integration guides](/integrations/microsoft-foundry) explain how to get one.

## 1. Install from the repository

The tool is a TypeScript project. Build it once, then link the `air-review` command into your shell.

```bash
git clone <url-of-the-air-review-repository> air-review
cd air-review
npm install
npm run build
npm link
```

Check the command is available:

```bash
air-review --version
air-review --help
```

::: tip
`npm link` creates a global symlink to this checkout. After you pull new commits, run `npm run build` again; the linked command picks up the new build immediately.
:::

## 2. The free local dry-run

The repository ships a generator for a small Git corpus with known defects. It costs nothing to run and needs no provider.

```bash
npm run demo
```

The command creates `test/fixtures/work/airreview-demo`, a Git repository checked out at the tag `demo-01-bugs` (the scenarios were committed on a branch named `demo-scenarios`). The base branch is `main`. The corpus contains:

- `src/app/widget.component.ts`: a subscription that is never torn down (a deterministic rule catches this);
- `src/app/price.ts`: a discount formula that divides by 1 instead of 100, with a prompt-injection comment on top (only a model catches this);
- `src/app/safe.component.ts` and `src/app/legacy.component.ts`: a correct component and pre-existing debt that must not be flagged as new.

Move into the corpus and run the deterministic rules only. `--deterministic-only` makes zero model calls:

```bash
cd test/fixtures/work/airreview-demo
air-review inspect --base main
air-review dry-run --base main --deterministic-only
```

What to expect:

- `inspect` prints the changed files, the structural facts and the context plan (which existing files would be shown to a model, and why). No model is called.
- `dry-run --deterministic-only` reports one MAJOR finding on `widget.component.ts`. `safe.component.ts` and `legacy.component.ts` stay clean. The exit code is `0`, because the default gate only blocks on `BLOCKER` and `CRITICAL`.

The corpus has four tagged scenarios. `git checkout demo-02-unrelated`, `demo-03-fixed` and `demo-04-reopened` let you watch a finding stay open, get resolved, then reopen with the same id. The file `.demo/expected.md` in the corpus explains what each scenario should produce.

## 3. A first real review

Pick a provider and export its variables. The example below uses OpenAI; every other provider works the same way with a different preset id and key variable (see [Other providers](/integrations/other-providers), [Microsoft Foundry](/integrations/microsoft-foundry) or [Amazon Bedrock](/integrations/amazon-bedrock)).

```bash
export AIR_REVIEW_PROVIDER=openai
export OPENAI_API_KEY=sk-...
export AIR_REVIEW_MODEL_REVIEWER=gpt-4.1
export AIR_REVIEW_MODEL_VERIFIER=gpt-4o-mini
```

::: warning Keys never go into files you commit
Export keys in your shell or put them in a `.env` file that is listed in `.gitignore`. The [local developer guide](/integrations/local-developer) shows a safe setup with `.env` and direnv.
:::

Check everything before paying for a token:

```bash
air-review doctor
```

`doctor` prints the resolved endpoint, the variable the credential was read from, the models each role uses, and the state of Git and the SCM adapter. On endpoints without a model listing (Azure) it sends one tiny probe per deployment instead.

Then run the full review, still without publishing anything:

```bash
air-review dry-run --base main
```

With a capable reviewer model you get two findings: the deterministic subscription finding and a CRITICAL finding on `price.ts` (the discount formula). The prompt-injection comment in `price.ts` must not change the result.

## 4. Reading the output

A finding shows, in this order:

1. severity, file, line range and a short title;
2. the source code of the affected range, syntax-highlighted, taken from the reviewed revision;
3. the explanation, then a fix example when the model proposes one;
4. a secondary line with the confidence (0 to 1), the rule origin (`PROJECT_CONFIG`, `FRAMEWORK`, `REPO_CONVENTION`, `HEURISTIC`) and the scope (`IN_PR`, `FOLLOW_UP`, `REPO_WIDE`).

The header separates the number of findings from the policy result: "gate passed" or "gate failed". The last block, "Usage & cost", lists input, cached input, output and reasoning tokens per role, the number of API calls, the duration, and a dollar estimate when pricing is configured (see [Choosing models](/concepts/choosing-models)).

Useful switches:

```bash
air-review dry-run --base main --json > run.json   # machine-readable result
air-review dry-run --base main --plain              # ASCII logs for CI
air-review explain                                  # list stored findings
air-review explain arf_7d0b9f                       # one finding with its evidence
```

## 5. What `.air-review/` contains

Every local review writes to `.air-review/` in the reviewed repository. `air-review init` adds this folder to `.gitignore`; add it yourself if you skipped `init`.

| File              | Purpose                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `state.json`      | The local ledger: reviewed SHAs, findings, their ids and lifecycle (open, resolved, reopened) |
| `summary.md`      | The human-readable summary of the last run, the same table that would be posted to a PR       |
| `context.md`      | What was sent to the model: exemplars, related modules, repository profile                    |
| `telemetry.jsonl` | One JSON line per run: tokens, calls, cost estimate, duration, gate result                    |
| `cache/`          | Content-addressed cache of model results; safe to delete at any time                          |

On GitHub and Azure DevOps the ledger lives in the pull request instead (comments or threads); `.air-review/` then only holds the cache, the telemetry log and the local summaries.

## Next steps

- Put it in a pipeline: [Azure DevOps](/integrations/azure-devops) or [GitHub Actions](/integrations/github-actions).
- Understand what the model sees and why: [Contextual awareness](/concepts/contextual-awareness).
- Tune the gate and the models: [Configuration](/reference/configuration), [Choosing models](/concepts/choosing-models).
