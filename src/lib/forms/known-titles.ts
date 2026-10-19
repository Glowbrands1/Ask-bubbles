/**
 * ============================================================================
 * A JOB TITLE IS NOT A PERSON
 * ============================================================================
 *
 * Woven spells its positions in Title Case — "Assistant General Manager",
 * "Team Member Part Time", "Production Associate" — and the typed-name reader
 * takes a run of capitalised words for somebody's name. So "Sarah Miller, our
 * Assistant General Manager" named two people, and the form asked which.
 *
 * The positions Woven actually holds (`woven_position_map`) are the evidence:
 * where a phrase IS one of them, it is lower-cased in the WORKING COPY the
 * proposal reads names from, so it can no longer pass for a name. The
 * conversation itself is untouched, nothing is stored from this copy, and a
 * title is still read as a title (the title readers are case-insensitive).
 *
 * Whole phrases only, longest first, on word boundaries — "Owner" inside
 * "Owner Smith" is a surname and is left alone when it leads a longer capitalised
 * phrase that is not itself a title.
 *
 * Pure and browser-safe.
 */

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function neutralizeTitles(text: string, titles: readonly string[]): string {
  if (!text || titles.length === 0) return text;
  const phrases = [...new Set(titles.map((title) => title.trim()).filter((title) => title.length > 1))].sort(
    (a, b) => b.length - a.length,
  );
  let out = text;
  for (const phrase of phrases) {
    const pattern = new RegExp(`(?<![A-Za-z'’-])${escape(phrase).replace(/\s+/g, "\\s+")}(?![A-Za-z'’-])`, "g");
    out = out.replace(pattern, (match, offset: number, whole: string) => {
      // "Owner Smith": a title word that leads a longer capitalised name is a surname, not the title.
      const next = /^\s+([A-Z][a-z]+)/.exec(whole.slice(offset + match.length));
      if (next && !phrases.some((other) => other.toLowerCase().startsWith(`${match.toLowerCase()} ${next[1]!.toLowerCase()}`))) {
        if (match.split(/\s+/).length === 1) return match;
      }
      return match.toLowerCase();
    });
  }
  return out;
}
