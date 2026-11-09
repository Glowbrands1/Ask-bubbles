import { possessivePlaceNotPersonEnabled } from "@/lib/config/chat-quality-flags";
import { COMPANY_LOCATIONS } from "@/lib/locations";

/*
 * ============================================================================
 * "<WORD>'S <PLACE>" IS A PLACE, NOT A PERSON (POSSESSIVE_PLACE_NOT_PERSON_ENABLED)
 * ============================================================================
 *
 * QA, the Bubbles round-6 live test (9 Nov 2026; pre-existing): "create a CA for Lee's Summit Plaza, she was late on
 * 10-20-26" made a card for Employee "Lee": the possessive of a store's own name read as a first name.
 *
 * With the flag on, the last check before the reply (after PERSON_GUARD): when every mention of the card's person in
 * the manager's words is "<Name>'s <Place>" — the start of one of the company's store names ("Lee's Summit") or a
 * possessive followed by a place word ("<Name>'s Plaza", "… Summit Plaza") — the card loses that name and asks who the
 * form is for. A person named plainly anywhere ("Lee was late", "for Lee Calder") keeps the card. Off, as before.
 */

const PLACE_WORD = String.raw`(?:plaza|mall|center|centre|square|crossing|commons|market(?:place)?|village|station|shops|shopping|store|location|park)`;

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The words after "<name>'s" that make it a store's name: "Summit" for "Lee's Summit, MO". */
function storeTails(name: string): string[] {
  const own = new RegExp(String.raw`^${escape(name)}['’]s\s+([^,]+)`, "i");
  return COMPANY_LOCATIONS.flatMap((location) => {
    const tail = own.exec(location.name)?.[1]?.trim();
    return tail ? [tail] : [];
  });
}

/** Every mention of `name` in `said` is a possessive place, and there is at least one. */
export function onlyAsPossessivePlace(name: string, said: string): boolean {
  const word = name.trim();
  if (!word || /\s/.test(word)) return false;
  const mentions = [...said.matchAll(new RegExp(String.raw`(?<![\p{L}])${escape(word)}(?![\p{L}])`, "giu"))];
  if (mentions.length === 0) return false;
  const tails = storeTails(word);
  const place = new RegExp(
    String.raw`^['’]s\s+(?:${[...tails.map(escape), String.raw`(?:\p{L}+\s+){0,2}${PLACE_WORD}`].join("|")})(?![\p{L}])`,
    "iu",
  );
  return mentions.every((mention) => place.test(said.slice((mention.index ?? 0) + word.length)));
}

interface CardLike {
  employeeName: string | null;
  employeeRole?: string | null;
  templateName?: string;
  subject?: string;
  status: string;
  supportsInlineDraft?: boolean;
}

export function withPossessivePlaceNotPerson<T extends { content: string; formProposal?: CardLike | null }>(
  answer: T,
  managerTurns: readonly string[],
): T {
  if (!possessivePlaceNotPersonEnabled()) return answer;
  const card = answer.formProposal;
  if (!card?.employeeName || card.subject === "team") return answer;
  if (!onlyAsPossessivePlace(card.employeeName, managerTurns.join("\n"))) return answer;
  const form = card.templateName ?? "form";
  return {
    ...answer,
    content: `Who is this **${form}** for? "${card.employeeName}'s" is part of a place's name, not a person — tell me the employee's full name, and I'll fill in what you've already described.`,
    formProposal: { ...card, employeeName: null, employeeRole: null, status: "needs_employee", supportsInlineDraft: false },
  };
}
