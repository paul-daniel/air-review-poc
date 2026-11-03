import type { AirReviewState } from "../contracts/state.js";
import { STATE_SCHEMA_VERSION } from "../version.js";

export const STATE_MARKER_OPEN = "<!-- air-review:state:v1 -->";
export const STATE_MARKER_CLOSE = "<!-- /air-review:state:v1 -->";

/** One-line title of the collapsed memory thread, for humans scrolling the activity feed. */
export const STATE_SUMMARY_LINE =
  "air-review memory — machine-readable ledger kept for the tool; nothing to read here";

/**
 * The ledger is wrapped in a `<details>` block that is collapsed by default
 * (Azure DevOps and GitHub both render it), with the JSON in a fenced block so
 * it is shown as code when someone does expand it. The markers stay around the
 * JSON only: that is what `extractState` and the adapters look for.
 */
export function encodeState(state: AirReviewState): string {
  return [
    `<details><summary>${STATE_SUMMARY_LINE}</summary>`,
    "",
    STATE_MARKER_OPEN,
    "```json",
    JSON.stringify(state, null, 2),
    "```",
    STATE_MARKER_CLOSE,
    "",
    "</details>",
  ].join("\n");
}

export function extractState(body: string): AirReviewState | null {
  const start = body.indexOf(STATE_MARKER_OPEN);
  if (start < 0) return null;
  const jsonStart = start + STATE_MARKER_OPEN.length;
  const end = body.indexOf(STATE_MARKER_CLOSE, jsonStart);
  if (end < 0) return null;
  const raw = stripFence(body.slice(jsonStart, end).trim());
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

/** Accepts both the fenced envelope and the bare JSON written by versions ≤ 0.3.0. */
function stripFence(raw: string): string {
  if (!raw.startsWith("```")) return raw;
  const firstBreak = raw.indexOf("\n");
  if (firstBreak < 0) return raw;
  const inner = raw.slice(firstBreak + 1);
  const closing = inner.lastIndexOf("```");
  return (closing < 0 ? inner : inner.slice(0, closing)).trim();
}
