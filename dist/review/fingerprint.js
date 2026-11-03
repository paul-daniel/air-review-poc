import { createHash } from "node:crypto";
import { FINDING_ID_PREFIX } from "../version.js";
function sha(parts, length) {
    return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, length);
}
export function findingId(input) {
    return `${FINDING_ID_PREFIX}${sha([input.ruleId, input.file, input.symbol ?? "", input.discriminator ?? ""], 6)}`;
}
export function findingFingerprint(finding, configHash) {
    return `sha256:${sha([
        finding.ruleId,
        finding.anchor.file,
        finding.anchor.symbol ?? "",
        String(finding.anchor.startLine),
        finding.severity,
        finding.scope,
        configHash,
    ], 16)}`;
}
//# sourceMappingURL=fingerprint.js.map