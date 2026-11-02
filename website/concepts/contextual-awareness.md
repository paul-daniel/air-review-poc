# Contextual awareness

"Contextual" means the reviewer sees how **this** repository already does the same kind of thing. A new component is judged next to two or three existing components; a translation edit is judged next to its sibling language file. This page explains what the planner selects, why, and how to audit it before paying for a token.

## Why it matters

A model that only sees a diff can judge syntax and general practice. It cannot know that your repository names containers `*.container.ts`, that every service already exposes a `destroy$` subject, or that `fr.json` must mirror `en.json` key for key. Either it invents a "convention" that does not exist, or it stays silent on the real one. The planner closes that gap with evidence, not with more prompt text.

## The exemplar planner

For every changed file the planner (`src/context/exemplars.ts`):

1. **Determines the file's kind** from its name: `order.container.ts` → `container.ts`, `fr.json` → `json`, `Button.tsx` → `tsx`.
2. **Finds existing files of the same kind** that are not part of the change, ignoring build output, dependencies and binaries.
3. **Ranks them by proximity**: same directory, then sibling directory, then same feature folder, then anywhere in the repository. Inside a directory, files of the same name family (`slider.ts` for `slider-thumb.ts`) rank above unrelated neighbours, and barrel `index.*` files rank last.
4. **Decides how many it needs**: a new file gets up to three exemplars, a heavily rewritten file two, a small edit one, a translation or test file one.
5. **Sends each exemplar whole** when it is short, otherwise its first 120 lines, within two budgets: `context.maxEvidenceTokens` (default 30 000 tokens) and `context.maxContextRequests` (default 20 files).

## Related modules

The planner resolves the change's **relative imports** and sends the exported API of those in-repo modules (`related-modules`). The reviewer can then check that a called method exists and has the right shape, instead of guessing from the import name.

## The repository profile

A one-paragraph, language-agnostic profile is built from the tracked file list and `package.json`: languages, frameworks, package manager, test tools, translation folders, lint setup. It costs a few hundred tokens and anchors the model's expectations (a Jest repository should not get Vitest advice).

## The "no precedent" rule

When a new file has **no precedent** in the repository (no other file of that kind), the planner says so explicitly in the prompt. The reviewer is then asked for widely accepted practice, labelled `FRAMEWORK` or `HEURISTIC`, and is forbidden to fabricate a `REPO_CONVENTION`. This is the difference between "your repository does X" (which must be provable) and "the Angular style guide recommends X" (which is a general claim).

## Audit the plan with `inspect`

```bash
air-review inspect --base origin/main
```

`inspect` prints, without any model call:

- the changed files and their kinds;
- for each exemplar, the reason it was picked ("same directory, same kind", "sibling language file") and its size;
- the related modules and their exported symbols;
- the repository profile;
- the estimated token cost of the evidence bundle against the two budgets.

If the plan looks wrong (an irrelevant exemplar, a budget hit), adjust `context.maxEvidenceTokens` or `context.maxContextRequests` in the config and run `inspect` again. Nothing has been paid for yet.

After a review, `.air-review/context.md` records what was actually sent, so a surprising finding can be traced back to the evidence that produced it.

## What is not built

- **Semantic or vector search** (`context.semanticFallback`) is not implemented; selection is structural.
- **Agentic exploration**: the planner's model slot (`models.roles.planner`) is reserved for a bounded step where a model could request a few read-only lookups (list a directory, read a file, grep) with a hard cap, triggered only when the structural plan reports uncertainty. It is not called today.
- **Framework packs** beyond Angular. The exemplar planner and the profile already work for any language; the deterministic rules and structural facts are Angular-specific for now.

See also [How it works](/concepts/how-it-works) and the `context` section of [Configuration](/reference/configuration#context).
