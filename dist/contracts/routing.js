/**
 * Complexity routing: which reviewer agent a change deserves.
 *
 * A translation file or a small classification helper does not need the
 * strongest (and most expensive) model; a pull request that cuts across
 * modules does. The triage step measures the change deterministically, asks a
 * cheap triage model only when the measurement is ambiguous, and records a
 * decision that is printed in every report so the choice is auditable.
 */
export const COMPLEXITY_TIERS = ["light", "standard", "heavy"];
//# sourceMappingURL=routing.js.map