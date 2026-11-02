import { createHash } from "node:crypto";
import { FINDING_ID_PREFIX } from "../version.js";
import type { Finding } from "../contracts/review.js";

function sha(parts: string[], length: number): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, length);
}

export function findingId(input: {
  ruleId: string;
  file: string;
  symbol?: string;
  /** Disambiguates several findings of the same rule/symbol in one file. */
  discriminator?: string;
}): string {
  return `${FINDING_ID_PREFIX}${sha(
    [input.ruleId, input.file, input.symbol ?? "", input.discriminator ?? ""],
    6,
  )}`;
}

export function findingFingerprint(
  finding: Pick<Finding, "ruleId" | "anchor" | "severity" | "scope">,
  configHash: string,
): string {
  return `sha256:${sha(
    [
      finding.ruleId,
      finding.anchor.file,
      finding.anchor.symbol ?? "",
      String(finding.anchor.startLine),
      finding.severity,
      finding.scope,
      configHash,
    ],
    16,
  )}`;
}
