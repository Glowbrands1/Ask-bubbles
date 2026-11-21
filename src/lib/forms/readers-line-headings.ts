import { COMPANY_POLICIES_OFFENSE, offenseKeyForManualHeading } from "./official-policy-manual";

/**
 * ============================================================================
 * HEADINGS FILED UNDER ANOTHER TYPE OF OFFENSE BOX: ONE PLACE (QA f071 and c259, 20–21 Nov 2026)
 * ============================================================================
 *
 * The Corrective Action Form's Type of Offense has four boxes (attendance, standards of conduct, dress code, other). A
 * manual heading with no box of its own is recorded under the box Pau was told: Time Records under Standards of Conduct,
 * saved as "Standards of Conduct — Time Records" (f071). Runner 2's c259 (QA2, 21 Nov 2026, option (a)): the loop card
 * says the same, "Standards of Conduct — Time Records, JBA Policy Manual p.36", so the card and the saved ticks agree.
 *
 * Every reader of this rule reads it here: the loop card's policy line (`withReadersLineBox`), Create's reading of the
 * heading back from that line (`withoutReadersLineBox`), and the draft route's saved Policy Violated. Removing an entry,
 * or changing its box, changes all three at once (Pau's choice (b) or (c) is a one-line change).
 */

/*
 * QA's live re-test (21 Nov 2026, item 18): a loop card cited "Confidential Information Policy, JBA Policy Manual p.21",
 * and the saved form ticked Standards of Conduct under a Policy Violated that named only Confidential Information. That
 * heading has no box of its own either: the readers file every manual heading no box names under Violation of Company
 * Policies (`offenseKeyForManualHeading`), which revision 7 of the form replaced with Standards of Conduct
 * (`offense-keys.ts`; the template's own note in `library.ts`). So the c259 ruling (option (a)) holds for each such
 * heading by the same rule, not only for the one listed: the card and the saved line name the box the form ticks.
 */
/** The box revision 7 records a company policy under (Violation of Company Policies → Standards of Conduct). */
const COMPANY_POLICIES_BOX = "Standards of Conduct";

/** Manual heading (lower-case) → the Type of Offense box it is recorded under. */
export const READERS_LINE_HEADINGS: ReadonlyMap<string, string> = new Map([["time records", "Standards of Conduct"]]);

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The box a heading is recorded under, or null when it has its own (or none). */
export function readersLineBox(heading: string | null | undefined): string | null {
  const name = (heading ?? "").trim();
  const listed = READERS_LINE_HEADINGS.get(name.toLowerCase());
  if (listed) return listed;
  if (name === "" || /^other\b/i.test(name) || name.toLowerCase() === COMPANY_POLICIES_BOX.toLowerCase()) return null;
  return offenseKeyForManualHeading(name) === COMPANY_POLICIES_OFFENSE ? COMPANY_POLICIES_BOX : null;
}

/** A card citation for `heading` ("Time Records Policy, JBA Policy Manual p.36") as "<box> — Time Records, JBA …". */
export function withReadersLineBox(citation: string, heading: string): string {
  const box = readersLineBox(heading);
  if (!box) return citation;
  const named = new RegExp(`^${escape(heading.trim())}(?:\\s+Policy)?`, "i");
  return named.test(citation) ? citation.replace(named, `${box} — ${heading.trim()}`) : citation;
}

/** A policy line with any "<box> — " in front of a heading filed under it taken off, so the heading reads back. */
export function withoutReadersLineBox(line: string): string {
  const boxes = [...new Set([...READERS_LINE_HEADINGS.values(), COMPANY_POLICIES_BOX])];
  let out = line;
  for (const box of boxes) {
    out = out.replace(new RegExp(`(^|;\\s*|\\*\\*Policy:\\*\\*\\s*)${escape(box)}\\s*[—–-]\\s*(?=([^,;\\n]+))`, "gi"), (whole, lead: string, rest: string) => {
      const heading = rest.replace(/\s*\(.*$/, "").replace(/\s+Policy$/i, "").trim();
      return readersLineBox(heading) === box ? lead : whole;
    });
  }
  return out;
}
