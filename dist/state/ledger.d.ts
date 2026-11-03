import type { AirReviewState } from "../contracts/state.js";
export declare const STATE_MARKER_OPEN = "<!-- air-review:state:v1 -->";
export declare const STATE_MARKER_CLOSE = "<!-- /air-review:state:v1 -->";
export declare function encodeState(state: AirReviewState): string;
export declare function extractState(body: string): AirReviewState | null;
export declare function updateMarkerBlock(current: string, open: string, close: string, content: string): string;
