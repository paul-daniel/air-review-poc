# Architecture

air-review implements the **Selective Structural Context Review (SSCR)**
pipeline:

```
PR delta → structural analysis → context plan → targeted evidence
        → strong reviewer → deterministic + AI verifier → finding ledger
        → native PR comments
```

Three logical roles, not a swarm of agents. Two of them are model calls today;
the third is deterministic and keeps its model slot reserved:

| Role                                        | Job                                                                                                                         | Model call today?                                                                                                          | Recommended model           |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Context Planner                             | decide which existing files the reviewer must see, and how many                                                             | **No** — deterministic exemplar selection (below); the configured model is reserved for a bounded agentic exploration step | cheap/fast (reserved)       |
| Review Analyst (`models.roles.reviewer`)    | reason about the change with the evidence bundle                                                                            | **Yes — call 1**                                                                                                           | strong code/reasoning model |
| Verifier / Editor (`models.roles.verifier`) | check each finding against the quoted head-revision code, drop unproven/duplicate ones, recalibrate severity and confidence | **Yes — call 2**                                                                                                           | cheap to medium             |

A typical run therefore makes **two model calls** (reviewer, then verifier) —
or zero with `--deterministic-only`, and zero again on repeat pushes where the
head and configuration are unchanged.

Everything else is deterministic software: diff parsing, symbol extraction,
Angular facts, convention mining, exemplar planning, secret scanning, finding
identity, the policy gate, the ledger and the cache.

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
those in-repo modules (`related-modules`), so "this method does not exist" is
a checkable claim rather than a guess, and it attaches a one-paragraph
**repository profile** (languages, frameworks, package manager, test tools,
translation folders, lint setup) built from the tracked file list and
`package.json`. `air-review inspect` prints the whole plan with the reason for
each pick, so a human can audit what the model was shown before paying for it.

## Rule origins and finding taxonomy

Every finding states where its rule comes from, because that is what makes it
trustworthy — or not:

| Origin            | Example                              | Authority   | Behaviour                               |
| ----------------- | ------------------------------------ | ----------- | --------------------------------------- |
| `PROJECT_CONFIG`  | tsconfig strictness, security policy | very strong | checked deterministically when possible |
| `FRAMEWORK`       | Angular lifecycle APIs               | strong      | matched to the version actually used    |
| `REPO_CONVENTION` | container/presenter split            | variable    | requires several relevant precedents    |
| `HEURISTIC`       | "this could be more readable"        | weak        | rarely blocking                         |

Severity and confidence are separate fields, so an unsure-but-serious finding
is reported honestly instead of being silently promoted or dropped. Scope says
where a fix belongs:

| Field      | Values                                                                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| severity   | `BLOCKER`, `CRITICAL`, `MAJOR`, `MINOR`, `INFO`                                                                                                                                |
| confidence | `0..1`, independent of severity                                                                                                                                                |
| scope      | `IN_PR` (fix here; the only scope that can fail the gate), `FOLLOW_UP` (separate task, including findings on unchanged code the change interacts with), `REPO_WIDE` (systemic) |

Existing repository debt is detected but never imitated: a PR that reproduces
a known-bad pattern gets an `IN_PR` finding for the new occurrence, not a
request to refactor the repository.

## Source layout

```text
src/
  contracts/    ModelProvider / ScmAdapter / finding & state types
  config/       schema, defaults, discovery, env overrides, hashing
  model/        openai-compatible provider, role routing, output normalization
  context/      diff parsing, git wrapper, TypeScript facts, repo profile,
                exemplar planner, analysis
  framework/    deterministic rules + Angular convention mining
  review/       prompts, reviewer, verifier, gate, reconciliation, pipeline
  scm/          github adapter, local adapter, CI detection
  state/        PR ledger + finding comment rendering
  cache/        content-addressed local cache
  security/     secret redaction, prompt-injection detection
  cli/          commander wiring and per-command implementations
```

Adding a platform or provider never touches the review engine:

```text
air-review core
    ├── ModelProvider ← OpenAI-compatible (OpenAI, Azure OpenAI, Mistral, ...)
    ├── ScmAdapter    ← github / azure-devops / local / (bitbucket later)
    ├── FrameworkAnalyzer ← angular / (react, spring later)
    └── DeterministicRule ← subscription lifecycle, conventions, secrets
```

## Finding lifecycle

Identity is `rule + file + symbol (+ ordinal)` — never the line number — so
findings keep their id and comment thread when code shifts. The fingerprint
adds severity, scope and the effective config hash.

On a new push the ledger is reconciled: unchanged findings keep their state,
findings whose code changed and no longer reproduces are resolved, and a
resolved finding that reappears is reopened.

## Memory model

```text
git          = truth of the code
PR ledger    = durable, minimal, human-visible state
local cache  = reconstructible accelerator, never the truth
```

The GitHub adapter maintains three comment kinds: inline finding threads, one
`Air Review` summary, and one machine-readable `air-review:state` comment.
The Azure DevOps adapter keeps the same three kinds as pull-request threads
(see [docs/azure-devops.md](azure-devops.md)).
