import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { RepositoryDelta } from "../contracts/scm.js";
import type { GitRepository } from "./repository.js";
import { filterDiff } from "./diff.js";
import { extractFileFacts, isAngularFile, type FileFacts } from "./typescript-facts.js";
import { mineContainerPresenterConventions, conventionRecords } from "../framework/angular-conventions.js";
import type { EvidenceBundle, ProjectFacts } from "./evidence.js";
import { scanSecrets, redactSecrets, detectInjectionSignals } from "../security/redaction.js";
import { planExemplars, type ExemplarBudget, type ExemplarPlan } from "./exemplars.js";
import { profileRepository } from "./profile.js";

export interface DeltaAnalysis {
  facts: Map<string, FileFacts>;
  evidence: EvidenceBundle;
  secrets: ReturnType<typeof scanSecrets>;
  redactedDiff: string;
  injectionWarnings: string[];
  /** What the planner selected and why; `inspect` shows it, the prompt uses it. */
  plan: ExemplarPlan;
}

/** Defaults match config.context; callers pass the configured values. */
export const DEFAULT_EXEMPLAR_BUDGET: ExemplarBudget = { maxTokens: 30_000, maxFiles: 20 };

export function readProjectFacts(repo: GitRepository): ProjectFacts {
  const facts: ProjectFacts = { strict: false, standaloneDefault: true };
  try {
    const pkg = JSON.parse(readFileSync(resolve(repo.root, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const angular = pkg.dependencies?.["@angular/core"] ?? pkg.devDependencies?.["@angular/core"];
    if (angular) facts.angularVersion = angular.replace(/^[~^]/, "");
  } catch {
    /* no package.json */
  }
  try {
    if (existsSync(resolve(repo.root, "tsconfig.json"))) {
      const tsconfig = JSON.parse(readFileSync(resolve(repo.root, "tsconfig.json"), "utf8")) as {
        compilerOptions?: { strict?: boolean };
      };
      facts.strict = tsconfig.compilerOptions?.strict === true;
    }
  } catch {
    /* no tsconfig.json */
  }
  return facts;
}

export function analyzeDelta(
  repo: GitRepository,
  delta: RepositoryDelta,
  trackedFiles: string[],
  projectFacts: ProjectFacts,
  budget: ExemplarBudget = DEFAULT_EXEMPLAR_BUDGET,
): DeltaAnalysis {
  const facts = new Map<string, FileFacts>();
  for (const file of delta.files) {
    if (file.status === "deleted") continue;
    const content = repo.readFile(file.path);
    if (!content) continue;
    if (!isAngularFile(file.path)) continue;
    facts.set(file.path, extractFileFacts(file.path, content));
  }

  const conventions = conventionRecords(mineContainerPresenterConventions(trackedFiles));
  const secrets = scanSecrets(delta.files, (path) => repo.readFile(path));
  const filtered = filterDiff(delta.diff);
  const redactedDiff = redactSecrets(filtered.diff).redacted;
  const readFile = (path: string) => repo.readFile(path);
  const profile = profileRepository(trackedFiles, readFile);
  // Exemplar text leaves the machine: redact it like the diff.
  const plan = planExemplars({ delta, trackedFiles, readFile, budget });
  for (const exemplar of plan.exemplars) {
    exemplar.content = redactSecrets(exemplar.content).redacted;
  }
  const injectionWarnings: string[] = [];
  for (const file of delta.files) {
    if (file.status === "deleted") continue;
    const lines = repo.readFile(file.path).split("\n");
    const flagged = file.addedLines.filter(
      (line) => detectInjectionSignals(lines[line - 1] ?? "").length > 0,
    );
    if (flagged.length) {
      injectionWarnings.push(
        `Prompt-injection text detected at ${file.path}:${flagged.join(", ")}. ` +
          "Treated as repository data, not reviewer instructions.",
      );
    }
  }

  return {
    facts,
    evidence: {
      files: [...facts.values()],
      conventions,
      projectFacts,
      warnings: injectionWarnings,
      profile,
      exemplars: plan.exemplars,
      related: plan.related,
      planNotes: plan.notes,
    },
    secrets,
    redactedDiff,
    injectionWarnings,
    plan,
  };
}
