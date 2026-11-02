import type { EvidenceItem } from "../contracts/review.js";
import type { FileFacts } from "./typescript-facts.js";
import type { ExemplarRecord, RelatedModuleRecord } from "./exemplars.js";
import type { RepoProfile } from "./profile.js";

export interface ConventionRecord {
  id: string;
  label: string;
  scope: string;
  matchingExamples: number;
  counterExamples: number;
  examples: string[];
  confidence: number;
  debtRisk: "low" | "medium" | "high";
}

export interface EvidenceBundle {
  files: FileFacts[];
  conventions: ConventionRecord[];
  projectFacts: ProjectFacts;
  warnings: string[];
  /** Repository identity card (languages, frameworks, i18n folders...). */
  profile?: RepoProfile;
  /** Existing files of the same kind as each changed file: "how this repo does it". */
  exemplars?: ExemplarRecord[];
  /** Exported API of in-repo modules the change imports. */
  related?: RelatedModuleRecord[];
  /** Planner decisions the model must know (e.g. "no precedent for this kind"). */
  planNotes?: string[];
}

export interface ProjectFacts {
  angularVersion?: string;
  strict: boolean;
  standaloneDefault: boolean;
}

export function evidenceItemsForFinding(
  bundle: EvidenceBundle,
  filePath: string,
  extra: EvidenceItem[] = [],
): EvidenceItem[] {
  const file = bundle.files.find((f) => f.path === filePath);
  const items: EvidenceItem[] = [];
  if (file) {
    const component = file.symbols.find((s) => s.kind === "component");
    if (component) {
      items.push({
        kind: "reference",
        label: `Component ${component.name}${component.selector ? ` (<${component.selector}>)` : ""}`,
        detail: `injects: ${component.injected.join(", ") || "none"}; inputs: ${component.inputs.join(", ") || "none"}`,
      });
    }
  }
  for (const convention of bundle.conventions) {
    if (convention.examples.some((e) => e.startsWith(dirOf(filePath)))) {
      items.push({
        kind: "convention",
        label: convention.label,
        detail: `${convention.matchingExamples} matching examples, ${convention.counterExamples} counter-examples`,
      });
    }
  }
  if (bundle.projectFacts.angularVersion) {
    items.push({
      kind: "framework",
      label: `Angular ${bundle.projectFacts.angularVersion}`,
    });
  }
  return [...items, ...extra];
}

function dirOf(path: string): string {
  const parts = path.split("/");
  parts.pop();
  return parts.join("/");
}
