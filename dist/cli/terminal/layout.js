import { Chalk } from "chalk";
import stringWidth from "string-width";
import wrapAnsi from "wrap-ansi";
import { redactSecrets } from "../../security/redaction.js";
/** Input text is data, never terminal control codes. */
export function terminalText(value) {
    /* eslint-disable no-control-regex -- stripping OSC, CSI and C0/C1 control sequences is the point */
    const clean = value
        .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
        .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
        .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, "")
        .replace(/\t/g, "  ");
    /* eslint-enable no-control-regex */
    return redactSecrets(clean).redacted;
}
export function wrapText(text, width) {
    return wrapAnsi(terminalText(text), Math.max(1, width), { hard: true, trim: true }).split("\n");
}
/** Shared layout primitive: measure visible cells, not UTF-16 or ANSI bytes. */
export class TerminalLayout {
    options;
    width;
    color;
    ascii;
    lines = [];
    constructor(options = {}) {
        this.options = options;
        this.width = Math.max(20, Math.min(options.width || 96, 112));
        this.color = new Chalk({ level: options.color && !options.plain ? 2 : 0 });
        this.ascii = Boolean(options.ascii || options.plain);
    }
    get separator() {
        return this.ascii ? " / " : " · ";
    }
    prose(text, style = (value) => value, indent = 2) {
        const safe = this.ascii ? text.replace(/[·•]/g, "/").replace(/[–—]/g, "-") : text;
        for (const row of wrapText(safe, this.width - indent))
            this.lines.push(" ".repeat(indent) + style(row));
    }
    inline(text, indent = 4) {
        const safe = terminalText(text);
        const styled = safe.replace(/`([^`\n]+)`/g, (_, code) => this.color.cyan(code));
        for (const row of wrapAnsi(styled, this.width - indent, { hard: true, trim: true }).split("\n")) {
            this.lines.push(" ".repeat(indent) + row);
        }
    }
    pair(left, right, leftStyle, rightStyle) {
        left = terminalText(left);
        right = terminalText(right);
        const gap = this.width - 4 - stringWidth(left) - stringWidth(right);
        if (gap >= 3)
            this.lines.push(`  ${leftStyle(left)}${" ".repeat(gap)}${rightStyle(right)}`);
        else {
            this.prose(left, leftStyle);
            this.prose(right, rightStyle, 4);
        }
    }
    space() {
        if (this.lines.at(-1) !== "")
            this.lines.push("");
    }
    section(label) {
        this.space();
        this.prose(label, this.color.bold);
    }
    toString() {
        return this.lines.join("\n").trimEnd() + "\n";
    }
}
//# sourceMappingURL=layout.js.map