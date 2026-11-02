import type { CandidateFinding, DeterministicRule, RuleContext } from "./rules.js";
import { mineContainerPresenterConventions, conventionRecords, featureOf } from "./angular-conventions.js";
import { evidenceItemsForFinding } from "../context/evidence.js";
import type { FileFacts } from "../context/typescript-facts.js";

const CLEANUP_OPERATOR = "takeUntilDestroyed";

async function subscriptionCleanupFindings(ctx: RuleContext): Promise<CandidateFinding[]> {
  const findings: CandidateFinding[] = [];
  const angularMajor = majorVersion(ctx.projectFacts.angularVersion);
  if (angularMajor !== null && angularMajor < 16) return findings;

  const repoUsers = await ctx.grep(CLEANUP_OPERATOR);
  const repoHasConvention = repoUsers.length > 0;

  for (const file of ctx.delta.files) {
    if (file.status !== "added" && file.status !== "modified") continue;
    const facts = ctx.facts.get(file.path);
    if (!facts) continue;

    let indexInOwner = 0;
    for (const sub of facts.subscriptions) {
      if (sub.cleanup !== "none") continue;
      if (!file.addedLines.includes(sub.line)) continue;

      const owner = facts.symbols.find((s) => s.name === sub.owner);
      indexInOwner += 1;
      const line = ctx.readHead(file.path).split("\n")[sub.line - 1] ?? "";
      const subscription = line.match(/^\s*(this\.[\w$]+(?:\.[\w$]+)*)\.subscribe\((.*)\);?\s*$/);
      const suggestedCode =
        subscription && !subscription[2]!.includes(";")
          ? {
              language: "typescript",
              code: `${subscription[1]}\n  .pipe(${CLEANUP_OPERATOR}(this.destroyRef))\n  .subscribe(${subscription[2]});`,
              replacesAnchor: false,
            }
          : undefined;
      findings.push({
        ruleId: "angular.subscription-lifecycle",
        ruleOrigin: "FRAMEWORK",
        severity: "MAJOR",
        confidence: repoHasConvention ? 0.94 : 0.82,
        scope: "IN_PR",
        category: "correctness",
        repoStatus: repoHasConvention ? "CONVENTION" : "NONE",
        title: "Subscription may outlive its component",
        summary:
          `This subscription has no teardown path, so it can keep receiving events after ${sub.owner ?? "the component"} is destroyed. ` +
          (repoHasConvention
            ? `This repo uses \`${CLEANUP_OPERATOR}()\` in ${repoUsers.length} ${repoUsers.length === 1 ? "file" : "files"}.`
            : `Add cleanup to this subscription; a repository-wide refactor is not needed.`),
        suggestion: `${repoHasConvention ? "Use the same cleanup operator here." : "Tie this subscription to the component lifecycle."} Import \`DestroyRef\` and \`inject\` from \`@angular/core\`, and \`${CLEANUP_OPERATOR}\` from \`@angular/core/rxjs-interop\`. Add \`private readonly destroyRef = inject(DestroyRef);\` to the component.${suggestedCode ? "" : ` Pipe the stream through \`${CLEANUP_OPERATOR}(this.destroyRef)\` before subscribing.`}`,
        suggestedCode,
        anchor: {
          file: file.path,
          startLine: sub.line,
          endLine: sub.line,
          symbol: sub.owner ? `${sub.owner}#sub${indexInOwner}` : undefined,
        },
        evidence: evidenceItemsForFinding(ctx.evidence, file.path, [
          repoHasConvention
            ? {
                kind: "convention",
                label: `${repoUsers.length} local usages of ${CLEANUP_OPERATOR}()`,
              }
            : {
                kind: "framework",
                label: `${CLEANUP_OPERATOR} is the Angular lifecycle-safe teardown operator`,
              },
          ...(owner ? [{ kind: "reference" as const, label: `Owner: ${owner.kind} ${owner.name}` }] : []),
        ]),
      });
    }
  }
  return findings;
}

async function containerPresenterFindings(ctx: RuleContext): Promise<CandidateFinding[]> {
  const mining = mineContainerPresenterConventions(ctx.trackedFiles);
  const conventions = conventionRecords(mining);
  if (conventions.length === 0) return [];

  const findings: CandidateFinding[] = [];
  for (const file of ctx.delta.files) {
    if (file.status !== "added" && file.status !== "modified") continue;
    if (/\.(container|presenter)\.ts$/.test(file.path)) continue;
    const facts = ctx.facts.get(file.path);
    if (!facts) continue;

    const components = facts.symbols.filter((s) => s.kind === "component");
    for (const component of components) {
      if (component.injected.length === 0) continue;
      const convention = conventions.find((c) => featureOf(c, file.path));
      if (!convention || convention.matchingExamples < 2) continue;
      // The component being judged is not a counter-example *against* the
      // convention; count the rest of the feature as the existing evidence.
      const counter = Math.max(0, convention.counterExamples - 1);
      const confidence = Number(
        (convention.matchingExamples / (convention.matchingExamples + counter)).toFixed(2),
      );
      if (confidence < 0.6) continue;

      findings.push({
        ruleId: "angular.container-presenter",
        ruleOrigin: "REPO_CONVENTION",
        severity: confidence >= 0.8 ? "MAJOR" : "MINOR",
        confidence,
        scope: "IN_PR",
        category: "consistency",
        repoStatus: "CONVENTION",
        title: "Component bypasses the feature's container/presenter separation",
        summary:
          `${component.name} injects ${component.injected.join(", ")} and owns presentation concerns. ` +
          `In ${convention.scope || "this feature"}, sibling components are split into a container ` +
          `(state and services) and a presenter (rendering and events). This is a repository convention, ` +
          `not a universal Angular rule.`,
        suggestion: `Move orchestration into \`${component.name}.container\` and keep \`${component.name}\` (or a presenter) focused on presentation.`,
        anchor: {
          file: file.path,
          startLine: component.line,
          endLine: component.line,
          symbol: component.name,
        },
        evidence: evidenceItemsForFinding(ctx.evidence, file.path, [
          {
            kind: "convention",
            label: `${convention.matchingExamples} container/presenter pairs, ${counter} counter-examples`,
            detail: convention.examples.slice(0, 5).join(", "),
          },
        ]),
      });
    }
  }
  return findings;
}

export const angularRules: DeterministicRule[] = [
  {
    id: "angular.subscription-lifecycle",
    origin: "FRAMEWORK",
    severity: "MAJOR",
    run: subscriptionCleanupFindings,
  },
  {
    id: "angular.container-presenter",
    origin: "REPO_CONVENTION",
    severity: "MAJOR",
    run: containerPresenterFindings,
  },
];

function majorVersion(version: string | undefined): number | null {
  if (!version) return null;
  const match = version.match(/^[~^]?(\d+)/);
  return match ? Number(match[1]) : null;
}

export function angularComponentFiles(facts: Map<string, FileFacts>): FileFacts[] {
  return [...facts.values()].filter((f) => f.symbols.some((s) => s.kind === "component"));
}
