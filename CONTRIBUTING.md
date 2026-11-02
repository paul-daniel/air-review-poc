# Contributing to air-review

Thanks for helping. This page is the map for the next developer: how to set up, which scripts do what, where
things live, and how to add the four kinds of things people usually add (a provider preset, an SCM adapter, a
deterministic rule, a framework pack).

## Setup

```bash
# Node.js 22.12 or newer (see .nvmrc / .node-version; `nvm use` or `fnm use` picks it up)
npm install
npm run build
npm test
```

`npm run dev -- <command>` runs the CLI from the TypeScript sources without building (`tsx`).
`npm link` after a build gives you a global `air-review` that tracks `dist/`.

Copy `.env.example` to `.env` when you want a real provider locally; `.env` and `.env.*` are git-ignored.

## Scripts

| Script                 | What it does                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `npm run build`        | compile `src/` to `dist/` with `tsc`                                                     |
| `npm run dev -- ...`   | run the CLI from sources (`tsx src/cli/index.ts`)                                        |
| `npm test`             | unit tests (`vitest run`); `npm run test:watch` to keep them running                     |
| `npm run test:e2e`     | full CLI scenario against a fake model endpoint (`scripts/e2e.mjs`)                      |
| `npm run test:api`     | API-key path end to end against a simulated Foundry API, no paid service                 |
| `npm run demo`         | create the local Git corpus in `test/fixtures/work/airreview-demo`                       |
| `npm run schema`       | regenerate `schema/air-review.schema.json` from the Zod config schema                    |
| `npm run typecheck`    | `tsc --noEmit` (strict, `noUncheckedIndexedAccess`, no unused locals or parameters)      |
| `npm run lint`         | ESLint (flat config, `eslint.config.js`; type-aware rules are off so it stays fast)      |
| `npm run format`       | Prettier `--write` over the repository                                                   |
| `npm run format:check` | Prettier `--check`, what CI runs                                                         |
| `npm run check`        | typecheck + lint + format:check + test, the pre-push gate (also run by `prepublishOnly`) |

### Formatting

Prettier owns formatting (`.prettierrc`: 110 columns, double quotes, trailing commas, semicolons); ESLint
owns correctness and style rules that are not formatting. The two never overlap.

The whole repository was formatted once in a dedicated commit, so `npm run format:check` is clean and CI
fails on formatting. Before pushing, run `npm run check` (typecheck, lint, format check, tests); `npm run
format` fixes formatting and `npx eslint . --fix` fixes the auto-fixable lint rules.

Lint findings in files that were owned by someone else when ESLint landed are listed in
`REVIEW-LINT-FINDINGS.md` (file, rule, one line each). Fix the ones in files you own and delete the file
when it is empty.

## Dry-run everything first

Never test against a real pull request first. The ladder, cheapest rung first:

1. `npm run demo` creates `test/fixtures/work/airreview-demo`: a Git corpus with known defects, a safe
   example, a prompt-injection comment, an unrelated edit, a fix and a regression (tags `demo-01-bugs` ...
   `demo-04-reopened`). `.demo/expected.md` inside it says what a correct review finds.
2. In that directory, `air-review dry-run --base main --deterministic-only` runs the whole pipeline with zero
   model calls: diff, structural facts, deterministic rules, gate, summary. Nothing is published.
3. `npm run test:api` runs the API-key path end to end against a simulated provider on localhost, including
   telemetry, pricing and the error paths (invalid key, malformed JSON, missing usage).
4. Only then point at a real provider, still with `--dry-run`:
   `AIR_REVIEW_PROVIDER=... AIR_REVIEW_API_KEY=... air-review dry-run --base main`. `air-review doctor` first
   if anything looks off.

`air-review review --publish` is the last step, and only against a pull request you own.

## Project layout

```text
src/
  cli/            commander wiring (program.ts), run loop, output helpers, per-command implementations
    commands/     init, doctor, example, inspect, review (+ dry-run), explain, models, telemetry, cache, config
    terminal/     report rendering: layout, code frames, finding blocks (golden-tested in test/)
  contracts/      ModelProvider / ScmAdapter / finding & state types; the engine depends only on these
  config/         Zod schema, defaults, discovery, env overrides, hashing, secret redaction for display
  model/          OpenAI-compatible provider, vendor presets, role routing, endpoint probe, output normalization
  context/        diff parsing, git wrapper, TypeScript facts, repo profile, exemplar planner, analysis,
                  evidence selection
  framework/      DeterministicRule contract + Angular rules and convention mining
  review/         prompts, reviewer, verifier, gate, reconciliation, pipeline orchestration
  scm/            github adapter, azure-devops adapter (+ its http client), local adapter, CI detection (detect.ts)
  state/          PR ledger + finding comment and summary rendering
  cache/          content-addressed local cache
  security/       secret scanning / redaction of what is sent to the model, prompt-injection boundary
  telemetry/      per-run usage log (.air-review/telemetry.jsonl)
  scripts/        generate-schema (compiled, run by `npm run schema`)
  errors.ts       typed errors mapped to exit codes
  version.ts
scripts/          Node scripts run as-is: e2e.mjs, demo.mjs, test-local-api.mjs
test/             vitest suites, fixtures/ (demo corpus is created under fixtures/work/, git-ignored),
                  __snapshots__/ for the terminal golden tests
schema/           generated JSON schema of air-review.yaml
docs/             user documentation (commands, configuration, providers, CI, architecture, security)
```

The dependency direction is one way: `cli` -> `review` -> (`context`, `framework`, `model`, `scm`, `state`)
-> `contracts`. Adding a platform or provider never touches `review/`.

## Adding a provider preset

1. Add the entry to `PROVIDER_PRESETS` in `src/model/presets.ts`: id, label, default `baseUrl`, the
   `apiKeyEnv` the vendor documents, header and prefix conventions, `chatPath`, `modelsPath`, whether
   `/models` exists (`listModels`), a `docsUrl`, and suggested `models` when the names are unambiguous.
   Everything a preset sets must stay overridable from the `endpoint` config section.
2. Document it in `docs/providers.md` (the presets table and, if the vendor has quirks, a "Vendor notes"
   subsection) and add its key variable to `.env.example`.
3. Test the wire shape in `test/provider-config.test.ts`: stub `fetch` and assert the URL, the auth header
   and the body the preset produces.
4. `air-review example` lists presets from `VISIBLE_PRESET_IDS`, and `test/example-command.test.ts` asserts
   that `--all` renders every visible preset; run it to confirm the topic list stayed in sync. If the preset
   needs a bespoke snippet, extend `src/cli/commands/example.ts`.
5. `npm run schema` if the config schema changed (it should not for a plain preset).

## Adding an SCM adapter

1. Implement `ScmAdapter` from `src/contracts/scm.ts` in a new file under `src/scm/`: read the pull request
   snapshot and delta, read/write the state comment, create/update/resolve inline findings, upsert the
   summary. Keep the surface exactly that narrow; the engine never sees platform URLs or pagination.
2. Register it in `src/scm/detect.ts`: extend `CiMode`, detect the platform from its CI environment
   variables (GitHub uses `GITHUB_EVENT_PATH`, Azure Pipelines `TF_BUILD` + `SYSTEM_PULLREQUEST_PULLREQUESTID`),
   and construct the adapter with the token resolved from the env (name the variable in the error message
   when it is missing, never its value). Export it from `src/scm/index.ts`. `src/scm/azure-devops.ts` is the
   most recent adapter and a good second example next to `github.ts`.
3. Inject a fake client in tests the way `test/github-adapter.test.ts` injects an Octokit stub through the
   constructor options: assert unauthenticated reads work, writes without a token fail with the SCM exit
   code, and the marker-based comment discovery finds existing threads.
4. Add the platform's token and variables to `.env.example`, document the setup in `docs/` and add an
   `air-review example ci-<platform>` topic.

## Adding a deterministic rule

A rule is a `DeterministicRule` (`src/framework/rules.ts`): an `id`, an `origin` (`PROJECT_CONFIG`,
`FRAMEWORK`, `REPO_CONVENTION` or `HEURISTIC`), a default `severity`, and `run(ctx)` returning
`CandidateFinding[]`. The `RuleContext` gives you the delta, per-file TypeScript facts, the tracked file
list, `readHead`, a repository `grep`, project facts and the evidence bundle; everything else is off limits.

- Report only what software can decide exactly. If the rule needs judgement, it belongs in a prompt.
- Findings identify by `rule + file + symbol`, never by line, so reuse the symbol names from the facts.
- Add the rule to its pack's export (Angular rules live in `src/framework/angular-rules.ts` and are
  collected into the pipeline's `RULES` in `src/review/pipeline.ts`).
- Test it on a fixture in `test/` (see `test/angular-rules.test.ts`) with a positive, a negative and a
  pre-existing-debt case: existing occurrences are detected but never reported as new.

## Adding a framework pack

A pack is a set of rules plus the facts they need. Angular is the template:

1. Convention mining and version detection in `src/framework/<pack>-conventions.ts`.
2. Rules in `src/framework/<pack>-rules.ts`, exported as an array and added to `RULES` in
   `src/review/pipeline.ts`.
3. Any new structural fact extraction goes in `src/context/` so other packs can reuse it.
4. Make the pack selectable through `frameworks: [<pack>]` in `src/config/schema.ts`, regenerate the schema
   (`npm run schema`), document it in `docs/configuration.md` and cover it in the demo corpus if it has a
   deterministic defect to show.

## Commit messages

Imperative, present tense, one line that reads as the entry of a changelog, as in `git log`:

```text
Give dry-run the same --force switch as review
Document the real agent roles (two model calls today, planner reserved)
```

Group a change and its tests in one commit. Add a body only when the "why" is not obvious from the diff.
Update `CHANGELOG.md` under "Unreleased" for anything a user would notice.

## Nothing in a PR may print secrets

air-review handles API keys and SCM tokens. Rules for every change:

- Never log, echo or interpolate a key or token, not even in debug output or error messages. Name the
  environment variable, not its value.
- Configuration shown to users goes through `redactConfig` in `src/config/redact.ts`; if you add a
  secret-shaped key, make sure the `SECRET_KEY` pattern catches it and add a case to `test/redact.test.ts`.
- Anything sent to a model goes through `src/security/redaction.ts`; new secret shapes are added to
  `SECRET_PATTERNS` with a test in `test/security.test.ts`.
- Fixtures and tests use obviously fake values (`test-token`, `local-test-key`), and `.env.example` shows
  placeholder shapes only.

## Pull requests

- `npm run check` passes locally (see "Formatting" for the current exception) and `npm run test:e2e` and
  `npm run test:api` pass when you touched the pipeline, the CLI or a provider.
- The PR description says what a user sees differently and how you verified it (which rung of the dry-run
  ladder).
- Keep the user-facing example workflow (`.github/workflows/air-review.example.yml`) untouched unless the
  CLI's flags or env names changed; `ci.yml` is this repository's own CI.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Security issues go through
[SECURITY.md](SECURITY.md), not the public tracker.
