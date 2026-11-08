import { politeAboutStaysCardEnabled } from "@/lib/config/chat-quality-flags";

/**
 * ============================================================================
 * "MAKE IT ABOUT <X>": <X> IS THE ACCOUNT, THE INSTRUCTION IS NOT
 * ============================================================================
 *
 * PROPOSAL_MAKE_IT_ABOUT_ENABLED (QA's flip-9 tester, item 9, found in the sibling app, 8 Nov 2026). On a proposal card, "I need you to
 * make it about showing up late and please list the policy make the date for 10/14/26." was read as more of what
 * happened: the card's Observation and the drafting model's notes held the instruction word for word. A manager who
 * says what the form is to be about has given its account: <X> ("showing up late"), and the account said before it
 * is set aside. The rest of the sentence ("please list the policy", "make the date for …") is an ask, read by the
 * date and policy readers; it is not account.
 *
 * This app's Coaching card shows no Observation line, so only the draft's notes read it here
 * (`forms/instances/[id]/draft/route.ts`); `withObservationMadeAbout` is kept for the card readback the sibling app has.
 *
 * Pure: the caller decides when the flag applies.
 */

/** "make it about", "make this about", "make the form be about". */
const MAKE_IT_ABOUT =
  /\bmake\s+(?:it|this|that|the\s+(?:form|document|coaching(?:\s+(?:form|document))?|ca|c\/a|corrective\s+action(?:\s+form)?|write-?up))\s+(?:be\s+)?about\s+/i;

/** Where <X> ends: a sentence end, or the next ask joined on ("and please list …", "make the date …"). */
const ENDS =
  /[.;!?\n]|,?\s+(?:and\s+)?(?:please|pls)\b|,?\s+and\s+(?:also\s+)?(?:list|cite|add|make|change|set|put|use|include|reference|remove|date|switch|update)\b|,?\s+(?:make|set|change|put|update)\s+(?:the\s+)?(?:date|policy|title|store|location)\b|,?\s+(?:list|cite|reference)\s+the\s+polic/i;

/** <X> from one sentence or turn, or null when it does not say what the form is about. */
/*
 * POLITE_ABOUT_STAYS_CARD_ENABLED (the Bubbles live tester, QA, 8 Nov 2026): "can you make it for missing out monthly
 * meeting" says what the form is for, as "make it about …" does. Only a topic: <X> opens with an -ing word or a
 * negation ("missing …", "not clocking in …", "no call no show …"), never a name ("make it for <name>" changes who).
 */
const MAKE_IT_FOR =
  /\bmake\s+(?:it|this|that|the\s+(?:form|document|coaching(?:\s+(?:form|document))?|ca|c\/a|corrective\s+action(?:\s+form)?|write-?up))\s+(?:be\s+)?for\s+(?=(?:[a-z]+ing|not|no|never)\b)/i;

export function madeAbout(text: string): string | null {
  const found = MAKE_IT_ABOUT.exec(text ?? "") ?? (politeAboutStaysCardEnabled() ? MAKE_IT_FOR.exec(text ?? "") : null);
  if (!found) return null;
  const rest = text.slice(found.index + found[0].length);
  const end = ENDS.exec(rest);
  const about = (end ? rest.slice(0, end.index) : rest)
    .replace(/\s+/g, " ")
    .replace(/\s+(?:and|but|then|also)\s*$/i, "")
    .replace(/^["“']|["”']$/g, "")
    .trim();
  return about.length >= 3 ? about : null;
}

function sentencesOf(turn: string): string[] {
  return turn
    .split(/\n+|(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** <X> as a sentence: "showing up late" → "Showing up late." */
function asSentence(about: string): string {
  const text = about.charAt(0).toUpperCase() + about.slice(1);
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/** The last "make it about <X>" in these turns, as a sentence ("Showing up late."), or null. */
export function latestMadeAbout(turns: readonly string[]): string | null {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const sentences = sentencesOf(turns[index] ?? "");
    for (let at = sentences.length - 1; at >= 0; at -= 1) {
      const about = madeAbout(sentences[at]!);
      if (about) return asSentence(about);
    }
  }
  return null;
}

const OBSERVATION_LINE = "**Observation of Offense:**";

/**
 * The card's Observation line is <X> when the turns say what the form is about: the line the readers wrote is
 * replaced (or added) with it. The manager said it, so no account filter stands between it and the card.
 */
export function withObservationMadeAbout(content: string, turns: readonly string[]): string {
  const about = latestMadeAbout(turns);
  if (!about) return content;
  const kept = content
    .split("\n")
    .filter((line) => !line.trim().startsWith(OBSERVATION_LINE))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return `${kept}\n\n${OBSERVATION_LINE} ${about}`.trim();
}

/**
 * The account turns with the last "make it about <X>" applied: the turns before it are set aside, its sentence is
 * <X>, and the sentences and turns after it stay. Unchanged when no turn says it.
 */
export function turnsMadeAbout(turns: readonly string[]): readonly string[] {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const sentences = sentencesOf(turns[index] ?? "");
    for (let at = sentences.length - 1; at >= 0; at -= 1) {
      const about = madeAbout(sentences[at]!);
      if (!about) continue;
      const turn = [asSentence(about), ...sentences.slice(at + 1)].join(" ");
      return [turn, ...turns.slice(index + 1)];
    }
  }
  return turns;
}

/** The draft's notes (the manager's turns, joined) with the last "make it about <X>" applied. */
export function notesMadeAbout(notes: string): string {
  const turns = (notes ?? "").split(/\n{2,}/);
  const made = turnsMadeAbout(turns);
  return made === turns ? notes : made.join("\n\n");
}
