import { storeChoicesNamedEnabled } from "@/lib/config/chat-quality-flags";
import { locationById } from "@/lib/locations";
import type { ChatFormProposal } from "@/types";

/**
 * ============================================================================
 * THE STORE QUESTION NAMES THE STORES (Problem 20, Bubbles production, 10 Nov 2026; STORE_CHOICES_NAMED_ENABLED)
 * ============================================================================
 *
 * A manager covering two stores asked "Can you make a coaching form for my employees that had a lower than $50 average
 * transaction for laundry sale this weekend", named the person ("This is for <name>"), and was asked "I won't choose
 * which store this belongs to. Which store is this about?". The person works at both of the manager's stores in Woven,
 * so the card rightly does not pick one. The manager sent the request again and got the same question back under
 * "I still need to know which location this is about…", and no card was made: the reply never said which stores it
 * meant. On: when the card is waiting for a store, the question names the choices — the person's own stores in Woven
 * that are on the manager's assignment, or else the manager's stores — so a request sent again is answered with what is
 * missing, in words. The card itself (and its store picker) is unchanged. Off, as before.
 */
export const STORE_QUESTION = "I won't choose which store this belongs to. Which store is this about?";

/** The most stores named in words; more than this and the picker below is the clearer way to choose. */
const MOST_NAMED = 6;

interface Answer {
  content: string;
  formProposal?: ChatFormProposal | null;
}

function names(ids: readonly string[]): string[] {
  return ids.map((id) => locationById(id)?.name).filter((name): name is string => Boolean(name));
}

function listed(stores: readonly string[], joiner: "and" | "or" = "and"): string {
  const bold = stores.map((store) => `**${store}**`);
  return bold.length <= 2 ? bold.join(` ${joiner} `) : `${bold.slice(0, -1).join(", ")} ${joiner} ${bold[bold.length - 1]}`;
}

/** The store question with the choices named, or null when there are none to name. */
export function namedStoreQuestion(card: ChatFormProposal): string | null {
  const authorized = card.authorizedLocationIds ?? [];
  const verified = card.employeeVerification?.status === "verified" ? (card.employeeVerification.storeIds ?? []) : [];
  const theirs = verified.filter((id) => authorized.includes(id));
  if (card.employeeName && theirs.length >= 2) {
    const stores = names(theirs);
    if (stores.length === theirs.length) {
      const all = stores.length > 2 ? "all of them are" : "both are";
      return `**${card.employeeName}** works at ${listed(stores)} in Woven, and ${all} on your assignment, so I won't pick one. Which store is this about?`;
    }
  }
  if (authorized.length >= 2 && authorized.length <= MOST_NAMED) {
    const stores = names(authorized);
    if (stores.length === authorized.length) return `I won't choose which store this belongs to. Is it ${listed(stores, "or")}?`;
  }
  return null;
}

/** STORE_CHOICES_NAMED_ENABLED: a card waiting for its store asks with the choices named. Off, the answer as given. */
export function withStoreChoicesNamed<T extends Answer>(answer: T): T {
  const card = answer.formProposal;
  if (!storeChoicesNamedEnabled() || !card || card.locationResolution !== "needs_selection" || card.namedLocationOutOfScope) return answer;
  if (!answer.content.includes(STORE_QUESTION)) return answer;
  const named = namedStoreQuestion(card);
  return named ? { ...answer, content: answer.content.replace(STORE_QUESTION, named) } : answer;
}
