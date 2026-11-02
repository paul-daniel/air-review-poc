import { afterEach, describe, expect, it, vi } from "vitest";
import { isAnimated, reportColorEnabled, writeReport } from "../src/cli/output.js";
const argv = process.argv;
const tty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
afterEach(() => {
  process.argv = argv;
  if (tty) Object.defineProperty(process.stdout, "isTTY", tty);
  else delete (process.stdout as { isTTY?: boolean }).isTTY;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function terminal(enabled: boolean, flags: string[] = []) {
  Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: enabled });
  process.argv = ["node", "air-review", ...flags];
  vi.stubEnv("AIR_REVIEW_PLAIN", "0");
  vi.stubEnv("AIR_REVIEW_ANIMATION", "1");
  vi.stubEnv("TERM", "xterm-256color");
}
describe("terminal style controls", () => {
  it("can force colors through a non-TTY wrapper while keeping plain mode explicit", () => {
    terminal(false, ["--color"]);
    expect(reportColorEnabled()).toBe(true);
    process.argv.push("--plain");
    expect(reportColorEnabled()).toBe(false);
    expect(isAnimated()).toBe(false);
  });
  it("respects no-color and no-animation independently", () => {
    terminal(true, ["--no-color", "--no-animation"]);
    expect(reportColorEnabled()).toBe(false);
    expect(isAnimated()).toBe(false);
  });
  it("reveals report in bounded chunks without losing any characters", async () => {
    terminal(true);
    vi.useFakeTimers();
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });
    const report = Array.from({ length: 65 }, (_, i) => `row ${i}`).join("\n") + "\n";
    const done = writeReport(report);
    await vi.runAllTimersAsync();
    await done;
    expect(writes.length).toBeGreaterThan(1);
    expect(writes.length).toBeLessThanOrEqual(12);
    expect(writes.join("")).toBe(report);
  });
  it.each([["--plain"], ["--json"], ["--no-animation"], ["--ascii"]])(
    "writes instantly for %s",
    async (flag) => {
      terminal(true, [flag]);
      const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      await writeReport("hello\n");
      expect(write).toHaveBeenCalledTimes(1);
      expect(write).toHaveBeenCalledWith("hello\n");
    },
  );
  it("does not animate a limited terminal", () => {
    terminal(true);
    vi.stubEnv("TERM", "dumb");
    expect(isAnimated()).toBe(false);
  });
});

describe("color modes", () => {
  it.each([
    ["auto", false],
    ["always", true],
    ["never", false],
  ] as const)("supports --color=%s", (mode, enabled) => {
    terminal(false, [`--color=${mode}`]);
    vi.stubEnv("FORCE_COLOR", "0");
    expect(reportColorEnabled()).toBe(enabled);
  });
  it("honors NO_COLOR in auto mode and an explicit always override", () => {
    terminal(true, ["--color=auto"]);
    vi.stubEnv("NO_COLOR", "1");
    expect(reportColorEnabled()).toBe(false);
    process.argv[2] = "--color=always";
    expect(reportColorEnabled()).toBe(true);
  });
});

it("colors human output by default even through a terminal wrapper", () => {
  terminal(false);
  vi.stubEnv("NO_COLOR", undefined);
  vi.stubEnv("FORCE_COLOR", undefined);
  expect(reportColorEnabled()).toBe(true);
  vi.stubEnv("NO_COLOR", "1");
  expect(reportColorEnabled()).toBe(false);
  vi.stubEnv("NO_COLOR", undefined);
  process.argv.push("--json");
  expect(reportColorEnabled()).toBe(false);
});
