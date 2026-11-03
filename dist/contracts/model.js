/**
 * Capability-based model provider contract.
 *
 * The engine never references a concrete provider (OpenAI, Foundry, ...).
 * It asks a provider what it can do and routes requests by *role*, not by
 * hard-coded model name.
 */
/**
 * Logical agent roles. Each role is one model call with one job:
 *   - triage:   decides how complex the change is and which reviewer to use (cheap)
 *   - planner:  reserved for a bounded context-exploration step (cheap)
 *   - reviewer: reasons about the change with the evidence bundle (light or heavy)
 *   - verifier: checks each finding against the quoted code (cheap to medium)
 */
export const MODEL_ROLES = ["triage", "planner", "reviewer", "verifier"];
//# sourceMappingURL=model.js.map