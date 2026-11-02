import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ModelProvider, Usage } from "../contracts/model.js";
import type { CandidateFinding } from "../framework/rules.js";
import { buildReviewerPrompt, type ReviewerPromptInput } from "./prompts.js";
import {
  EVIDENCE_KINDS,
  normalizeEvidenceKind,
  normalizeEnum,
  normalizeNumber,
  normalizeSeverityOrNull,
} from "../model/normalize.js";

const severityZ = z.preprocess(
  (value) => normalizeSeverityOrNull(value),
  z.enum(["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "INFO"]),
);
const scopeZ = z.preprocess(
  (value) => normalizeEnum(value, ["IN_PR", "FOLLOW_UP", "REPO_WIDE"] as const) ?? "IN_PR",
  z.enum(["IN_PR", "FOLLOW_UP", "REPO_WIDE"]),
);
const originZ = z.preprocess(
  (value) =>
    normalizeEnum(value, ["PROJECT_CONFIG", "FRAMEWORK", "REPO_CONVENTION", "HEURISTIC"] as const) ??
    "HEURISTIC",
  z.enum(["PROJECT_CONFIG", "FRAMEWORK", "REPO_CONVENTION", "HEURISTIC"]),
);
const numberZ = z.preprocess((value) => normalizeNumber(value), z.number().int().positive());
const categoryZ = z.preprocess(
  (value) =>
    normalizeEnum(value, [
      "correctness",
      "security",
      "performance",
      "maintainability",
      "consistency",
      "tests",
      "docs",
    ] as const) ?? "correctness",
  z.enum(["correctness", "security", "performance", "maintainability", "consistency", "tests", "docs"]),
);

const findingZ = z.object({
  severity: severityZ,
  confidence: z.preprocess((value) => normalizeNumber(value), z.number().min(0).max(1)),
  scope: scopeZ,
  category: categoryZ.optional().default("correctness"),
  ruleOrigin: originZ,
  ruleId: z.string().min(1).max(80),
  title: z.string().min(3).max(300),
  summary: z.string().min(10).max(2000),
  suggestion: z.string().max(2000).nullable().optional(),
  suggestedCode: z
    .object({
      language: z.string().regex(/^[a-zA-Z0-9+#.-]{1,40}$/),
      code: z.string().min(1).max(4000),
      replacesAnchor: z.boolean().optional(),
    })
    .nullable()
    .optional(),
  file: z.string().min(1),
  startLine: numberZ,
  endLine: numberZ,
  symbol: z.string().max(200).nullable().optional(),
  evidence: z
    .array(
      z.object({
        kind: z.preprocess(normalizeEvidenceKind, z.enum(EVIDENCE_KINDS)),
        label: z.string().min(1).max(300),
        detail: z.string().max(1000).optional(),
      }),
    )
    .default([]),
});

const responseZ = z.object({ findings: z.array(z.unknown()).default([]) });

/** JSON schema handed to providers that support constrained decoding. */
const responseJsonSchema = zodToJsonSchema(z.object({ findings: z.array(findingZ) }), {
  $refStrategy: "none",
});

export interface LlmReviewResult {
  findings: CandidateFinding[];
  usage: Usage;
  warnings: string[];
}

/**
 * The strong review pass: one model call with the evidence bundle. Structured
 * output is parsed and individually validated so a single bad entry does not
 * kill the whole run.
 */
export async function runReviewer(
  provider: ModelProvider,
  model: string,
  input: ReviewerPromptInput,
): Promise<LlmReviewResult> {
  const prompt = buildReviewerPrompt(input);
  const result = await provider.structured({
    model,
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
    temperature: 0.2,
    maxOutputTokens: input.maxOutputTokens ?? 16_384,
    shapeHint: "review findings",
    schema: responseJsonSchema,
    parse: (raw) => responseZ.parse(raw),
  });

  const findings: CandidateFinding[] = [];
  const warnings: string[] = [];
  for (const rawItem of result.data.findings) {
    const parsed = findingZ.safeParse(rawItem);
    if (!parsed.success) {
      warnings.push(
        `Dropped malformed finding from model: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
      );
      continue;
    }
    const { file, startLine, endLine, symbol, suggestion, suggestedCode, ...rest } = parsed.data;
    if (!input.delta.files.some((f) => f.path === file)) {
      warnings.push(`Dropped finding referencing unknown file "${file}"`);
      continue;
    }
    findings.push({
      ...rest,
      suggestion: suggestion ?? undefined,
      suggestedCode: suggestedCode ?? undefined,
      anchor: {
        file,
        startLine,
        endLine: endLine >= startLine ? endLine : startLine,
        symbol: symbol ?? undefined,
      },
    });
  }

  return { findings, usage: result.usage, warnings };
}
