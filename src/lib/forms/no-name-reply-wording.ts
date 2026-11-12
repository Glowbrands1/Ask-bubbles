import { noNameReplyWordingEnabled } from "@/lib/config/chat-quality-flags";

/**
 * ============================================================================
 * A REPLY WITH NO NAME ON THE CARD READS CLEANLY (NO_NAME_REPLY_WORDING_ENABLED)
 * ============================================================================
 *
 * Ask Sunny's round 22 live test (QA, 11 Nov 2026; port from Ask Sunny, same flag in both apps): "create a CA for ima employee" rightly made no card, but the reply said
 * "… Corrective Action Form for the the employee." and "… policy with the the employee.", and "You can create it now"
 * over a card with no Create button. The name "ima employee" was taken off the reply as "the employee", and its word
 * "employee" was then taken off again inside the words just put in (`roster-only-names.ts`, withoutUnseatedName). With
 * the flag on, what was put in is held aside until every word of the name is done, and a card with no employee says the
 * draft can be created once the name is given. Off, as before.
 */

const HELD = "\u0001";

/** What the name is replaced with: held aside with the flag on, so the name's own words never match inside it. */
export function standInForName(): string {
  return noNameReplyWordingEnabled() ? HELD : "the employee";
}

/** The held stand-ins, as the reply says them. */
export function withStandInsSaid(line: string): string {
  return line.includes(HELD) ? line.split(HELD).join("the employee") : line;
}

const CREATE_NOW = /\bYou can create it now and fill it in yourself\b/g;

/** With no employee on the card there is no Create button: the note says it can be created once the name is given. */
export function withoutCreateNowWhenNoEmployee(content: string, employeeName: string | null | undefined): string {
  if (!noNameReplyWordingEnabled() || employeeName?.trim()) return content;
  return content.replace(CREATE_NOW, "Once you tell me who it's for, you can create it and fill it in yourself");
}

/*
 * The same flag, extended (QA, Bubbles 16c live, main ffa571ea, 11 Nov 2026): "create a CA for ima employee" made no card,
 * but its reply still read "ima" as a name — "Action plan: … with Ima." and "I couldn't verify a store for **ima** from
 * Woven" — and the empty-employee card still offered "Create draft". With no employee on the card: the plan says "the
 * employee", the store note about a person who is not there goes, and the card does not offer the inline draft
 * (`supportsInlineDraft`, which shows the Create button).
 */
const PLAN_WITH_NAME = /^(\*\*Action [Pp]lan:\*\*[^\n]*?\bwith )(?!the\b)([A-Z][\p{L}'’-]*)(?=\.)/gmu;
const ASKS_WHO_FOR = /Who is this (?:\*\*[^*\n]+\*\* |form )?for\?/i;
const STORE_NOT_VERIFIED = /^I couldn['’]t verify an? (?:store|salon) for \*\*[^*\n]+\*\* from Woven[^\n]*\n?/gm;

interface NoEmployeeCard {
  readonly templateKey?: string | null;
  readonly employeeName?: string | null;
  readonly supportsInlineDraft?: boolean;
}

/** With no employee on the card: no name-derived words in the plan or the store note, and no Create button. Off, as given. */
export function withNoEmployeeCard<T extends { content: string; formProposal?: NoEmployeeCard | null }>(response: T): T {
  const card = response.formProposal;
  if (!noNameReplyWordingEnabled() || !card?.templateKey || card.employeeName?.trim()) return response;
  // Only a card still waiting for its person (the reply asks who it is for); a team-wide form has no employee by design.
  if (!ASKS_WHO_FOR.test(response.content)) return response;
  const content = response.content
    .replace(PLAN_WITH_NAME, (_all, lead: string) => `${lead}the employee`)
    .replace(STORE_NOT_VERIFIED, "")
    .replace(/\n{3,}/g, "\n\n");
  const offersDraft = card.supportsInlineDraft === true;
  if (content === response.content && !offersDraft) return response;
  return { ...response, content, formProposal: offersDraft ? { ...card, supportsInlineDraft: false } : card };
}
