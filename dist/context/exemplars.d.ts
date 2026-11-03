import type { FileChange, RepositoryDelta } from "../contracts/scm.js";
/**
 * Exemplar selection: the "how does this repository do it?" step.
 *
 * For every changed file the planner looks for existing files of the same
 * *kind* (`*.component.ts`, `*.service.ts`, `fr.json` in an i18n folder, ...)
 * and picks the closest few as reference material for the reviewer. The
 * budget adapts to the change: a brand-new file gets up to three exemplars, a
 * heavily rewritten one two, a small edit one, and a kind that has no
 * precedent gets none plus an explicit note so the model recommends general
 * good practice instead of inventing a "repository convention".
 *
 * Everything here is deterministic and costs no model tokens until the
 * reviewer prompt is built; the token budget keeps the prompt bounded.
 */
export type ExemplarRelation = "same-directory" | "sibling-directory" | "same-feature" | "repository";
export interface ExemplarRecord {
    /** Changed file this exemplar is evidence for. */
    forFile: string;
    /** Repository-relative path of the exemplar. */
    path: string;
    relation: ExemplarRelation;
    /** Short human-readable reason, shown by `inspect` and in the prompt. */
    reason: string;
    /** Excerpt (whole file when small). */
    content: string;
    lines: number;
    truncated: boolean;
}
export interface RelatedModuleRecord {
    /** Changed file that imports the module. */
    forFile: string;
    path: string;
    /** Exported declarations (one line each), so the reviewer can check an API exists. */
    exports: string[];
}
export interface ExemplarPlan {
    exemplars: ExemplarRecord[];
    related: RelatedModuleRecord[];
    /** Planner decisions worth telling the model and the user ("no precedent for X"). */
    notes: string[];
    /** Rough token estimate of everything selected (chars / 4). */
    estimatedTokens: number;
    /** Files read while planning; reported as metrics.contextRequests. */
    filesRead: number;
}
export interface ExemplarBudget {
    /** Hard cap on tokens of exemplar + related-module text. */
    maxTokens: number;
    /** Hard cap on files read for evidence. */
    maxFiles: number;
}
/**
 * The "kind" of a file is what makes two files comparable: `*.component.ts`
 * files are compared to other `*.component.ts` files, `fr.json` to other json
 * files. Dotted basenames keep everything after the first dot
 * (`order.container.ts` -> `container.ts`); plain names keep the extension.
 */
export declare function fileKind(path: string): string;
export declare function isDataKind(kind: string): boolean;
/**
 * How many exemplars a changed file deserves. Adding a file is where
 * consistency matters most; a one-line edit needs only a reminder.
 */
export declare function exemplarsWanted(file: FileChange, headLineCount: number): number;
export interface PlanExemplarsInput {
    delta: RepositoryDelta;
    trackedFiles: string[];
    /** Read the head (working tree) content of a tracked file; "" when unreadable. */
    readFile: (path: string) => string;
    budget: ExemplarBudget;
}
/** Select exemplars and related modules for the whole delta within budget. */
export declare function planExemplars(input: PlanExemplarsInput): ExemplarPlan;
