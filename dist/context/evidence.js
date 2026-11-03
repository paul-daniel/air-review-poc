export function evidenceItemsForFinding(bundle, filePath, extra = []) {
    const file = bundle.files.find((f) => f.path === filePath);
    const items = [];
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
function dirOf(path) {
    const parts = path.split("/");
    parts.pop();
    return parts.join("/");
}
//# sourceMappingURL=evidence.js.map