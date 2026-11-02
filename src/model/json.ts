/** Extract a JSON object from a model response, tolerating markdown fences. */
export function extractJson(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) {
    try {
      JSON.parse(fenced[1]);
      return fenced[1];
    } catch {
      /* fall through */
    }
  }

  const firstBrace = trimmed.indexOf("{");
  const firstBracket = trimmed.indexOf("[");
  const candidates: number[] = [firstBrace, firstBracket].filter((i) => i >= 0);
  if (candidates.length === 0) return null;
  const start = Math.min(...candidates);
  const open = trimmed[start];
  const close = open === "{" ? "}" : "]";
  const end = trimmed.lastIndexOf(close);
  if (end <= start) return null;
  return trimmed.slice(start, end + 1);
}
