import { type TerminalOptions } from "./layout.js";
export interface CodeFrameOptions extends TerminalOptions {
    label?: string;
    language?: string;
    example?: boolean;
}
/** A gutter and colored canvas, without enclosing rectangles. */
export declare function renderCodeFrame(source: string, file: string, first: number, last: number, options?: CodeFrameOptions): string[];
