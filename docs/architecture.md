# Architecture

air-review implements a **Selective Structural Context Review** pipeline with
complexity routing:

```text
PR delta (incremental) → structural analysis → deterministic rules
   → triage (which reviewer agent?) → reviewer (light | standard | heavy)
   → deterministic + model verifier → ledger reconciliation → policy gate
   → publish (threads) → vote → run report (cost per step, workflow diagram)
```

Four logical roles, each one model call at most, each with its own
configurable model (or Foundry agent):

| Role                                                                              | Job                                                                                                    | Model call?                                                                 | Typical model                                    |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------ |
| Triage (`models.roles.triage`)                                                    | measure the change and decide the complexity tier                                                      | only in `routing.mode: model`, or in `hybrid` for the ambiguous middle band | cheap/fast                                       |
| Context Planner (`models.roles.planner`)                                          | decide which existing files the reviewer must see                                                      | **no** — deterministic exemplar selection; the model slot is reserved       | cheap (reserved)                                 |
| Review Analyst (`models.roles.reviewer`, overridden per tier by `models.tiers.*`) | reason about the change with the evidence bundle                                                       | **yes** — unless nothing new is reviewable                                  | light: cheap · standard/heavy: strong code model |
| Verifier (`models.roles.verifier`, per tier too)                                  | check each finding against the quoted head-revision code, drop unproven or duplicate ones, recalibrate | **yes** — when there is at least one candidate                              | cheap to medium                                  |

A typical run makes two or three model calls; zero on a re-queued build of an
already reviewed head, zero on a docs-only push, zero with
`--deterministic-only`.

Everything else is deterministic software: diff parsing, symbol extraction,
Angular facts, convention mining, exemplar planning, secret scanning,
complexity measurement, finding identity, the policy gate, the verdict, the
ledger, the cache, the trace and the reports.

## Routing by complexity

`src/review/triage.ts` measures the delta that is worth a model's attention
(files whose kind is not in `review.modelSkipKinds`):

| Signal                                                                                                    | Example                                                                           |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| files, added and removed lines                                                                            | `19 files, +812/−40`                                                              |
| top-level modules touched                                                                                 | `apps/web`, `apps/api`, `libs/shared` (workspace roots are expanded one level)    |
| file kinds                                                                                                | `translation` (i18n folders), `docs`, `data`, `config`, `tests`, `code`, `binary` |
| non-code only, tests only, largest single-file change, API-surface files (`index`, `routes`, `schema`...) |                                                                                   |

Deterministic decision (`routing.light` / `routing.heavy` thresholds):

1. nothing reviewable → light, no model call at all;
2. no source code changed (translation, data, docs or config only) → **light**;
3. any heavy threshold hit (files ≥ 10, lines ≥ 400, modules ≥ 3) → **heavy**;
4. within the light limits (≤ 3 files, ≤ 150 lines, one module) → **light**;
5. otherwise **standard**, flagged _ambiguous_.

In `hybrid` mode (default) the triage model is consulted only for case 5 and
sees the deterministic pre-assessment plus a compact, redacted view of the
diff; in `model` mode it decides every time; in `deterministic` mode it is
never called. `--tier` overrides everything. Whatever decided, the tier, the
models it maps to (`resolveTierModels`) and the reasons are stored in the
`RoutingDecision` that every summary, report and telemetry line carries.

## Contextual awareness: the exemplar planner

"Contextual" means the reviewer sees how _this_ repository already does the
same kind of thing. For every changed file the planner (`src/context/exemplars.ts`):

1. Determines the file's **kind** from its name: `order.container.ts` →
   `container.ts`, `fr.json` → `json`, `Button.tsx` → `tsx`.
2. Finds existing files of the same kind that are not part of the change,
   ignoring build output, dependencies and binaries.
3. Ranks them by proximity: same directory, then sibling directory, then same
   feature folder, then anywhere in the repository.
4. Decides **how many** it needs: a new file gets up to three exemplars, a
   heavily rewritten file two, a small edit one, a translation or test file one.
5. Sends each exemplar whole when it is short, otherwise its first 120 lines,
   within `context.maxEvidenceTokens` and `context.maxContextRequests`.
6. When a new file has **no precedent**, it tells the model so explicitly; the
   prompt then asks for widely accepted practice labelled `FRAMEWORK` or
   `HEURISTIC`, never a fabricated `REPO_CONVENTION`.

It also resolves the change's relative imports and sends the exported API of
those in-repo modules (`related-modules`), and attaches a one-paragraph
**repository profile** (languages, frameworks, package manager, test tools,
translation folders, lint setup). `air-review inspect` prints the whole plan
with the reason for each pick.

## Finding taxonomy

Every finding states where its rule comes from, what kind of problem it is,
how bad, how sure, and where the fix belongs:

| Field      | Values                                                                                                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ruleOrigin | `PROJECT_CONFIG` (very strong, checked deterministically when possible), `FRAMEWORK` (strong), `REPO_CONVENTION` (needs several precedents), `HEURISTIC` (weak, rarely blocking) |
| category   | `correctness`, `security`, `performance`, `maintainability`, `consistency`, `tests`, `docs`                                                                                      |
| severity   | `BLOCKER`, `CRITICAL`, `MAJOR`, `MINOR`, `INFO`                                                                                                                                  |
| confidence | `0..1`, independent of severity                                                                                                                                                  |
| scope      | `IN_PR` (fix here; the only scope that can fail the gate), `FOLLOW_UP` (separate task, including findings on unchanged code the change interacts with), `REPO_WIDE` (systemic)   |

Existing repository debt is detected but never imitated: a PR that reproduces
a known-bad pattern gets an `IN_PR` finding for the new occurrence, not a
request to refactor the repository. The rendering of these fields is
explained in [review-format.md](review-format.md).

## Verdict and gate

`evaluateGate` fails on open `IN_PR` findings whose severity is in
`review.gate.severities` and whose confidence is at least
`review.gate.minimumConfidence`. `decideVerdict` then maps the run to what a
reviewer would cast: `approve` (nothing open), `approve-with-suggestions`
(open but nothing blocking), `request-changes` (gate failed), `comment` (the
run could not complete; never a vote on partial data). Exit code `10` means
the gate failed; the Azure DevOps adapter turns the verdict into a vote.

## Source layout

```text
src/
  contracts/    ModelProvider / ScmAdapter / finding, routing, trace & state types
  config/       schema, defaults, discovery, env overrides, hashing
  model/        openai-compatible, foundry-agent and mock providers; role & tier routing
  context/      diff parsing, git wrapper, TypeScript facts, repo profile, exemplar planner
  framework/    deterministic rules + Angular convention mining
  review/       prompts, triage, reviewer, verifier, gate, verdict, reconciliation, pipeline
  scm/          github, azure-devops and local adapters, CI detection
  state/        PR ledger, finding comment and summary rendering
  telemetry/    run trace, cost estimation, run report, workflow diagram, run log
  cache/        content-addressed local cache
  security/     secret redaction, prompt-injection detection
  cli/          commander wiring and per-command implementations
```

Adding a platform, a provider or a rule never touches the review engine:

```text
air-review core
    ├── ModelProvider     ← openai-compatible (OpenAI, Azure OpenAI, Foundry v1, Bedrock, ...)
    │                       azure-foundry-agent (prompt agents), mock (offline)
    ├── ScmAdapter        ← github / azure-devops / local / (bitbucket later)
    ├── FrameworkAnalyzer ← angular / (react, spring later)
    └── DeterministicRule ← subscription lifecycle, conventions, secrets
```

## Finding lifecycle

Identity is `rule + file + symbol (+ ordinal)` — never the line number — so
findings keep their id and comment thread when code shifts. The fingerprint
adds severity, scope and the effective config hash.

On a new push the delta is computed from the last reviewed head and the
ledger is reconciled: unchanged findings keep their state, findings whose
code changed and no longer reproduce are resolved, a resolved finding that
reappears is reopened in its original thread, and model findings that
rename their rule between runs are matched by file and line proximity.

## Memory model

```text
git            = truth of the code
PR ledger      = durable, minimal, human-visible state (SHAs, findings, routing of the last run, events)
local cache    = reconstructible accelerator, never the truth
run reports    = observability only (.air-review/reports), safe to delete
```

The GitHub adapter maintains three comment kinds: inline finding threads, one
`Air Review` summary, and one machine-readable `air-review:state` comment.
The Azure DevOps adapter keeps the same three kinds as pull-request threads,
de-duplicated by hidden markers (see [docs/azure-devops.md](azure-devops.md)).

## Observability

`src/telemetry/trace.ts` records every step with its duration, agent/model,
tokens and estimated cost; `report.ts` writes `.air-review/reports/<run>.md`
and `.json`; `workflow-diagram.ts` draws the path actually taken as Mermaid.
See [observability.md](observability.md).
