# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Collapsed memory thread.** The state thread's JSON ledger is now wrapped in a `<details>` block
  (closed by default, one title line) with the JSON in a fenced code block, so the activity feed of
  the pull request shows the review comments first. Ledgers written by 0.3.0 and earlier are still read.

## [0.3.0] - 2026-11-03 — Foundry SDKs, Claude, reviewer behaviour

### Added

- **Official SDKs for Microsoft Foundry.** `provider: azure-foundry` / `azure-openai` now go through the
  `openai` package for every model behind `/openai/v1` (GPT, DeepSeek, Llama, Grok, Mistral, model router)
  and `provider: azure-foundry-agent` through `@azure/ai-projects` (`getOpenAIClient` + `agent_reference`).
  Credentials follow Microsoft's guidance: API key, a provided access token, or keyless Microsoft Entra ID via
  `DefaultAzureCredential` (`az login`, managed identity, service connection); `doctor` prints which is used.
- **Claude on Foundry.** Deployments whose name starts with `claude`, or written `claude:<deployment>`, are
  called through `@anthropic-ai/foundry-sdk` on the resource's `/anthropic` route and can be chosen per role
  and tier like any other deployment. Not run live yet (no Claude deployment on the test resource).
- **`NITPICK` severity.** Reviewer preference, never blocks. The gate now blocks on every open `BLOCKER`,
  `CRITICAL`, `MAJOR`, `MINOR` finding at confidence ≥ 0.6; `NITPICK` and `INFO` only turn "Approved" into
  "Approved with suggestions".
- **Follow-ups in the same thread.** A push that touches the code around an open finding without settling it
  gets a reply in the existing thread with the remaining change (never a second thread or a rewritten first
  comment); a resolved finding that comes back is reactivated the same way.
- **`air-review approve`.** Approval is the pipeline's last step: with `platform.azureDevops.vote.mode:
pipeline` (default) the review step only votes "waiting for author" when blocked, and `approve`, run after
  build and tests with `condition: succeeded()`, casts 10 or 5 from the review memory in the pull request,
  refusing a head the review did not examine. `mode: immediate` keeps single-step pipelines.
- **Getting-started guide** in English and French (`docs/getting-started.md`, `docs/fr/demarrage.md`).

### Changed

- The generic hand-written HTTP client is only used for non-Azure vendors.
- Example pipeline shows the three-step layout (review, build and tests, approve).

## [0.2.0] - 2026-11-03 — MVP V1

### Added

- **Routing by complexity.** A `triage` role and per-tier models (`models.tiers.light` / `heavy`,
  `AIR_REVIEW_MODEL_REVIEWER_LIGHT|HEAVY`, `AIR_REVIEW_MODEL_VERIFIER_LIGHT|HEAVY`). `review/triage.ts`
  measures the delta (files, lines, modules, file kinds) and picks `light`, `standard` or `heavy`; in
  `routing.mode: hybrid` a cheap triage model refines the ambiguous middle band, `model` lets it decide every
  time, `deterministic` never calls it. `--tier` overrides. The decision, its method and its reasons are shown
  in the terminal, the summary comment, the run report, `--json` and the telemetry log.
- **Observability.** A per-step trace (duration, agent/model, tokens, estimated cost) for load state, delta,
  analysis, rules, triage, reviewer, verifier, reconcile, gate, publish and verdict; a Markdown + JSON run
  report in `.air-review/reports/<run>`; a Mermaid diagram of the workflow actually executed (cached and
  skipped steps greyed, unused tiers shown as not selected); `telemetry.jsonl` lines carry `verdict`, `routing`
  and `steps[]`.
- **Review format.** Findings carry a `category` (correctness, security, performance, maintainability,
  consistency, tests, docs). Inline comments lead with severity and category, state the consequence, give the
  fix as a sentence plus an optional code block (a committable ```suggestion on GitHub when the reviewer
  declares `replacesAnchor`), list the evidence and end with a machine-readable footer. The summary comment
  opens with the verdict, shows the routing decision, a findings table, "since the last review", and collapsed
  cost and workflow sections. Rationale and comparison with CodeRabbit, Qodo/PR-Agent and GitHub Copilot in
  docs/review-format.md.
- **Azure DevOps as a real reviewer.** Vote from the verdict (10 approved, 5 approved with suggestions,
  -5 waiting for author, 0 when the run could not complete; `platform.azureDevops.vote`), an optional pull-request
  status `air-review/gate` for a Status branch policy (`platform.azureDevops.status`), and finding threads looked
  up by their hidden marker before any creation so a lost ledger or an identity change never duplicates a thread.
- **Incremental review and cache.** A head already reviewed with the same configuration is never reviewed again,
  even with `--publish` (`--force` overrides); a push whose delta has no model-worthy file
  (`review.modelSkipKinds`, default docs and binaries) costs no model call; the reviewer input cache is shown as a
  cache hit in the step table.
- **Providers.** `azure-foundry-agent` calls one Foundry Agent Service prompt agent per role through the
  project endpoint; `mock` is an offline, free, deterministic provider for tests and demos.
- **Verdict** (`approve`, `approve-with-suggestions`, `request-changes`, `comment`) derived once in
  `review/verdict.ts` and used by the summary, the vote and the exit code.
- Documentation: docs/foundry.md (deployments and prompt agents, interchangeable models, start-up procedure,
  model router), docs/review-format.md, docs/observability.md, a rewritten docs/azure-devops.md with the
  ready-to-use examples/azure-pipelines.yml, examples/air-review.foundry.yaml, updated architecture,
  configuration, providers and commands references.

### Changed

- `ScmAdapter.upsertSummary(summary, findings)` receives the findings so the summary can list them;
  `castVote` casts the verdict rather than a gate boolean.
- `configHash` uses the configured (standard-tier) models, so a light follow-up push stays incremental against a
  heavy first review.
- Usage is reported per role for four roles (`triage`, `planner`, `reviewer`, `verifier`).

### Removed

- The reserved Ollama provider, the `features` section and the legacy `openai:` config section
  (use `endpoint:`).

## [Unreleased]

### Added

- Azure DevOps: the reviewing identity adds itself as a reviewer and votes: approved when no finding is open,
  "waiting for author" while blocking findings remain, no vote otherwise. It never completes or merges the PR.
- Contextual awareness: an exemplar planner selects existing files of the same kind as each changed file
  (up to three for a new file, one for a small edit or a translation), ranked by directory proximity and bounded
  by `context.maxEvidenceTokens` / `context.maxContextRequests`; the reviewer prompt receives them together with
  the exported API of imported in-repo modules and a language-agnostic repository profile (languages,
  frameworks, package manager, test tools, translation folders, lint setup). When a new file has no precedent
  the model is told so and asked for general good practice instead of a fabricated repository convention.
  `air-review inspect` prints the plan, the reason for each pick and the estimated token cost.
  Inside a directory, files of the same name family (`slider.ts` for `slider-thumb.ts`) rank above unrelated
  neighbours and barrel `index.*` files rank last.
- Responses API transport: `endpoint.api` (`auto` | `chat-completions` | `responses`, env `AIR_REVIEW_API`).
  In `auto` mode a deployment that answers `400 unsupported` to Chat Completions (gpt-5-codex on Azure) is
  switched to `/responses` transparently; usage, cached and reasoning tokens are mapped from both protocols.
- The verifier model now sees the head-revision code around every finding (8 lines each side) so it can
  reject claims the code does not support.
- `air-review doctor` probes each distinct deployment with a minimal request when the endpoint has no model
  listing (Azure), proving the key, URL and deployment names before a review pays for them.
- Terminal report renderer with syntax-highlighted code frames, language labels, affected lines and fix
  examples; a progress spinner and report reveal in interactive terminals, with `--no-animation`, `--plain`,
  `--ascii`, `--color [mode]` and `--json` escape hatches.
- `air-review dry-run`: the full review with nothing published, now with the same `--force` switch as `review`.
- `air-review example`: copy-paste snippets per provider, CI platform, config and local flow; every command
  documents its own examples and unknown commands get a typo suggestion.
- `air-review telemetry`: recent runs with tokens, cost estimate and duration; per-role usage reporting
  (planner, reviewer, verifier) with cached-input and reasoning-token subsets when the API reports them.
- Vendor presets: OpenAI, Azure OpenAI, Microsoft Foundry, Amazon Bedrock, Google Gemini, Anthropic, Mistral,
  Groq, OpenRouter, Together AI, Fireworks AI and any custom OpenAI-compatible gateway, each with its URL and
  authentication conventions pre-filled.
- Environment-first configuration (`AIR_REVIEW_PROVIDER`, `AIR_REVIEW_BASE_URL`, `AIR_REVIEW_API_KEY`,
  `AIR_REVIEW_MODEL_*`, `AIR_REVIEW_PRICING`, `AIR_REVIEW_MAX_TOKENS_PARAMETER`, ...), so a pipeline needs no
  config file.
- Short-lived bearer tokens for the model endpoint (`AIR_REVIEW_ACCESS_TOKEN`, `AIR_REVIEW_AUTH`), for
  Microsoft Entra ID and OAuth gateways.
- Local demo corpus (`npm run demo`) with known defects, a prompt-injection comment, an unrelated edit, a fix
  and a regression, plus a free end-to-end run against a simulated Foundry API (`npm run test:api`).
- French first-run guide for Microsoft Foundry and a verification report (`docs/first-local-test.fr.md`,
  `docs/verification-report.fr.md`).
- Local summaries: every local review writes `.air-review/summary.md` and `.air-review/context.md`.
- TOML configuration support alongside YAML and JSON; `config set/unset` preserves YAML comments.
- Azure DevOps adapter (`--ci azure-devops`, auto-detected in Azure Pipelines): review threads, summary and
  state live in the pull request; `air-review example ci-azure` prints the pipeline setup. Entra ID access
  tokens are accepted as `AZURE_DEVOPS_ACCESS_TOKEN` (bearer) next to PATs and `System.AccessToken`, and
  `docs/live-check.md` walks through a fully keyless first run on Foundry and Azure DevOps.
- Token-optional GitHub reads (public repositories work without a token; publishing still requires one).
- Project tooling: ESLint flat config, Prettier, EditorConfig, `.nvmrc`/`.node-version`, `.env.example`,
  CONTRIBUTING, SECURITY and CODE_OF_CONDUCT guides, and a GitHub Actions CI workflow for this repository.

### Changed

- Reviews default to hosted OpenAI-compatible endpoints; the local Ollama provider is hidden behind the
  disabled `features.ollama` flag and no longer part of the pipeline path.
- Diffs are computed from the merge base of the base ref and the checked-out commit, matching pull-request
  semantics.
- Microsoft Foundry: accepts the resource or project endpoint and appends `/openai/v1` automatically; Azure
  presets omit `temperature` and send `max_completion_tokens` for reasoning-model compatibility.
- Amazon Bedrock preset documents both OpenAI-compatible hosts: `bedrock-runtime.<region>.amazonaws.com/openai/v1`
  (AWS-recommended, the default) and the `bedrock-mantle.<region>.api.aws/v1` compatibility host.
- Documentation reorganised into `docs/` (commands, configuration, providers, CI, architecture, security,
  troubleshooting) with the real agent roles documented: two model calls today, the planner reserved.
- `npm run lint` now runs ESLint; the TypeScript check moved to `npm run typecheck`.

### Fixed

- A target branch that advances while a pull request is open no longer discards the review ledger: the review
  is redone from the new base and existing threads are updated or resolved instead of duplicated.
- Repository identity is parsed correctly from Azure Repos clone URLs (`project/_git/repo`).
- Azure DevOps: comments authored by another identity (a developer's PAT, then the pipeline's build service) cannot
  be edited, so the adapter now replaces the state and summary threads and replies to finding threads instead of
  failing with 403; the newest marker thread is always the one read back.
- Reviewer output budget is configurable (`review.maxOutputTokens`, default 16k instead of a hard-coded 4k):
  reasoning deployments such as gpt-5-codex spent the whole 4k on hidden reasoning and answered "incomplete" on a
  real pull request. Usage is now recorded even when the answer is unusable, and the error says what to raise.
- Rate limits and transient provider errors (429, 5xx, timeouts) are retried up to four times with the
  server's `Retry-After` or exponential backoff (capped at 60 s) instead of failing the review; a note is printed
  on each retry.
- Lock files, minified bundles, snapshots and binaries keep their place in the changed-file list but their hunks
  are replaced by a one-line note in the reviewer prompt, so a 10,000-line `package-lock.json` can no longer push
  the real code out of the diff window.
- Model findings on unchanged lines of a changed file (how the change interacts with existing code) are kept as
  `FOLLOW_UP` findings instead of being dropped; GitHub publishes them as a general pull-request comment when a
  review comment cannot be anchored outside the diff. Only `IN_PR` findings can fail the gate.
- Deterministic findings are locked during model verification: the model may drop a duplicate it produced
  itself, never the static-analysis finding (seen live: the verifier dropped the rule-based finding first).
- Full re-reviews (`--force`, first run, config change) no longer shift carried-over anchors by the lines of
  the whole diff (a finding on line 7 of a 10-line file was moved to line 16), and findings a full re-review
  did not report again are resolved instead of lingering as duplicates.
- Model findings keep their id across runs even when the model renames its rule ("discount-percent-misuse"
  vs "discount-percent-calculation"): same file within three lines counts as the same finding, open threads
  preferred. Deterministic rule ids never inherit or lend an id this way.
- `doctor` names the real credential source (`AIR_REVIEW_ACCESS_TOKEN`, `AIR_REVIEW_API_KEY`) and the header
  it is sent in, instead of always printing the preset variable name.
- OpenAI-compatible client defaults (`/models`, `/chat/completions`) now match the presets, and messages no
  longer talk about models being "pulled locally".
- Model responses wrapped in prose or code fences are parsed resiliently instead of failing the run.
- Secrets never appear in `config list`, `doctor` or `--json` output: secret-looking keys are masked.
- Reconciliation keeps a finding's id and thread when code shifts, resolves findings that no longer
  reproduce and reopens resolved findings that come back.
- Dead code removed from the CLI and review pipeline.

## [0.1.0] - 2026-10-05

### Added

- First MVP: contextual AI code review CLI for GitHub pull requests with an Angular context pack,
  deterministic rules (subscription lifecycle, repository conventions, secret scanning), a policy gate with
  exit code `10`, a PR ledger for incremental re-reviews and a content-addressed local cache.
- GitHub adapter tested with an injected Octokit client.
