import type { RoutingDecision } from "../contracts/routing.js";
import type { RunTraceSummary } from "../contracts/trace.js";
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
export declare function renderWorkflowDiagram(trace: RunTraceSummary, routing?: RoutingDecision): string;
