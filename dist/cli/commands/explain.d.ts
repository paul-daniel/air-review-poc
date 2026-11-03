import type { CliContext } from "../context.js";
import type { Finding } from "../../contracts/review.js";
export interface FindingListRow {
    id: string;
    severity: string;
    status: string;
    location: string;
    title: string;
}
export declare function findingRows(findings: Finding[]): FindingListRow[];
export declare function runExplain(ctx: CliContext, findingId: string | undefined, json: boolean): Promise<void>;
