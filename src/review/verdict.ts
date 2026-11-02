import type { ReviewVerdict } from "../contracts/review.js";

/**
 * The verdict a human reviewer would cast from the same facts:
 *   - nothing open                      → approve
 *   - open findings, none blocking      → approve with suggestions (or comment, by policy)
 *   - blocking findings (gate failed)   → request changes
 *   - the run could not complete        → comment only (never vote on partial data)
 */
export function decideVerdict(input: {
  open: number;
  gatePassed: boolean;
  incomplete: boolean;
  approveWithSuggestions: boolean;
}): ReviewVerdict {
  if (input.incomplete) return "comment";
  if (!input.gatePassed) return "request-changes";
  if (input.open === 0) return "approve";
  return input.approveWithSuggestions ? "approve-with-suggestions" : "comment";
}
