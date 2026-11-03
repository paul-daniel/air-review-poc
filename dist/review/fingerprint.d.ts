import type { Finding } from "../contracts/review.js";
export declare function findingId(input: {
    ruleId: string;
    file: string;
    symbol?: string;
    /** Disambiguates several findings of the same rule/symbol in one file. */
    discriminator?: string;
}): string;
export declare function findingFingerprint(finding: Pick<Finding, "ruleId" | "anchor" | "severity" | "scope">, configHash: string): string;
