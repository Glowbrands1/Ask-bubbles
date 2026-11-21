/**
 * ============================================================================
 * THE NOT-ON-THE-STAFF-LIST LINE KEEPS THE FULL NAME (QA's f070, 20 Nov 2026; live chat on main 2923160b)
 * ============================================================================
 *
 * "ca for <First> <Last> for being late today, …" got "Here's the Corrective Action Form for <First>. <First> isn't on the
 * Woven staff list, so I've used the name as you typed it." The rules book says that line keeps the full name exactly as
 * typed (it is one of the lines that confirm which person it is), but the model applied the short reply name to it, in
 * some replies. Code guards it: when this turn's card came back with off_roster_name, the sentence "<name> isn't on (your
 * <place>'s | the) <staff> staff list" names that full name, in bold. The sentence is the app's own wording, matched by
 * its shape; nothing else in the reply is touched.
 */
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function withFullOffRosterName(reply: string, fullName: string, staff: string): string {
  const name = fullName.trim();
  if (!reply || !name) return reply;
  const line = new RegExp(
    String.raw`(^|[.!?]\s+|\n|,\s+)(\*\*)?([^*\n.!?,]{1,80}?)(\*\*)?(\s+(?:isn['’]t|is not) on (?:your [^\n.]{1,40}?['’]s |the )${escape(staff)} staff list)`,
    "gi",
  );
  return reply.replace(line, (whole, lead: string, open: string | undefined, typed: string, close: string | undefined, rest: string) =>
    typed.trim() === name && open && close ? whole : `${lead}**${name}**${rest}`,
  );
}

/**
 * QA's live re-test B8 (21 Nov 2026): "The reply says the person \"isn't on the Woven staff list\" and in the same reply
 * \"Woven shows <A> as no longer active\" — contradictory." A former employee (this turn's card came back with
 * inactive_in_woven) is found in Woven, so the reply says one thing: the not-on-the-staff-list sentence (with the check
 * line after it) becomes the inactive line, or goes when the reply already has it. The app's own sentences, by shape.
 */
export function withOneInactiveLine(reply: string, inactiveLine: string, staff: string): string {
  if (!reply) return reply;
  const offRoster = new RegExp(
    String.raw`(?:\*\*)?[^*\n.!?]{1,80}?(?:\*\*)?\s+(?:isn['’]t|is not) on (?:your [^\n.]{1,40}?['’]s |the )${escape(staff)} staff list[^.!?\n]*[.!?]?(?:\s+Check (?:it|the spelling)[^.!?\n]*Create\.)?`,
    "gi",
  );
  const inactiveSaid = /\bno longer active\b/i.test(reply);
  let replaced = false;
  const text = reply.replace(offRoster, () => {
    if (inactiveSaid || replaced) return "";
    replaced = true;
    return inactiveLine;
  });
  return text.replace(/[ \t]{2,}/g, " ").replace(/ +([.!?])/g, "$1").replace(/[ \t]+\n/g, "\n").trim();
}
