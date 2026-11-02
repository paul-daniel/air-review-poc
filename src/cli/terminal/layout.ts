import { Chalk, type ChalkInstance } from "chalk";
import stringWidth from "string-width";
import wrapAnsi from "wrap-ansi";
import { redactSecrets } from "../../security/redaction.js";

export interface TerminalOptions {
  width?: number;
  color?: boolean;
  plain?: boolean;
  ascii?: boolean;
  sources?: Map<string, string>;
}

/** Input text is data, never terminal control codes. */
export function terminalText(value: string): string {
  /* eslint-disable no-control-regex -- stripping OSC, CSI and C0/C1 control sequences is the point */
  const clean = value
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\t/g, "  ");
  /* eslint-enable no-control-regex */
  return redactSecrets(clean).redacted;
}

export function wrapText(text: string, width: number): string[] {
  return wrapAnsi(terminalText(text), Math.max(1, width), { hard: true, trim: true }).split("\n");
}

/** Shared layout primitive: measure visible cells, not UTF-16 or ANSI bytes. */
export class TerminalLayout {
  readonly width: number;
  readonly color: ChalkInstance;
  readonly ascii: boolean;
  readonly lines: string[] = [];
  constructor(readonly options: TerminalOptions = {}) {
    this.width = Math.max(20, Math.min(options.width || 96, 112));
    this.color = new Chalk({ level: options.color && !options.plain ? 2 : 0 });
    this.ascii = Boolean(options.ascii || options.plain);
  }
  get separator(): string {
    return this.ascii ? " / " : " · ";
  }
  prose(text: string, style: (value: string) => string = (value) => value, indent = 2): void {
    const safe = this.ascii ? text.replace(/[·•]/g, "/").replace(/[–—]/g, "-") : text;
    for (const row of wrapText(safe, this.width - indent)) this.lines.push(" ".repeat(indent) + style(row));
  }
  inline(text: string, indent = 4): void {
    const safe = terminalText(text);
    const styled = safe.replace(/`([^`\n]+)`/g, (_, code: string) => this.color.cyan(code));
    for (const row of wrapAnsi(styled, this.width - indent, { hard: true, trim: true }).split("\n")) {
      this.lines.push(" ".repeat(indent) + row);
    }
  }
  pair(
    left: string,
    right: string,
    leftStyle: (s: string) => string,
    rightStyle: (s: string) => string,
  ): void {
    left = terminalText(left);
    right = terminalText(right);
    const gap = this.width - 4 - stringWidth(left) - stringWidth(right);
    if (gap >= 3) this.lines.push(`  ${leftStyle(left)}${" ".repeat(gap)}${rightStyle(right)}`);
    else {
      this.prose(left, leftStyle);
      this.prose(right, rightStyle, 4);
    }
  }
  space(): void {
    if (this.lines.at(-1) !== "") this.lines.push("");
  }
  section(label: string): void {
    this.space();
    this.prose(label, this.color.bold);
  }
  toString(): string {
    return this.lines.join("\n").trimEnd() + "\n";
  }
}
