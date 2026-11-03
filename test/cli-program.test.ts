import { describe, expect, it, vi } from "vitest";
import { buildProgram } from "../src/cli/program.js";
import { EXAMPLE_TOPICS } from "../src/cli/commands/example.js";
import { VISIBLE_PRESET_IDS } from "../src/model/presets.js";
import type { Command } from "commander";

/** Capture real help output, including addHelpText("after", ...) sections. */
function helpOf(command: Command): string {
  let output = "";
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    output += String(chunk);
    return true;
  });
  command.outputHelp();
  spy.mockRestore();
  return output;
}

describe("CLI structure", () => {
  const program = buildProgram();
  const commandNames = program.commands.map((command) => command.name());

  it("exposes every documented command", () => {
    for (const name of [
      "init",
      "doctor",
      "models",
      "review",
      "dry-run",
      "approve",
      "inspect",
      "explain",
      "example",
      "telemetry",
      "cache",
      "config",
    ]) {
      expect(commandNames, `missing command: ${name}`).toContain(name);
    }
  });

  it("has a working help command", () => {
    const instance = buildProgram();
    instance.exitOverride();
    const output: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      output.push(String(chunk));
      return true;
    });
    try {
      instance.parse(["node", "air-review", "help"]);
    } catch {
      /* commander throws on exit when exitOverride is set */
    }
    spy.mockRestore();
    expect(output.join("")).toContain("Usage: air-review");
    expect(output.join("")).toContain("review");
  });

  it("suggests a close match for typos", () => {
    const instance = buildProgram();
    instance.exitOverride();
    const errors: string[] = [];
    const spy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
      errors.push(String(chunk));
      return true;
    });
    try {
      instance.parse(["node", "air-review", "reveiw"]);
    } catch {
      /* unknown command exits */
    }
    spy.mockRestore();
    expect(errors.join("")).toMatch(/Did you mean review/);
  });

  it("gives every command a description and examples in its help", () => {
    for (const command of program.commands) {
      if (command.name() === "help") continue;
      expect(command.description().length, `${command.name()} description`).toBeGreaterThan(10);
      expect(helpOf(command), `${command.name()} examples`).toContain("Examples:");
    }
  });

  it("documents dry-run and deterministic review switches", () => {
    const review = program.commands.find((command) => command.name() === "review")!;
    const flags = review.options.map((option) => option.long);
    expect(flags).toContain("--dry-run");
    expect(flags).toContain("--deterministic-only");
    expect(flags).toContain("--no-verifier");
    expect(flags).toContain("--publish");
  });

  it("documents the SCM locators for GitHub and Azure DevOps on review, dry-run and inspect", () => {
    for (const name of ["review", "dry-run", "inspect"]) {
      const command = program.commands.find((candidate) => candidate.name() === name)!;
      const flags = command.options.map((option) => option.long);
      expect(flags, name).toEqual(
        expect.arrayContaining(["--ci", "--base", "--owner", "--org", "--project", "--repo", "--pr"]),
      );
      const ci = command.options.find((option) => option.long === "--ci")!;
      expect(ci.argChoices, `${name} --ci choices`).toEqual(["auto", "github", "azure-devops", "local"]);
    }
    const init = program.commands.find((candidate) => candidate.name() === "init")!;
    expect(init.options.find((option) => option.long === "--ci")!.argChoices).toContain("azure-devops");
  });

  it("keeps example topics in sync with provider presets", () => {
    for (const preset of VISIBLE_PRESET_IDS) {
      expect(EXAMPLE_TOPICS).toContain(preset);
    }
  });

  it("mentions the docs and exit codes in the top-level help", () => {
    const help = helpOf(program);
    expect(help).toContain("docs/commands.md");
    expect(help).toContain("Exit codes");
  });
});
