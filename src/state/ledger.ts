import type { AirReviewState } from "../contracts/state.js";
import { STATE_SCHEMA_VERSION } from "../version.js";

export const STATE_MARKER_OPEN = "<!-- air-review:state:v1 -->";
export const STATE_MARKER_CLOSE = "<!-- /air-review:state:v1 -->";

export function encodeState(state: AirReviewState): string {
  return [STATE_MARKER_OPEN, JSON.stringify(state, null, 2), STATE_MARKER_CLOSE].join("\n");
}

export function extractState(body: string): AirReviewState | null {
  const start = body.indexOf(STATE_MARKER_OPEN);
  if (start < 0) return null;
  const jsonStart = start + STATE_MARKER_OPEN.length;
  const end = body.indexOf(STATE_MARKER_CLOSE, jsonStart);
  if (end < 0) return null;
  const raw = body.slice(jsonStart, end).trim();
  try {
    const parsed = JSON.parse(raw) as AirReviewState;
    if (parsed.schemaVersion !== STATE_SCHEMA_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function updateMarkerBlock(current: string, open: string, close: string, content: string): string {
  const start = current.indexOf(open);
  if (start < 0) return `${current ? `${current}\n\n` : ""}${open}\n${content}\n${close}`;
  const jsonStart = start + open.length;
  const end = current.indexOf(close, jsonStart);
  if (end < 0) return current;
  return `${current.slice(0, start)}${open}\n${content}\n${current.slice(end)}`;
}
