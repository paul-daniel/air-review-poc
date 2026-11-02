# Product and engineering assessment — 11 October 2026

This is the owner's-eye review of air-review that Daniel asked for: what the
tool really does today, where it falls short of its promise, what was changed
in this pass, and what to build next. It is written for a reader who is not a
TypeScript or AI expert.

## 1. What the tool actually does today

A review run is a fixed pipeline, not an autonomous agent:

```
git diff (base…head)
  → parse the diff, read project facts
  → deterministic rules (secret scan, Angular subscription teardown, container/presenter)
  → context plan: pick existing files the reviewer should see          ← new in this pass
  → model call 1, "reviewer": diff + evidence → JSON findings
  → deterministic verifier (drop out-of-diff anchors, duplicates, unpublishable severities)
  → model call 2, "verifier": re-check each finding against the quoted code   ← code quoting new
  → reconcile with the previous run (same id when lines move, resolve, reopen)
  → policy gate (exit code 10 when blocking findings remain)
  → publish: GitHub inline comments + summary + state, or .air-review/ locally
```

Two model calls per run, zero when nothing changed, zero with
`--deterministic-only`. Memory is a JSON ledger stored in a PR comment (GitHub)
or `.air-review/state.json` (local), so no server has to stay alive between
runs and every run can start from a clean context. That design matches what
Daniel described and is the right one for a CI tool.

## 2. Honest verdict on the state I found

**Architecture: good bones, correct instincts.** Clear contracts
(`ModelProvider`, `ScmAdapter`, `DeterministicRule`), providers and platforms
behind interfaces, severity separated from confidence, stable finding ids,
secrets redacted before anything leaves the machine, an explicit
untrusted-data envelope in prompts, a stale-head guard before publishing,
telemetry with per-role cost. Tests: 138 passing before this pass, now 150+,
with an end-to-end run against a fake provider. This is well above the
average "prototype" quality.

**The core promise was not delivered.** The README sells "contextual review"
and "evidence gathering", but the reviewer received only: the diff, a list of
Angular symbols in the changed files, a count of container/presenter pairs
found by file name, and the Angular version. **Not one line of any existing
file was ever shown to the model.** The "planner" role existed in config and
telemetry but made no decision. So the behaviour Daniel wants, "look at two or
three solid components and judge consistency", "check how other translations
are added", was not possible. This was the number one gap and is now fixed
(section 3).

**Angular-only.** Every structural fact and both deterministic rules are
Angular-specific. A React, .NET or Python repository got a bare diff. The new
exemplar planner and repository profile are language-agnostic, which turns the
Angular pack into what it should be: an optional extra.

**Microsoft Foundry guidance was partly wrong.** The docs insisted on the
resource endpoint and said "do not use the project endpoint". Microsoft's
current documentation accepts both `https://<res>.openai.azure.com/openai/v1`
and `https://<res>.services.ai.azure.com/openai/v1`, and the Foundry _project_
endpoint `https://<res>.services.ai.azure.com/api/projects/<p>/openai/v1` is
the documented route for Foundry Models (DeepSeek, Grok, MAI…) with an Entra ID
bearer token. Entra ID (keyless) is Microsoft's recommended auth and the tool
had no way to send a bearer token on Azure hosts. Both are fixed. The Bedrock
preset pointed at the old `bedrock-runtime…/openai/v1` host; the current
OpenAI-compatible surface is Bedrock Mantle.

**The verifier could not verify.** Model call 2 received only the reviewer's
own text, never the code, so it could only judge whether a finding _sounded_
plausible. It now receives the head-revision source around each anchor.

**Doctor could not prove an Azure setup.** With no `/models` route on Azure,
`doctor` reported "check skipped" and the first paid review was the first real
test. It now sends a tiny probe request per distinct deployment.

**Azure Repos was missing** although it is Daniel's primary pipeline; the docs
told Azure Pipelines users to fall back to local mode. An adapter now exists
(`--ci azure-devops`, auto-detected in Azure Pipelines). It was verified
against Microsoft's REST reference (api-version 7.1) and 15 tests with a fake
HTTP client, **not yet against a live organisation**: the first real PR run is
the next step and may surface small differences (Markdown rendering of
API-created comments, thread size limits).

**Repository hygiene** was incomplete for a project meant to be handed to
other developers: no linter or formatter, no CI for the repo itself, no
`.env.example`, no CONTRIBUTING/SECURITY/CHANGELOG. All added; ESLint is clean
(ESLint 10 was chosen because 9 is in maintenance mode). Prettier has not been
run on the existing files yet, on purpose: that is a 70-file formatting-only
diff that deserves its own commit, so the CI formatting step is non-blocking
until then.

**Smaller defects found while reading:** default paths in the OpenAI-compatible
client disagreed with the presets (`/v1/models` vs `/models`); several
messages still spoke of models being "pulled locally" (Ollama leftovers);
the JSON-schema capability flag was declared but never used (`response_format`
is always plain `json_object`, which is fine for now); a large uncommitted
"terminal UI" change (chalk, syntax-highlighted code frames) sat on top of the
last commit — it works and is kept, but it should be committed on its own.

## 3. What changed in this pass

| Area           | Change                                                                                                                                                                                         | Where                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Context engine | Exemplar planner: same-kind files ranked by proximity, 1–3 per changed file depending on change size, explicit "no precedent" notes, token and file budgets, secret redaction of exemplar text | `src/context/exemplars.ts`, `src/context/analyze.ts`                                           |
| Context engine | Related modules: exported API of imported in-repo modules                                                                                                                                      | `src/context/exemplars.ts`                                                                     |
| Context engine | Repository profile: languages, frameworks, package manager, tests, i18n folders, lint config                                                                                                   | `src/context/profile.ts`                                                                       |
| Prompt         | New sections and rules for exemplars, plan notes, related modules; profile replaces Angular-only facts                                                                                         | `src/review/prompts.ts`                                                                        |
| Verifier       | Quotes ±8 lines of head-revision code per finding                                                                                                                                              | `src/review/verifier.ts`, `src/review/pipeline.ts`                                             |
| Inspect        | Shows the context plan, reasons, token estimate, profile                                                                                                                                       | `src/cli/commands/inspect.ts`                                                                  |
| Foundry        | Accepts resource and project endpoints, appends `/openai/v1`; bearer auth (`AIR_REVIEW_ACCESS_TOKEN`, `endpoint.auth`)                                                                         | `src/model/resolve.ts`, `src/config/loader.ts`, `src/config/schema.ts`, `src/model/presets.ts` |
| Bedrock        | Preset points at Bedrock Mantle                                                                                                                                                                | `src/model/presets.ts`                                                                         |
| Transport      | Responses API with `endpoint.api: auto` (switches on `400 unsupported`), needed by gpt-5-codex                                                                                                 | `src/model/openai-compatible.ts`                                                               |
| Prompt         | Correctness-first checklist (arithmetic, conditions, null handling, lifecycle) before consistency                                                                                              | `src/review/prompts.ts`                                                                        |
| Ledger         | Deterministic findings locked and deduped against model duplicates; no anchor shift on full re-reviews; unreported findings resolved; stable ids for renamed model rules                       | `src/review/verifier.ts`, `src/review/reconcile.ts`                                            |
| Doctor         | Probe request per distinct deployment when no model listing exists                                                                                                                             | `src/model/probe.ts`, `src/cli/commands/doctor.ts`                                             |
| Azure Repos    | New SCM adapter: PR threads as memory (state, summary, inline findings), Azure Pipelines auto-detection, docs                                                                                  | `src/scm/azure-devops*.ts`, `docs/azure-devops.md`                                             |
| Hygiene        | ESLint + Prettier, CI workflow, `.env.example`, CONTRIBUTING, SECURITY, CHANGELOG, Code of Conduct                                                                                             | repo root                                                                                      |
| Tests          | Exemplar planner and profile, Foundry URL shapes and bearer auth, Azure adapter                                                                                                                | `test/`                                                                                        |

## 3b. Live validation on Microsoft Foundry (11 October 2026, evening)

After Daniel signed in with `az login`, the tool was run against his real
resource `airreview-resource` (Sweden Central) with Entra ID bearer tokens,
never a key:

| Step                                                                         | Result                                                                                                                                                                                     |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `doctor`                                                                     | endpoint resolved to `…/openai/v1`; credential reported as `AIR_REVIEW_ACCESS_TOKEN · Authorization: Bearer`; three deployments probed in 0.7–2.0 s for about 59 tokens                    |
| `airreview-review-codex` (gpt-5-codex)                                       | rejects Chat Completions with `400 The requested operation is unsupported`; the new `auto` wire mode switched it to the Responses API and it reviewed normally (reasoning tokens reported) |
| `dry-run`, gpt-4.1-mini as reviewer and verifier                             | 2 calls, 5.2 s, ≈$0.002; verifier dropped a duplicate                                                                                                                                      |
| `dry-run`, codex reviewer + mini verifier, first prompt                      | 2 calls, 13.1 s, ≈$0.019; subscription leak found with the repository exemplar cited; discount bug **missed**                                                                              |
| Same corpus without the prompt-injection comment                             | discount bug still missed: the prompt, not the injection, was the cause                                                                                                                    |
| `dry-run` after adding an explicit correctness-first checklist to the prompt | 2 calls, 17 s, ≈$0.024; **discount bug found as CRITICAL with the right fix**, injection resisted, exemplar (`reference.component.ts`) cited, gate failed as it should                     |

Five defects were found and fixed only because of these live runs, each with
a regression test: the verifier dropped the deterministic finding instead of
the model's duplicate (now the model duplicate is removed deterministically,
by line overlap, before the model is even asked); a forced re-review shifted a
carried-over finding from line 7 to line 16 of a 10-line file; findings a full
re-review no longer reported lingered as duplicates forever; model findings
got a new id every run because the model renames its rule each time (now
matched by file and line proximity, open threads first); and `doctor`
mislabelled the credential source. The final confirming run: 2 calls, 17.7 s,
≈$0.025, two open findings (CRITICAL discount formula at 0.9 confidence,
MAJOR subscription leak at 0.94), gate failed as policy requires, one model
duplicate dropped before verification.

**Real Angular application, validated live.** `realworld-apps/angular-realworld-example-app`
(Angular 21, 5.6k stars) was cloned and three of its open pull requests were reviewed in local mode
(`--ci local --base main`) with the codex reviewer:

| PR   | Change                                                         | Result                                                                                                                                                                                |
| ---- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #327 | service refactor, 3 files                                      | no finding, 26 s, ≈$0.038; exemplars: sibling `comments.service.ts` and its spec                                                                                                      |
| #363 | accessibility, 2 HTML files                                    | no finding (correct), a few seconds                                                                                                                                                   |
| #350 | auth hardening, 9 files incl. a 9,961-line `package-lock.json` | **CRITICAL found: the JWT is no longer persisted in production builds, so every reload logs the user out**; 27 s, ≈$0.036, 8,064 of 9,010 input tokens served from the provider cache |

PR #350 first failed twice and each failure became a fix: a `429` because two reviews ran in parallel against a
10K tokens-per-minute deployment (now retried with `Retry-After` backoff), then `status: incomplete`
because gpt-5-codex spent the whole 4k output budget on hidden reasoning (now a configurable 16k
`review.maxOutputTokens`, with usage recorded and a clear hint). The lock file is now filtered out of the
reviewer diff. In the New Foundry portal every chat deployment of `airreview-resource` has the default
10K TPM quota; raising `airreview-review-codex` to 50K TPM is recommended before pipelines run in parallel.

**Pull-request pipeline path, validated live on GitHub.** Without any
token, the GitHub adapter reviewed the public pull request
`angular/components#31439` (4 changed files in a 4,548-file repository):
PR metadata and diff came from the live GitHub API, exemplars and the profile
from a local checkout of the PR head, and the Foundry codex reviewer answered
in 20.6 s for about $0.03, with 1,024 input tokens served from the provider's
prompt cache. It reported no finding: the one candidate ("ripple radius
ignores the custom thumb width") was anchored on unchanged lines and dropped
by the strict-anchor rule. That is a known limitation worth revisiting:
findings about how the change _interacts_ with untouched code are currently
discarded rather than published as `FOLLOW_UP`.

**Azure DevOps, validated live on 12 October.** With a PAT from Daniel, the Angular app was pushed to
`dev.azure.com/dantchatchouang/air-review-test-angular`, the air-review source to a second repository in the
project, a YAML pipeline, a variable group (Foundry key as a secret), the build-service permission and a build
validation policy were created, and a pull request was opened. New organisations get no hosted agent minutes,
so a self-hosted agent was registered on this Mac. The PR-triggered run checked out both repositories, built the
CLI, reviewed the PR with the Foundry deployments and published the CRITICAL JWT finding, the state thread and
the summary thread as the project build service, then failed the build (exit 10) so the policy blocked the merge.
Two defects came out of it and are fixed with tests: Azure DevOps refuses edits to comments authored by another
identity (manual run with a PAT, then the pipeline), and a target branch that moves during a PR discarded the
ledger and duplicated threads. See docs/azure-devops.md "Validated live".

## 4. Answers to the open questions

**Rust?** No. The structural analysis uses the TypeScript compiler as a
library, the SCM SDKs and the fastest-moving model APIs are JavaScript-first,
and a review is network-bound (two HTTPS calls), so a faster language changes
nothing a user can feel. If "single binary, no Node on the agent" ever
matters, Node's single-executable build or Bun can package the same code.

**Agents or simple models?** Keep the deterministic backbone with two fixed
model calls, and add _bounded_ agency only where it pays: a context explorer
that may call a few read-only tools (list directory, read file, grep) with a
hard cap of N calls, triggered only when the planner reports uncertainty (new
kind with no precedent, cross-module change). Unbounded agents are slow,
expensive, hard to reproduce and a prompt-injection surface; a CI reviewer
must be predictable in cost and time. The ledger-in-comments design already
gives "purge context between runs and get it back".

**One model or several?** Roles, not vendors, are what the engine consumes.
Today all three roles share one endpoint. Per-role endpoints (a cheap verifier
on one vendor, a strong reviewer on another) is a small change to
`createProvider` and worth doing once the first real Foundry runs show the
cost split.

**API keys or something better?** API keys in CI secret stores, surfaced as
environment variables, remain the right default for every platform. For Azure
specifically, Entra ID with a pipeline service connection is better (no key to
rotate) and is now supported through `AIR_REVIEW_ACCESS_TOKEN`.

## 5. What to do next, in order

1. **First real Foundry run** on the demo corpus, keyless, following
   [live-check.md](live-check.md) step by step (`az login`, list deployments,
   `doctor`, `inspect`, `dry-run`). This could not be done in the audit session:
   the Azure CLI session on this Mac had expired and signing in needs Daniel.
   Read the two model calls' output with `--json`; tune the exemplar budget if
   the prompt is too long for the deployment.
2. **Azure DevOps dry-run** on a real PR, also in [live-check.md](live-check.md),
   then `--publish`.
3. **Commit the work in three commits**: the earlier terminal UI pass, this
   pass's engine/Foundry/Azure work, and one formatting-only commit after
   `npm run format`.
4. **Quality benchmark**: a small corpus of PRs with known-good and known-bad
   changes per stack (Angular, React, .NET), scored on precision, so prompt and
   budget changes are measured rather than felt.
5. **Bounded context explorer** (section 4) and per-role endpoints.
6. **Framework packs** beyond Angular, now that the core is language-agnostic:
   React/Next, NestJS, .NET; each pack is a set of `DeterministicRule`s plus
   structural facts.
7. **Bitbucket adapter**, same shape as the Azure one.
8. **Responses API transport** for Azure OpenAI models when a deployment
   requires it.
