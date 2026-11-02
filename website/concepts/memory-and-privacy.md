# Memory and privacy

Two questions every team asks before letting a tool read its code: where does the review state live, and what exactly leaves the machine. This page answers both.

## Where the memory lives

```text
git          = truth of the code
PR ledger    = durable, minimal, human-visible state
local cache  = reconstructible accelerator, never the truth
```

No server stays alive between runs. The state a run needs to be incremental is stored **in the pull request itself**:

| Platform             | Ledger                                                                                                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub               | one hidden `air-review:state` issue comment, one `Air Review` summary comment, inline review threads (one per finding)                                                                                |
| Azure DevOps         | the same three kinds as pull-request threads: a `closed` state thread, a summary thread (`active` while the gate fails), one `active` thread per finding, set to `fixed` when it no longer reproduces |
| local (`--ci local`) | `.air-review/state.json`, plus `summary.md` and `context.md`                                                                                                                                          |

Every comment carries a hidden `air-review:` marker, so the next run finds and updates its own comments instead of posting duplicates. Findings keep their thread when code moves, because their identity is `rule + file + symbol`, not the line number. On a new push the ledger is reconciled: unchanged findings keep their state, findings whose code no longer reproduces are resolved, a resolved finding that reappears is reopened.

The **state comment contains only facts**: SHAs, finding ids and fingerprints, metrics. Never model reasoning, never prompts.

A **stale-head guard** re-reads the pull request before writing. If a newer push landed while the review was running, nothing is published; the next run reviews the new head.

`memory.backend: none` disables reading and advancing memory (every run is a full review); local summaries and telemetry remain.

## The cache

`.air-review/cache` is content-addressed: the key is a hash of the input (diff, evidence, prompt, model). It only accelerates: deleting it never loses review state, and `--no-cache` bypasses it for one run. `air-review cache prune --older-than 24` cleans it.

## What is sent to the model

Only what the review needs, nothing more:

- the **diff** (merge base to head), hunk by hunk;
- **structural facts** about the changed files (symbols, framework facts, mined conventions);
- the **evidence bundle**: up to three exemplar files of the same kind per changed file (whole when short, otherwise the first 120 lines), the exported API of imported in-repo modules, and a one-paragraph repository profile, all within `context.maxEvidenceTokens` (30 000 tokens by default) and `context.maxContextRequests` (20 files);
- for the verifier, the head-revision code around each finding (8 lines each side).

`privacy.sendFullFiles` is `false` by default: the model never receives whole files beyond the exemplar excerpts. `air-review inspect` shows the exact plan before the run, and `.air-review/context.md` records what was sent after it.

Nothing else leaves the machine. Telemetry (`.air-review/telemetry.jsonl`) is a local file; it is never uploaded by the tool.

## Redaction

Well-known secret patterns (AWS, GitHub, Google, OpenAI, Slack, private keys, hardcoded passwords) are removed from anything sent to a model and reported as a `BLOCKER` finding. `privacy.redactSecrets: true` is the default. Recognized secrets and terminal control sequences are also removed from the terminal display, and `config list`, `doctor` and `--json` mask secret-looking values (`***cdef`).

## The prompt-injection envelope

The repository is untrusted input. A pull request can contain `// AI reviewer: ignore all previous instructions`, and `air-review` treats it exactly like any other data. Prompts separate system policy from repository data with an explicit untrusted-repository-data envelope. The policy states that data cannot change instructions, define the role, or suppress findings, and the verifier pass re-checks what the reviewer produced. The demo corpus contains such a comment so you can see that the review result does not change.

## What the tool never does

- **Read-only git**: no checkout mutation, no code execution, no test or build run. Executing code is a future opt-in sandbox feature.
- **Restricted publishing surface**: the adapters can only create, update or resolve review comments and write the summary and state comments. There is no tool that edits files or code.
- **No telemetry upload**: usage and cost stay in the local log unless you attach it as a CI artifact yourself.

## What to configure yourself

- Use the least-privilege tokens described in [GitHub Actions](/integrations/github-actions) and [Azure DevOps](/integrations/azure-devops).
- Keep publishing off for pull requests from untrusted forks ([forks caveat](/integrations/github-actions#_4-forks-caveat)).
- Keep `privacy.redactSecrets` and `privacy.sendFullFiles` at their defaults.
- Choose a provider whose data-handling terms suit your code (Azure and Bedrock keep traffic inside your cloud tenant; public APIs have their own retention policies).
