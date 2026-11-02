# Review format: what the main AI reviewers do, and what air-review chose

## How the leading tools format their feedback

| Aspect            | CodeRabbit                                                                                                                                                                                                                                                                                                                                                                      | Qodo / PR-Agent                                                                                                                                                                                                                                                                                            | GitHub Copilot code review                                                                                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Top-level comment | a **walkthrough** posted "at the top of every pull request", with "Changed files summary", "Sequence diagrams", "Estimated review effort" (1–5), "Merge Risk", related issues/PRs, suggested labels and reviewers ([walkthroughs](https://docs.coderabbit.ai/pr-reviews/walkthroughs.md))                                                                                       | one review comment, edited in place on later runs (`persistent_comment`), with "Estimated effort to review", "Relevant tests", "Security concerns", key issues, an optional score and ticket compliance ([review tool](https://raw.githubusercontent.com/qodo-ai/pr-agent/main/docs/docs/tools/review.md)) | an overview comment that "indicates whether Copilot has determined the pull request ready to approve" and shows the effort level used ([Copilot code review](https://docs.github.com/en/copilot/concepts/code-review/code-review)) |
| Inline comment    | category badge (Security & Privacy, Stability & Availability, Data Integrity & Integration, Functional Correctness, Performance & Scalability, Maintainability & Code Quality) plus severity Critical 🔴 / Major 🟠 / Minor 🟡 / Trivial 🔵 / Info ⚪; one-click apply of suggested changes ([code review overview](https://docs.coderabbit.ai/guides/code-review-overview.md)) | findings "anchored to specific code" in the Files changed view, each with an explanation, line references and "fix prompts and remediation guidance"; severity High/Medium/Low ([Qodo code review](https://docs.qodo.ai/code-review/use-qodo-in-prs/code-review.md))                                       | "identifies issues, and suggests fixes you can apply in a couple of clicks"                                                                                                                                                        |
| Finding axes      | type (Nitpick, Potential issue, Refactor suggestion), severity, category, effort/reward, kept as "separate axes" ([findings](https://docs.coderabbit.ai/change-stack/findings.md))                                                                                                                                                                                              | severity, plus labels on the PR (`Review effort x/5`, `Possible security concern`)                                                                                                                                                                                                                         | none documented                                                                                                                                                                                                                    |
| Verdict           | "Merge Risk" Minimal / Low / Moderate / High / Critical, "for the commit it reviewed"; approval withheld when the rating is unavailable ([merge risk](https://docs.coderabbit.ai/pr-reviews/merge-risk.md))                                                                                                                                                                     | `require_merge_recommendation`: `no_concerns_found`, `needs_review`, `changes_required`                                                                                                                                                                                                                    | approving review possible when enabled; "If new commits are pushed after an approval, the approval is dismissed"                                                                                                                   |
| New pushes        | "Incremental review" that "focuses on newly added changes" and "Maintains conversation context"                                                                                                                                                                                                                                                                                 | `persistent_finding_state` tracks findings "across complete reviews so they can be resolved and reopened"; incremental reviews do not resolve absent findings                                                                                                                                              | reviews once by default, or "every time you push a new commit" when configured                                                                                                                                                     |
| Extras            | poem (off by default), fortune while waiting, auto-fix commits                                                                                                                                                                                                                                                                                                                  | TODO scan, "can be split" check, large-PR chunking                                                                                                                                                                                                                                                         | hand-off to the Copilot cloud agent for fixes                                                                                                                                                                                      |

Three lessons drive our choices: every tool separates **where** (inline) from
**what it means overall** (one top-level comment); every tool labels findings
on more than one axis; and the mature ones treat a second push as an
**incremental** event that updates existing comments rather than posting
again.

## air-review's format

### One summary comment, updated in place

````markdown
## Air Review — ❌ Changes requested

> reviewed `3f9c1a2e` · 2 open · 1 resolved · tier **heavy** (`gpt-5-codex`) · cost ~$0.031 · 24.8 s

**Routing**

**Tier:** `heavy` · **Reviewer:** `gpt-5-codex` · **Verifier:** `gpt-5-mini` · decided by deterministic thresholds

Signals: 19 file(s), +812/−40 lines, module(s): apps/api, apps/web, libs/shared

- 19 files ≥ 10
- 852 changed lines ≥ 400
- 3 modules touched ≥ 3 (apps/api, apps/web, libs/shared)

### Findings (2 open)

|     | Severity | Category    | Location                                                        | Finding                                       | Scope |
| --- | -------- | ----------- | --------------------------------------------------------------- | --------------------------------------------- | ----- |
| 🛑  | CRITICAL | Correctness | `libs/shared/src/pricing/discount.ts:21`                        | Loyalty discount treats percent as a fraction | IN_PR |
| 🟠  | MAJOR    | Correctness | `apps/web/src/app/features/orders/order-alerts.component.ts:18` | Subscription may outlive its component        | IN_PR |

### Since the last review

- ✅ resolved `arf_7d0b9f` — offending code changed

<details><summary>Cost and duration per step — total ~$0.031, 3 model call(s), 24.8 s</summary>
| Step | Status | Agent · model | Duration | Input | Cached | Output | Est. cost |
…
</details>

<details><summary>Workflow actually executed</summary>
```mermaid …```
</details>

<sub>air-review 0.2.0 · run `ar_1b2c3d4e` · the state thread holds the machine-readable ledger</sub>
````

Choices and why:

- **Verdict first.** The heading carries the decision a reviewer would cast
  (Approved, Approved with suggestions, Changes requested, Commented). That
  is what CodeRabbit's merge risk and Copilot's "ready to approve" give a
  reader in one glance; on Azure DevOps the same verdict becomes the vote.
- **Routing block.** None of the compared tools says which model reviewed or
  why. air-review does, because a cost-aware team needs to audit the tier
  decision and tune thresholds (see [observability.md](observability.md)).
- **Findings table** sorted by severity with category and exact location,
  like Qodo's key issues, so the comment stays useful when inline threads are
  collapsed.
- **"Since the last review"** lists resolved and reopened findings of this
  run: the incremental story, in one place, as CodeRabbit's incremental
  reviews and PR-Agent's persistent finding state do.
- **Collapsed observability** (cost per step, workflow diagram) keeps the
  comment short while making every run auditable.
- **Hidden markers** (`<!-- air-review:summary:v1 -->`, `<!-- air-review:state:v1 -->`,
  `<!-- air-review:finding:<id> -->`) let the next run find and update its own
  comments; nothing is ever posted twice.

### One inline thread per finding

````markdown
### 🛑 CRITICAL · Correctness — Loyalty discount treats percent as a fraction

`libs/shared/src/pricing/discount.ts:21` · `applyLoyaltyDiscount`

`percent` is a whole number (10 for 10 %), but the formula multiplies by `1 - percent`,
which yields a negative amount for any percent above 1 and is rounded before being
charged. `applyPercentDiscount` in the same file divides by 100 first.

**Fix:** Divide by 100 like `applyPercentDiscount` does, and reuse that helper instead of a second formula.

```typescript
return applyPercentDiscount(amountMinor, percent);
```
````

**Evidence**

- code-example: libs/shared/src/pricing/discount.ts (`applyPercentDiscount` divides by 100)
- Angular 19

<sub>Scope IN_PR · confidence 0.93 · rule `pricing.percent-as-fraction` (REPO_CONVENTION) · air-review-id arf_1f3a9c</sub>

`````

Choices and why:

- **Severity + category + title** on the first line, as CodeRabbit's badge
  and severity do, so a reader filters at a glance. Categories: correctness,
  security, performance, maintainability, consistency (differs from how this
  repository does it), tests, docs.
- **Severity, confidence and scope stay separate.** `BLOCKER`, `CRITICAL`,
  `MAJOR`, `MINOR`, `INFO` say how bad; confidence (0–1) says how sure;
  scope (`IN_PR`, `FOLLOW_UP`, `REPO_WIDE`) says where the fix belongs. Only
  `IN_PR` findings above the configured confidence can fail the gate, so an
  unsure-but-serious finding is reported honestly without blocking.
- **Consequence, then fix.** The body states what breaks; `**Fix:**` is one
  repository-consistent sentence, optionally followed by code. On GitHub the
  code becomes a committable ```` ```suggestion ```` block **only** when the
  reviewer marked it `replacesAnchor` (an exact drop-in for the anchored
  lines); otherwise, and always on Azure DevOps, which has no such feature,
  it is a normal fenced block. We would rather show an example than offer a
  one-click change that does not apply cleanly.
- **Evidence** names the repository file or framework fact the finding rests
  on: a reviewer can check it, and the verifier did.
- **Machine footer** (scope, confidence, rule, origin, id) keeps the thread
  self-describing for `air-review explain <id>` and for the ledger.

### Lifecycle on new pushes

A finding's identity is `rule + file + symbol`, never the line number, so a
thread survives code moving. On a new push the delta is computed from the
last reviewed head: findings whose code changed and no longer reproduce get a
"Resolved" reply and the thread status `fixed` (Azure DevOps) or
"resolved" (GitHub); a finding that reappears is reopened in its original
thread; unchanged findings keep their thread untouched; a push that only
touches docs or an already reviewed head makes no model call at all.

### What we deliberately do not do

- No poem, no fortune, no sequence diagrams: the summary should take ten
  seconds to read.
- No effort score or "can be split" verdict for now: the routing tier and
  signals already say how big the change is, with the numbers behind it.
- No automatic fix commits or pull requests: the tool is read-only on the
  repository and only ever writes comments, a vote and an optional status.
- No labels on the pull request: Azure DevOps has none, and the summary
  already carries the information.
`````
