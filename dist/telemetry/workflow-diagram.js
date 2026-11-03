import { formatCost } from "./run-log.js";
/**
 * Mermaid flowchart of the path a run really took. Built from the trace, not
 * from a static template: cached and skipped steps are drawn greyed/dashed,
 * the reviewer node names the tier and the model that was chosen, and the
 * two tiers that were *not* chosen appear as skipped alternatives so a reader
 * can see where the routing could be tuned.
 *
 * GitHub renders ```mermaid blocks; Azure DevOps shows the source, which is
 * still readable and can be pasted into https://mermaid.live.
 */
export function renderWorkflowDiagram(trace, routing) {
    const lines = ["flowchart TD"];
    const ids = new Map();
    trace.steps.forEach((step, index) => ids.set(step, `s${index}`));
    for (const step of trace.steps) {
        const id = ids.get(step);
        lines.push(`  ${id}${nodeShape(step, nodeLabel(step))}`);
    }
    // Routing alternatives: the tiers not taken, drawn as skipped branches off the triage node.
    const triage = trace.steps.find((s) => s.id === "triage");
    const reviewer = trace.steps.find((s) => s.id === "review.model");
    if (routing && triage && reviewer) {
        const triageId = ids.get(triage);
        const alternatives = ["light", "standard", "heavy"].filter((tier) => tier !== routing.tier);
        alternatives.forEach((tier, index) => {
            const altId = `alt${index}`;
            lines.push(`  ${altId}["reviewer (${tier})<br/>not selected"]`);
            lines.push(`  ${triageId} -.-> ${altId}`);
            lines.push(`  class ${altId} skipped;`);
        });
    }
    // Sequential edges in execution order; a decision edge is labelled with the tier.
    for (let index = 0; index + 1 < trace.steps.length; index += 1) {
        const from = trace.steps[index];
        const to = trace.steps[index + 1];
        const label = from.id === "triage" && to.id === "review.model" && routing ? `|${routing.tier}|` : "";
        const arrow = to.status === "skipped" ? "-.->" : "-->";
        lines.push(`  ${ids.get(from)} ${arrow}${label} ${ids.get(to)}`);
    }
    for (const step of trace.steps) {
        if (step.status !== "done")
            lines.push(`  class ${ids.get(step)} ${step.status};`);
    }
    lines.push("  classDef skipped fill:#f3f4f6,stroke:#9ca3af,color:#6b7280,stroke-dasharray: 4 3;", "  classDef cached fill:#ecfeff,stroke:#06b6d4,color:#155e75;", "  classDef failed fill:#fef2f2,stroke:#ef4444,color:#991b1b;");
    return lines.join("\n");
}
function nodeShape(step, label) {
    if (step.id === "triage")
        return `{{"${label}"}}`;
    if (step.id === "gate" || step.id === "verdict")
        return `{"${label}"}`;
    return `["${label}"]`;
}
function nodeLabel(step) {
    const parts = [escape(step.label)];
    if (step.model)
        parts.push(escape(step.model));
    const facts = [];
    if (step.status === "done" || step.status === "failed") {
        facts.push(`${(step.durationMs / 1000).toFixed(1)}s`);
    }
    if (step.inputTokens !== undefined || step.outputTokens !== undefined) {
        facts.push(`${step.inputTokens ?? 0}→${step.outputTokens ?? 0} tok`);
    }
    if (step.estimatedCostUsd !== undefined)
        facts.push(formatCost(step.estimatedCostUsd));
    if (step.status === "cached")
        facts.push("cache hit");
    if (step.status === "skipped")
        facts.push("skipped");
    if (step.status === "failed")
        facts.push("failed");
    if (facts.length)
        parts.push(facts.join(" · "));
    return parts.join("<br/>");
}
function escape(text) {
    return text
        .replace(/"/g, "'")
        .replace(/[<>]/g, (c) => (c === "<" ? "&lt;" : "&gt;"))
        .replace(/\|/g, "/");
}
//# sourceMappingURL=workflow-diagram.js.map