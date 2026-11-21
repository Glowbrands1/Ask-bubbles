import { appConfig } from "./app-config";

/*
 * ============================================================================
 * THE LOOP READS ONLY THIS COMPANY'S JOB TITLES (QA2 for Pau, 21 Nov 2026)
 * ============================================================================
 *
 * The loop's title reads (the title said for a person, a title typed beside a name, a title spelled out) use the app
 * config's own list (`jobTitleList`: for this app, its Woven positions and their short forms), never the older chat
 * path's list, so a position this company does not have is never read as a title nor written on a card.
 */

/** The title the words say ("our GM" → "General Manager"), from the config's list; null when none. */
export function loopTitleIn(text: string): string | null {
  // "at Sioux Falls, SD": a state code after a comma is a place, not a title abbreviation.
  const source = text.replace(/,\s*[A-Z]{2}\b/g, "");
  for (const entry of appConfig().jobTitleList) {
    if (entry.pattern.test(source)) return entry.title;
  }
  return null;
}

/** The patterns that read one title, global (for `matchAll`). */
export function loopTitlePatterns(title: string): RegExp[] {
  return appConfig()
    .jobTitleList.filter((entry) => entry.title === title)
    .map((entry) => new RegExp(entry.pattern.source, entry.pattern.flags.includes("g") ? entry.pattern.flags : `${entry.pattern.flags}g`));
}

/** A title as the card writes it: a whole title or short form from the list ("agm" → "Assistant General Manager"); else null. */
export function loopCardTitle(typed: string): string | null {
  const said = typed.replace(/\s+/g, " ").trim();
  if (!said) return null;
  for (const entry of appConfig().jobTitleList) {
    const whole = new RegExp(`^(?:${entry.pattern.source})$`, entry.pattern.flags.replace("g", ""));
    if (whole.test(said)) return entry.title;
  }
  return null;
}
