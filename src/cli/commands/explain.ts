import type { CliContext } from "../context.js";
import { extractState } from "../../state/ledger.js";
import { EngineError } from "../../errors.js";
import {
  printJson,
  printTable,
  severityColor,
  c,
  isPlainMode,
  reportColorEnabled,
  writeReport,
} from "../output.js";
import { renderFinding } from "../terminal/finding.js";
import type { Finding } from "../../contracts/review.js";

export interface FindingListRow {
  id: string;
  severity: string;
  status: string;
  location: string;
  title: string;
}

export function findingRows(findings: Finding[]): FindingListRow[] {
  return findings.map((finding) => ({
    id: finding.id,
    severity: finding.severity,
    status: finding.status,
    location: `${finding.anchor.file}:${finding.anchor.startLine}`,
    title: finding.title,
  }));
}

export async function runExplain(
  ctx: CliContext,
  findingId: string | undefined,
  json: boolean,
): Promise<void> {
  const stateBody = await ctx.scm.listState();
  if (!stateBody) {
    throw new EngineError('No air-review state found for this pull request. Run "air-review review" first.');
  }
  const state = extractState(stateBody);
  if (!state) {
    throw new EngineError("The stored air-review state is unreadable or uses an unsupported schema.");
  }

  if (!findingId) {
    const rows = findingRows(state.findings);
    if (json) {
      printJson({ reviewedHeadSha: state.pullRequest.headSha, findings: rows });
      return;
    }
    if (rows.length === 0) {
      process.stdout.write(`${c.dim("No findings stored for this pull request.")}\n`);
      return;
    }
    process.stdout.write(
      `${c.bold("findings")} ${c.dim(`reviewed ${state.pullRequest.headSha.slice(0, 8)}`)}\n\n`,
    );
    printTable(
      ["id", "severity", "status", "location", "title"],
      rows.map((row) => [row.id, severityColor(row.severity), row.status, row.location, row.title]),
    );
    process.stdout.write(`\n${c.dim("Details: air-review explain <id>")}\n`);
    return;
  }

  const finding = state.findings.find((f) => f.id === findingId);
  if (!finding) {
    throw new EngineError(
      `Finding ${findingId} not found. Known ids: ${state.findings.map((f) => f.id).join(", ") || "none"}.`,
    );
  }

  if (json) {
    printJson({
      finding,
      history: state.history.filter((event) => event.findingId === findingId),
      reviewedHeadSha: state.pullRequest.headSha,
    });
    return;
  }

  const source = await ctx.git.readFileAt(state.pullRequest.headSha, finding.anchor.file);
  await writeReport(
    "\n" +
      renderFinding(finding, {
        width: process.stdout.columns ?? 96,
        color: reportColorEnabled(),
        plain: isPlainMode() || (!process.stdout.isTTY && !reportColorEnabled()),
        ascii: process.env.TERM === "dumb" || process.argv.includes("--ascii"),
        sources: new Map([[finding.anchor.file, source]]),
        detailed: true,
      }).join("\n") +
      "\n",
  );
}
