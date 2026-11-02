import { reviewableFiles } from "../../context/diff.js";
import { analyzeDelta, readProjectFacts } from "../../context/analyze.js";
import { describeProfile } from "../../context/profile.js";
import type { CliContext } from "../context.js";
import { printJson, printTable, c } from "../output.js";

export interface InspectOptions {
  diff: boolean;
  json: boolean;
}

export async function runInspect(ctx: CliContext, options: InspectOptions): Promise<void> {
  const snapshot = await ctx.scm.getPullRequest();
  const delta = await ctx.scm.getDelta(snapshot.baseSha, snapshot.headSha);
  const trackedFiles = await ctx.git.listTrackedFiles();
  const projectFacts = readProjectFacts(ctx.git);
  const analysis = analyzeDelta(ctx.git, delta, trackedFiles, projectFacts, {
    maxTokens: ctx.config.context.maxEvidenceTokens,
    maxFiles: ctx.config.context.maxContextRequests,
  });

  if (options.json) {
    printJson({
      pr: snapshot,
      delta: {
        from: delta.fromSha,
        to: delta.toSha,
        files: delta.files.map((file) => ({
          path: file.path,
          status: file.status,
          added: file.addedLines.length,
          removed: file.removedLines.length,
        })),
      },
      projectFacts,
      profile: analysis.evidence.profile,
      exemplars: analysis.plan.exemplars.map((e) => ({
        forFile: e.forFile,
        path: e.path,
        relation: e.relation,
        reason: e.reason,
        lines: e.lines,
        truncated: e.truncated,
      })),
      relatedModules: analysis.plan.related.map((r) => ({
        forFile: r.forFile,
        path: r.path,
        exports: r.exports.length,
      })),
      planNotes: analysis.plan.notes,
      estimatedEvidenceTokens: analysis.plan.estimatedTokens,
      conventions: analysis.evidence.conventions,
      secrets: analysis.secrets.map((s) => ({ kind: s.kind, file: s.file, line: s.line })),
      facts: [...analysis.facts.values()],
      warnings: analysis.injectionWarnings,
    });
    return;
  }

  process.stdout.write(
    `${c.bold("pull request")} ${snapshot.owner}/${snapshot.repo}` +
      `${snapshot.number !== null ? ` #${snapshot.number}` : ""} — "${snapshot.title}"\n` +
      `${c.dim(`${snapshot.baseRef} ${snapshot.baseSha.slice(0, 8)} → ${snapshot.headRef} ${snapshot.headSha.slice(0, 8)}`)}\n\n`,
  );

  process.stdout.write(`${c.bold("changed files")}\n`);
  printTable(
    ["status", "file", "+", "-"],
    delta.files.map((file) => [file.status, file.path, file.addedLines.length, file.removedLines.length]),
  );

  if (analysis.evidence.profile) {
    process.stdout.write(
      `\n${c.bold("repository profile")}\n${describeProfile(analysis.evidence.profile)}\n`,
    );
  }

  process.stdout.write(
    `\n${c.bold("context plan")} ${c.dim(`~${analysis.plan.estimatedTokens} evidence tokens, ${analysis.plan.filesRead} files read`)}\n`,
  );
  if (analysis.plan.exemplars.length === 0 && analysis.plan.related.length === 0) {
    process.stdout.write(`${c.dim("no exemplars selected")}\n`);
  }
  if (analysis.plan.exemplars.length > 0) {
    printTable(
      ["for", "exemplar", "why", "lines"],
      analysis.plan.exemplars.map((e) => [
        e.forFile,
        e.path,
        e.reason,
        e.truncated ? `${e.lines} (excerpt)` : e.lines,
      ]),
    );
  }
  if (analysis.plan.related.length > 0) {
    process.stdout.write(`\n${c.bold("related modules")} ${c.dim("(exported API sent to the reviewer)")}\n`);
    printTable(
      ["for", "module", "exports"],
      analysis.plan.related.map((r) => [r.forFile, r.path, r.exports.length]),
    );
  }
  for (const note of analysis.plan.notes) {
    process.stdout.write(`${c.yellow("note")}: ${note}\n`);
  }

  if (analysis.evidence.conventions.length > 0) {
    process.stdout.write(`\n${c.bold("repository conventions")}\n`);
    printTable(
      ["convention", "examples", "counter", "confidence"],
      analysis.evidence.conventions.map((conv) => [
        conv.label,
        conv.matchingExamples,
        conv.counterExamples,
        conv.confidence.toFixed(2),
      ]),
    );
  }

  process.stdout.write(`\n${c.bold("structural facts")}\n`);
  for (const file of reviewableFiles(delta)) {
    const facts = analysis.facts.get(file.path);
    if (!facts) continue;
    process.stdout.write(`${c.cyan(file.path)}\n`);
    for (const symbol of facts.symbols) {
      const details: string[] = [];
      if (symbol.selector) details.push(`<${symbol.selector}>`);
      if (symbol.injected.length) details.push(`injects [${symbol.injected.join(", ")}]`);
      if (symbol.inputs.length) details.push(`@Input(${symbol.inputs.join(", ")})`);
      if (symbol.outputs.length) details.push(`@Output(${symbol.outputs.join(", ")})`);
      process.stdout.write(
        `  ${c.dim(`line ${symbol.line}`)} ${symbol.kind} ${c.bold(symbol.name)}` +
          `${details.length ? ` ${details.join(" ")}` : ""}\n`,
      );
    }
    for (const sub of facts.subscriptions) {
      if (sub.cleanup === "none") {
        process.stdout.write(
          `  ${c.dim(`line ${sub.line}`)} ${c.yellow("subscription without teardown")} ${sub.owner ?? ""}\n`,
        );
      }
    }
  }

  if (analysis.secrets.length > 0) {
    process.stdout.write(`\n${c.red("secrets detected")}\n`);
    for (const secret of analysis.secrets) {
      process.stdout.write(`  ${secret.kind} @ ${secret.file}:${secret.line}\n`);
    }
  }

  for (const warning of analysis.injectionWarnings) {
    process.stdout.write(`${c.yellow("warning")}: ${warning}\n`);
  }

  if (options.diff) {
    process.stdout.write(`\n${c.bold("diff")}\n${delta.diff}\n`);
  }
}
