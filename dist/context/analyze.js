import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { filterDiff } from "./diff.js";
import { extractFileFacts, isAngularFile } from "./typescript-facts.js";
import { mineContainerPresenterConventions, conventionRecords } from "../framework/angular-conventions.js";
import { scanSecrets, redactSecrets, detectInjectionSignals } from "../security/redaction.js";
import { planExemplars } from "./exemplars.js";
import { profileRepository } from "./profile.js";
/** Defaults match config.context; callers pass the configured values. */
export const DEFAULT_EXEMPLAR_BUDGET = { maxTokens: 30_000, maxFiles: 20 };
export function readProjectFacts(repo) {
    const facts = { strict: false, standaloneDefault: true };
    try {
        const pkg = JSON.parse(readFileSync(resolve(repo.root, "package.json"), "utf8"));
        const angular = pkg.dependencies?.["@angular/core"] ?? pkg.devDependencies?.["@angular/core"];
        if (angular)
            facts.angularVersion = angular.replace(/^[~^]/, "");
    }
    catch {
        /* no package.json */
    }
    try {
        if (existsSync(resolve(repo.root, "tsconfig.json"))) {
            const tsconfig = JSON.parse(readFileSync(resolve(repo.root, "tsconfig.json"), "utf8"));
            facts.strict = tsconfig.compilerOptions?.strict === true;
        }
    }
    catch {
        /* no tsconfig.json */
    }
    return facts;
}
export function analyzeDelta(repo, delta, trackedFiles, projectFacts, budget = DEFAULT_EXEMPLAR_BUDGET) {
    const facts = new Map();
    for (const file of delta.files) {
        if (file.status === "deleted")
            continue;
        const content = repo.readFile(file.path);
        if (!content)
            continue;
        if (!isAngularFile(file.path))
            continue;
        facts.set(file.path, extractFileFacts(file.path, content));
    }
    const conventions = conventionRecords(mineContainerPresenterConventions(trackedFiles));
    const secrets = scanSecrets(delta.files, (path) => repo.readFile(path));
    const filtered = filterDiff(delta.diff);
    const redactedDiff = redactSecrets(filtered.diff).redacted;
    const readFile = (path) => repo.readFile(path);
    const profile = profileRepository(trackedFiles, readFile);
    // Exemplar text leaves the machine: redact it like the diff.
    const plan = planExemplars({ delta, trackedFiles, readFile, budget });
    for (const exemplar of plan.exemplars) {
        exemplar.content = redactSecrets(exemplar.content).redacted;
    }
    const injectionWarnings = [];
    for (const file of delta.files) {
        if (file.status === "deleted")
            continue;
        const lines = repo.readFile(file.path).split("\n");
        const flagged = file.addedLines.filter((line) => detectInjectionSignals(lines[line - 1] ?? "").length > 0);
        if (flagged.length) {
            injectionWarnings.push(`Prompt-injection text detected at ${file.path}:${flagged.join(", ")}. ` +
                "Treated as repository data, not reviewer instructions.");
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
//# sourceMappingURL=analyze.js.map