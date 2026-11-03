import type { FileChange } from "../contracts/scm.js";
export interface DetectedSecret {
    kind: string;
    file: string;
    line: number;
}
interface SecretPattern {
    kind: string;
    pattern: RegExp;
}
/**
 * Conservative, well-known secret patterns. Broad enough to catch real leaks,
 * narrow enough to avoid flagging identifiers or sample code.
 */
export declare const SECRET_PATTERNS: SecretPattern[];
export declare function scanSecrets(deltaFiles: FileChange[], readHead: (path: string) => string): DetectedSecret[];
/** Redact secret material from any text before it leaves the machine. */
export declare function redactSecrets(text: string): {
    redacted: string;
    count: number;
};
export interface InjectionWarning {
    pattern: number;
    text: string;
}
/** Detect content that looks like an attempt to hijack the reviewer. */
export declare function detectInjectionSignals(text: string): InjectionWarning[];
export {};
