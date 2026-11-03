/**
 * Conservative, well-known secret patterns. Broad enough to catch real leaks,
 * narrow enough to avoid flagging identifiers or sample code.
 */
export const SECRET_PATTERNS = [
    { kind: "aws-access-key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
    { kind: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
    { kind: "github-fine-grained-token", pattern: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g },
    { kind: "google-api-key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
    { kind: "openai-api-key", pattern: /\bsk-[A-Za-z0-9_-]{32,}\b/g },
    { kind: "slack-token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
    { kind: "private-key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g },
    { kind: "hardcoded-password", pattern: /(password|passwd|pwd|secret)\s*[:=]\s*["'][^"'\s]{6,}["']/gi },
];
export function scanSecrets(deltaFiles, readHead) {
    const detected = [];
    for (const file of deltaFiles) {
        if (file.status === "deleted")
            continue;
        const lines = readHead(file.path).split("\n");
        for (const pattern of SECRET_PATTERNS) {
            pattern.pattern.lastIndex = 0;
            for (const [index, line] of lines.entries()) {
                if (file.status === "modified" && !file.addedLines.includes(index + 1))
                    continue;
                pattern.pattern.lastIndex = 0;
                if (pattern.pattern.test(line)) {
                    detected.push({ kind: pattern.kind, file: file.path, line: index + 1 });
                }
            }
        }
    }
    return detected;
}
/** Redact secret material from any text before it leaves the machine. */
export function redactSecrets(text) {
    let count = 0;
    let output = text;
    for (const { kind, pattern } of SECRET_PATTERNS) {
        pattern.lastIndex = 0;
        output = output.replace(pattern, (match) => {
            count += 1;
            return `[REDACTED:${kind}:${match.length}]`;
        });
    }
    return { redacted: output, count };
}
const INJECTION_PATTERNS = [
    /\b(ignore|disregard|forget)\s+(all\s+)?(previous|prior|above|earlier)\s+instructions\b/i,
    /\byou\s+are\s+(now|no\s+longer)\s+[a-z\s]+(ai|assistant|reviewer)\b/i,
    /\bdo\s+not\s+(report|flag|review|comment)\b/i,
    /\bsystem\s+prompt\s*:/i,
    /\boverride\s+(the\s+)?(system|policy)\b/i,
];
/** Detect content that looks like an attempt to hijack the reviewer. */
export function detectInjectionSignals(text) {
    const warnings = [];
    for (const [index, pattern] of INJECTION_PATTERNS.entries()) {
        const match = text.match(pattern);
        if (match) {
            warnings.push({
                pattern: index,
                text: text.slice(Math.max(0, (match.index ?? 0) - 40), (match.index ?? 0) + 120),
            });
        }
    }
    return warnings;
}
//# sourceMappingURL=redaction.js.map