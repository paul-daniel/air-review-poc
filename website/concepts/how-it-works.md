# How it works

`air-review` is a fixed pipeline, not an autonomous agent. Every run does the same steps in the same order, makes at most two model calls, and leaves a human-readable trace of each decision. This page explains the pipeline, the two calls and the deterministic backbone around them.

## The pipeline

```text
git diff (merge base … head)
  → parse the diff, read project facts (package.json, tsconfig, framework version)
  → deterministic rules (secret scan, Angular subscription teardown, container/presenter)
  → context plan: pick existing files the reviewer should see
  → model call 1, "reviewer": diff + evidence → JSON findings
  → deterministic verifier (drop out-of-diff anchors, duplicates, unpublishable severities)
  → model call 2, "verifier": re-check each finding against the quoted head-revision code
  → reconcile with the previous run (same id when lines move, resolve, reopen)
  → policy gate (exit code 10 when blocking findings remain)
  → publish: GitHub comments, Azure DevOps threads, or .air-review/ locally
```

The diff is computed from the **merge base** of the base ref and the checked-out commit, which matches pull-request semantics: only what the branch adds is reviewed, not what the target branch gained meanwhile. This is why pipelines need a full clone (`fetch-depth: 0`, `fetchDepth: 0`).

## Three roles, two model calls

| Role                               | Job                                                                                                                            | Model call today?                                                                                   | Recommended model              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------ |
| Context planner                    | decide which existing files the reviewer must see, and how many                                                                | **No**: deterministic exemplar selection; its model slot is reserved for a bounded exploration step | cheap and fast (reserved)      |
| Reviewer (`models.roles.reviewer`) | reason about the change with the evidence bundle                                                                               | **Yes, call 1**                                                                                     | strong code or reasoning model |
| Verifier (`models.roles.verifier`) | check each finding against the quoted head-revision code, drop unproven or duplicate ones, recalibrate severity and confidence | **Yes, call 2**                                                                                     | cheap to medium                |

A typical run therefore costs two model calls: the reviewer, then the verifier. It costs zero with `--deterministic-only`, and zero again on a repeat push where the head and the configuration are unchanged (the ledger says "skipped").

### Call 1: the reviewer

The reviewer receives, inside an explicit untrusted-data envelope:

- the diff, hunk by hunk;
- structural facts about the changed files (symbols, Angular facts, mined conventions);
- the **evidence bundle** built by the planner: exemplars of the same kind, the exported API of imported modules, the repository profile ([Contextual awareness](/concepts/contextual-awareness));
- the deterministic findings already made, so it does not duplicate them.

It answers with structured JSON: findings with severity, confidence, scope, rule origin, anchor (file and lines on the head side) and a suggestion. Prose or code fences around the JSON are tolerated.

### Between the calls: the deterministic verifier

Software, not a model, removes what can be rejected exactly: findings anchored outside the diff, model duplicates of a deterministic finding (by line overlap), severities the config does not publish, anything above `review.maxFindings`. Deterministic findings are **locked** at this point: the model may drop a duplicate it produced itself, never the static-analysis finding.

### Call 2: the verifier

The verifier sees each remaining finding together with the head-revision source around its anchor (8 lines each side). It can drop a claim the code does not support, lower or raise the confidence, and adjust severity. This is what makes "this method does not exist" a checkable statement rather than a guess.

## The deterministic backbone

The model is not the product; the evidence given to it is. Everything that software can decide exactly stays deterministic:

- **Diff parsing and symbol extraction**, with the TypeScript compiler as a library.
- **Rules** (`DeterministicRule`): secret scanning (reported as `BLOCKER` and redacted before anything leaves the machine), Angular subscription lifecycle, repository conventions.
- **Finding identity**: `rule + file + symbol (+ ordinal)`, never the line number, so findings keep their id and their comment thread when code shifts. Model findings keep their id across runs even when the model renames its rule: same file within three lines counts as the same finding, open threads preferred.
- **Reconciliation**: unchanged findings keep their state, findings whose code changed and no longer reproduces are resolved, a resolved finding that reappears is reopened.
- **The policy gate**: open findings in `review.gate.severities` with confidence at least `review.gate.minimumConfidence` fail the run with exit code `10`.
- **The ledger and the cache**: [Memory and privacy](/concepts/memory-and-privacy).

## Rule origins and the finding taxonomy

Every finding states where its rule comes from, because that is what makes it trustworthy, or not:

| Origin            | Example                              | Authority   | Behaviour                               |
| ----------------- | ------------------------------------ | ----------- | --------------------------------------- |
| `PROJECT_CONFIG`  | tsconfig strictness, security policy | very strong | checked deterministically when possible |
| `FRAMEWORK`       | Angular lifecycle APIs               | strong      | matched to the version actually used    |
| `REPO_CONVENTION` | container/presenter split            | variable    | requires several relevant precedents    |
| `HEURISTIC`       | "this could be more readable"        | weak        | rarely blocking                         |

| Field      | Values                                                                  |
| ---------- | ----------------------------------------------------------------------- |
| severity   | `BLOCKER`, `CRITICAL`, `MAJOR`, `MINOR`, `INFO`                         |
| confidence | `0..1`, independent of severity                                         |
| scope      | `IN_PR` (fix here), `FOLLOW_UP` (separate task), `REPO_WIDE` (systemic) |

Severity and confidence are separate fields, so an unsure-but-serious finding is reported honestly instead of being silently promoted or dropped. Existing repository debt is detected but never imitated: a change that reproduces a known-bad pattern gets an `IN_PR` finding for the new occurrence, not a request to refactor the repository.

## Known limitation

Findings about how the change interacts with **untouched** code are anchored on unchanged lines and are currently discarded by the strict-anchor rule rather than published as `FOLLOW_UP`. The roadmap lists this as worth revisiting.

## Where the pieces live

```text
src/
  contracts/    ModelProvider / ScmAdapter / finding and state types
  config/       schema, defaults, discovery, env overrides, hashing
  model/        OpenAI-compatible provider, presets, role routing, output normalization
  context/      diff parsing, git wrapper, TypeScript facts, repo profile, exemplar planner
  framework/    deterministic rules + Angular convention mining
  review/       prompts, reviewer, verifier, gate, reconciliation, pipeline
  scm/          github, azure-devops and local adapters, CI detection
  state/        PR ledger + finding comment rendering
  cache/        content-addressed local cache
  security/     secret redaction, prompt-injection detection
  cli/          commander wiring and per-command implementations
```

Adding a platform or a provider never touches the review engine: a new SCM is a `ScmAdapter`, a new vendor is a preset, a new framework pack is a set of `DeterministicRule`s plus structural facts.
