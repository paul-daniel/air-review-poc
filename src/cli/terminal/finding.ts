import type { Finding } from "../../contracts/review.js";
import { TerminalLayout, type TerminalOptions } from "./layout.js";
import { renderCodeFrame } from "./code-frame.js";

export interface FindingOptions extends TerminalOptions {
  index?: number;
  detailed?: boolean;
}

export function renderFinding(finding: Finding, options: FindingOptions = {}): string[] {
  const ui = new TerminalLayout(options);
  const c = ui.color;
  const severity =
    finding.severity === "BLOCKER" || finding.severity === "CRITICAL"
      ? c.red.bold
      : finding.severity === "MAJOR"
        ? c.ansi256(214).bold
        : finding.severity === "MINOR"
          ? c.yellow
          : c.gray;
  const location = `${finding.anchor.file}:${finding.anchor.startLine}${finding.anchor.endLine > finding.anchor.startLine ? `-${finding.anchor.endLine}` : ""}`;
  ui.pair(`${String(options.index ?? 1).padStart(2, "0")}  ${finding.severity}`, location, severity, c.cyan);
  ui.prose(finding.title, c.bold, 4);
  ui.space();
  const source = options.sources?.get(finding.anchor.file);
  if (source) {
    ui.lines.push(
      ...renderCodeFrame(
        source,
        finding.anchor.file,
        finding.anchor.startLine,
        finding.anchor.endLine,
        options,
      ),
    );
  } else ui.prose("Code excerpt unavailable at this revision.", c.gray, 4);
  ui.space();
  ui.inline(finding.summary);
  if (finding.suggestion) {
    ui.space();
    ui.inline(finding.suggestion);
  }
  if (finding.suggestedCode) {
    ui.space();
    ui.lines.push(
      ...renderCodeFrame(finding.suggestedCode.code, finding.anchor.file, 1, 1, {
        ...options,
        example: true,
        language: finding.suggestedCode.language,
        label: `Fix example${ui.separator}${finding.suggestedCode.language}`,
      }),
    );
  }
  ui.space();
  const evidence = finding.evidence
    .filter((item) => item.kind === "framework" || item.kind === "convention")
    .slice(0, 2)
    .map((item) => item.label);
  ui.prose(
    [
      ...evidence,
      `${Math.round(finding.confidence * 100)}% confidence`,
      ...(finding.status === "REOPENED" ? ["Reopened"] : []),
      ...(finding.scope === "FOLLOW_UP"
        ? [
            finding.anchor.inDiff === false
              ? "Follow-up: unchanged code this change interacts with"
              : "Follow-up",
          ]
        : finding.scope === "REPO_WIDE"
          ? ["Repository-wide"]
          : []),
    ].join(ui.separator),
    c.gray,
    4,
  );
  ui.prose(`${finding.ruleId}${ui.separator}air-review explain ${finding.id}`, c.gray, 4);
  if (options.detailed) {
    ui.space();
    for (const item of finding.evidence) {
      ui.prose(`${item.label}${item.detail ? `: ${item.detail}` : ""}`, (value) => value, 4);
    }
    ui.prose(
      `${finding.status}${ui.separator}first seen ${finding.firstSeenSha?.slice(0, 8) ?? "unknown"}${ui.separator}last checked ${finding.lastCheckedSha?.slice(0, 8) ?? "unknown"}`,
      c.gray,
      4,
    );
  }
  return ui.lines;
}
