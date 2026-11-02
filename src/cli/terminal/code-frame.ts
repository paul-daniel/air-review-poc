import { highlight, supportsLanguage, DEFAULT_THEME } from "cli-highlight";
import stringWidth from "string-width";
import wrapAnsi from "wrap-ansi";
import { TerminalLayout, terminalText, type TerminalOptions } from "./layout.js";

const LANGUAGES: Record<string, [string, string]> = {
  ts: ["typescript", "TypeScript"],
  tsx: ["typescript", "TSX"],
  js: ["javascript", "JavaScript"],
  jsx: ["javascript", "JSX"],
  py: ["python", "Python"],
  json: ["json", "JSON"],
  html: ["html", "HTML"],
  css: ["css", "CSS"],
  scss: ["scss", "SCSS"],
  yml: ["yaml", "YAML"],
  yaml: ["yaml", "YAML"],
  sh: ["bash", "Shell"],
  md: ["markdown", "Markdown"],
  go: ["go", "Go"],
  rs: ["rust", "Rust"],
};

export interface CodeFrameOptions extends TerminalOptions {
  label?: string;
  language?: string;
  example?: boolean;
}

/** A gutter and colored canvas, without enclosing rectangles. */
export function renderCodeFrame(
  source: string,
  file: string,
  first: number,
  last: number,
  options: CodeFrameOptions = {},
): string[] {
  const ui = new TerminalLayout(options);
  const c = ui.color;
  const [language, name] = options.language
    ? [options.language, options.language]
    : (LANGUAGES[file.split(".").pop() ?? ""] ?? ["text", "Text"]);
  const rows = terminalText(source).split("\n");
  const begin = options.example ? 1 : Math.max(1, first - 2);
  const end = options.example ? rows.length : Math.min(rows.length, Math.max(first, last) + 2);
  if (begin > rows.length) {
    ui.prose("Code excerpt unavailable at this revision.", c.gray, 4);
    return ui.lines;
  }
  const range = first === last ? `line ${first}` : `lines ${first}${ui.ascii ? "-" : "–"}${last}`;
  ui.prose(options.label ?? `${name}${ui.separator}${range} highlighted`, c.gray, 4);
  const neutral = (value: string) => value;
  const theme = Object.fromEntries(Object.keys(DEFAULT_THEME).map((key) => [key, neutral]));
  Object.assign(theme, {
    keyword: c.magenta,
    string: c.green,
    number: c.yellow,
    literal: c.yellow,
    comment: c.ansi256(145),
    title: c.cyan,
    type: c.cyan,
    built_in: c.cyan,
    attr: c.cyan,
    symbol: c.cyan,
    default: neutral,
  });
  const excerpt = rows.slice(begin - 1, end).join("\n");
  let colored: string[] = excerpt.split("\n");
  if (c.level && supportsLanguage(language)) {
    try {
      colored = highlight(excerpt, { language, ignoreIllegals: true, theme }).split("\n");
    } catch {
      /* Unknown or invalid syntax still has a readable, unstyled fallback. */
    }
  }
  const digits = String(end).length;
  const inner = ui.width - 4;
  const selection = Array.from({ length: end - begin + 1 }, (_, i) => begin + i);
  const visible =
    selection.length > 48 ? [...selection.slice(0, 24), -1, ...selection.slice(-12)] : selection;
  for (const number of visible) {
    if (number === -1) {
      ui.prose(`... ${selection.length - 36} lines omitted ...`, c.gray, 4);
      continue;
    }
    const active = !options.example && number >= first && number <= last;
    const gutter = options.example
      ? "  "
      : `${active ? ">" : " "} ${String(number).padStart(digits)} ${ui.ascii ? "|" : "│"} `;
    const chunks = wrapAnsi(colored[number - begin]!, inner - stringWidth(gutter), {
      hard: true,
      trim: false,
      wordWrap: false,
    }).split("\n");
    chunks.forEach((part, index) => {
      const prefix =
        index && !options.example
          ? `${active ? ">" : " "} ${" ".repeat(digits)} ${ui.ascii ? "|" : "│"} `
          : gutter;
      const padding = " ".repeat(Math.max(0, inner - stringWidth(prefix + part)));
      const body = (active ? c.yellow(prefix) : c.ansi256(145)(prefix)) + part + padding;
      ui.lines.push("  " + (c.level ? c.bgAnsi256(active ? 24 : 235).ansi256(252)(body) : body.trimEnd()));
    });
  }
  return ui.lines;
}
