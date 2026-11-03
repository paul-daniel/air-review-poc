import type { CliContext } from "../context.js";
export interface InspectOptions {
    diff: boolean;
    json: boolean;
}
export declare function runInspect(ctx: CliContext, options: InspectOptions): Promise<void>;
