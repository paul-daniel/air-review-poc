import { Chalk } from "chalk";
import stringWidth from "string-width";
import { terminalText } from "./terminal/layout.js";
export const c = new Chalk({ level: reportColorEnabled() ? 2 : 0 });
export function isPlainMode() {
    return process.env.AIR_REVIEW_PLAIN === "1" || process.argv.includes("--plain");
}
export function isAnimated() {
    return (Boolean(process.stdout.isTTY) &&
        !isPlainMode() &&
        !process.argv.includes("--json") &&
        process.env.TERM !== "dumb" &&
        !process.argv.includes("--ascii") &&
        !process.argv.includes("--no-animation") &&
        process.env.AIR_REVIEW_ANIMATION !== "0");
}
/** Explicit controls also work when a terminal wrapper does not expose isTTY. */
export function reportColorEnabled() {
    if (isPlainMode() || process.argv.includes("--no-color") || process.argv.includes("--json"))
        return false;
    let mode = "always";
    let explicit = false;
    for (let i = 0; i < process.argv.length; i++) {
        const arg = process.argv[i];
        if (arg.startsWith("--color=")) {
            mode = arg.slice(8);
            explicit = true;
        }
        else if (arg === "--color") {
            mode = ["auto", "always", "never"].includes(process.argv[i + 1] ?? "")
                ? process.argv[i + 1]
                : "always";
            explicit = true;
        }
    }
    if (mode === "never")
        return false;
    if (explicit && mode === "always")
        return true;
    if (process.env.NO_COLOR !== undefined || process.env.FORCE_COLOR === "0")
        return false;
    if (mode === "always")
        return true;
    return (process.env.FORCE_COLOR !== undefined || (Boolean(process.stdout.isTTY) && process.env.TERM !== "dumb"));
}
/** Preserve the existing bare --color alias without consuming the subcommand. */
export function normalizeColorArgs(args) {
    return args.map((arg, i) => arg === "--color" && !["auto", "always", "never"].includes(args[i + 1] ?? "") ? "--color=always" : arg);
}
/** Brief progressive reveal; no motion or cursor controls in redirected/JSON/plain output. */
export async function writeReport(report) {
    if (!isAnimated()) {
        process.stdout.write(report);
        return;
    }
    const lines = report.split("\n");
    const step = Math.max(5, Math.ceil(lines.length / 12));
    for (let i = 0; i < lines.length; i += step) {
        if (i)
            await new Promise((resolve) => setTimeout(resolve, 18));
        process.stdout.write(lines.slice(i, i + step).join("\n") + (i + step < lines.length ? "\n" : ""));
    }
}
/** Compact command identity; review renders its own complete report header. */
export async function printBanner(subtitle, options = {}) {
    if (!isAnimated() && !options.force)
        return;
    process.stdout.write(`\n  ${c.bold(c.cyan("AIR REVIEW"))}${subtitle ? `  /  ${subtitle}` : ""}\n\n`);
}
/** Minimal stderr spinner; completely silent outside interactive terminals. */
export class Spinner {
    frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    timer = null;
    index = 0;
    text = "";
    enabled;
    startedAt = 0;
    constructor() {
        this.enabled = isAnimated() && Boolean(process.stderr.isTTY);
    }
    start(text) {
        this.text = text;
        if (!this.enabled || this.timer)
            return;
        this.startedAt = Date.now();
        this.draw();
        this.timer = setInterval(() => this.draw(), 70);
    }
    update(text) {
        this.text = text;
        if (this.timer)
            this.draw();
    }
    draw() {
        const colors = new Chalk({ level: reportColorEnabled() ? 2 : 0 });
        const frame = this.frames[this.index++ % this.frames.length] ?? "•";
        const elapsed = ((Date.now() - this.startedAt) / 1000).toFixed(1);
        const label = terminalText(this.text).slice(0, Math.max(12, (process.stderr.columns || 80) - 18));
        process.stderr.write(`\r\x1b[2K  ${colors.cyan(frame)} ${colors.bold(label)} ${colors.cyan(`${elapsed}s`)}`);
    }
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
            process.stderr.write("\r\x1b[K");
        }
    }
}
export function printJson(value) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
export function printTable(header, rows) {
    const widths = header.map((title, index) => Math.max(title.length, ...rows.map((row) => stringWidth(String(row[index] ?? "")))));
    const render = (cells) => cells
        .map((cell, index) => String(cell) + " ".repeat(Math.max(0, (widths[index] ?? 0) - stringWidth(String(cell)))))
        .join("  ")
        .trimEnd();
    process.stdout.write(`${c.bold(render(header))}\n`);
    for (const row of rows) {
        process.stdout.write(`${render(row)}\n`);
    }
}
export function formatBytes(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
export function formatTokens(count) {
    if (count < 1000)
        return String(count);
    if (count < 1_000_000)
        return `${(count / 1000).toFixed(1)}k`;
    return `${(count / 1_000_000).toFixed(2)}M`;
}
export function severityColor(severity) {
    switch (severity) {
        case "BLOCKER":
            return c.red(severity);
        case "CRITICAL":
            return c.magenta(severity);
        case "MAJOR":
            return c.yellow(severity);
        case "MINOR":
            return c.cyan(severity);
        default:
            return c.dim(severity);
    }
}
//# sourceMappingURL=output.js.map