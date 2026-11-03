/**
 * Normalization helpers for model output.
 *
 * Small local models routinely get enum spellings slightly wrong (case,
 * "reference|convention" copies, numbers as strings). A single bad field must
 * never invalidate a whole review response, so these helpers coerce obvious
 * variants and fall back to safe defaults.
 */
export declare const SEVERITIES: readonly ["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "NITPICK", "INFO"];
export declare const EVIDENCE_KINDS: readonly ["code-example", "convention", "config", "history", "framework", "reference"];
export declare function normalizeEnum<T extends readonly string[]>(value: unknown, allowed: T): T[number] | undefined;
export declare function normalizeEvidenceKind(value: unknown): (typeof EVIDENCE_KINDS)[number];
export declare function normalizeSeverityOrNull(value: unknown): (typeof SEVERITIES)[number] | null;
export declare function normalizeNumber(value: unknown): number | undefined;
