/**
 * Normalization helpers for model output.
 *
 * Small local models routinely get enum spellings slightly wrong (case,
 * "reference|convention" copies, numbers as strings). A single bad field must
 * never invalidate a whole review response, so these helpers coerce obvious
 * variants and fall back to safe defaults.
 */
export const SEVERITIES = ["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "NITPICK", "INFO"];
export const EVIDENCE_KINDS = [
    "code-example",
    "convention",
    "config",
    "history",
    "framework",
    "reference",
];
export function normalizeEnum(value, allowed) {
    if (typeof value !== "string")
        return undefined;
    const direct = value.trim().toUpperCase();
    const match = allowed.find((candidate) => candidate.toUpperCase() === direct);
    if (match)
        return match;
    // Models sometimes emit the enum list itself ("a|b|c") or comma variants.
    const tokens = value
        .split(/[|,/\s]+/)
        .map((token) => token.trim().toUpperCase())
        .filter(Boolean);
    for (const token of tokens) {
        const found = allowed.find((candidate) => candidate.toUpperCase() === token);
        if (found)
            return found;
    }
    return undefined;
}
export function normalizeEvidenceKind(value) {
    return normalizeEnum(value, EVIDENCE_KINDS) ?? "reference";
}
export function normalizeSeverityOrNull(value) {
    return normalizeEnum(value, SEVERITIES) ?? null;
}
export function normalizeNumber(value) {
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isFinite(parsed))
            return parsed;
    }
    return undefined;
}
//# sourceMappingURL=normalize.js.map