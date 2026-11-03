import { type ChalkInstance } from "chalk";
export interface TerminalOptions {
    width?: number;
    color?: boolean;
    plain?: boolean;
    ascii?: boolean;
    sources?: Map<string, string>;
}
/** Input text is data, never terminal control codes. */
export declare function terminalText(value: string): string;
export declare function wrapText(text: string, width: number): string[];
/** Shared layout primitive: measure visible cells, not UTF-16 or ANSI bytes. */
export declare class TerminalLayout {
    readonly options: TerminalOptions;
    readonly width: number;
    readonly color: ChalkInstance;
    readonly ascii: boolean;
    readonly lines: string[];
    constructor(options?: TerminalOptions);
    get separator(): string;
    prose(text: string, style?: (value: string) => string, indent?: number): void;
    inline(text: string, indent?: number): void;
    pair(left: string, right: string, leftStyle: (s: string) => string, rightStyle: (s: string) => string): void;
    space(): void;
    section(label: string): void;
    toString(): string;
}
