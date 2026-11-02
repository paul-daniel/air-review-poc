import type { DeterministicRule, RuleContext, CandidateFinding } from "../framework/rules.js";
import { scanSecrets } from "../security/redaction.js";

/**
 * Deterministic security rule: real, well-known secret patterns are caught by
 * software - never left to a model's judgement.
 */
export const secretRule: DeterministicRule = {
  id: "security.secret-in-code",
  origin: "PROJECT_CONFIG",
  severity: "BLOCKER",
  async run(ctx: RuleContext): Promise<CandidateFinding[]> {
    const secrets = scanSecrets(ctx.delta.files, ctx.readHead);
    return secrets.map((secret) => ({
      ruleId: "security.secret-in-code",
      ruleOrigin: "PROJECT_CONFIG",
      severity: "BLOCKER",
      confidence: 0.98,
      scope: "IN_PR",
      title: `Possible ${secret.kind} committed in source`,
      summary:
        `A value matching the "${secret.kind}" secret pattern was added on line ${secret.line}. ` +
        `Secrets committed to version control must be considered compromised and rotated, ` +
        `not merely deleted.`,
      suggestion:
        `Remove the secret, rotate/revoke it immediately, and load it from a secret store ` +
        `(environment variable, GitHub Actions secret, vault) instead.`,
      anchor: {
        file: secret.file,
        startLine: secret.line,
        endLine: secret.line,
        symbol: `secret:${secret.kind}`,
      },
      evidence: [
        {
          kind: "config",
          label: `Secret pattern: ${secret.kind}`,
          detail: "Values were redacted before being sent to any model.",
        },
      ],
    }));
  },
};
