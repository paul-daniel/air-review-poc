import type { AirReviewState } from "../contracts/state.js";
export declare const STATE_MARKER_OPEN = "<!-- air-review:state:v1 -->";
export declare const STATE_MARKER_CLOSE = "<!-- /air-review:state:v1 -->";
/** One-line title of the collapsed memory thread, for humans scrolling the activity feed. */
export declare const STATE_SUMMARY_LINE = "air-review memory \u2014 machine-readable ledger kept for the tool; nothing to read here";
/**
 * The ledger is wrapped in a `<details>` block that is collapsed by default
 * (Azure DevOps and GitHub both render it), with the JSON in a fenced block so
 * it is shown as code when someone does expand it. The markers stay around the
 * JSON only: that is what `extractState` and the adapters look for.
 */
export declare function encodeState(state: AirReviewState): string;
export declare function extractState(body: string): AirReviewState | null;
export declare function updateMarkerBlock(current: string, open: string, close: string, content: string): string;
