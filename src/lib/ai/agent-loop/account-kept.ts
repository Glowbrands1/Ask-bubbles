import type { ChatMessage } from "@/types";

/**
 * ============================================================================
 * THE ACCOUNT ON SCREEN STAYS UNLESS THE MANAGER CHANGES IT (QA's Bubbles live re-run, 22 Nov 2026, A7 T5; QA's option 2)
 * ============================================================================
 *
 * A7, the tester's turns: T1 "do verbal for team member <P> at empire, sd. … on 10-22-26 <P> was not scheduled to work and
 * came into the store …", then T2–T4 (a prior-action date, the policy), T5 "store location is empire, sd. create
 * corrective action". Live, T5's card came back with the Observation rewritten: "<P> is a team member. On 10/22/26 …"
 * (the request's role line, "team member", put into the account), and in other runs with punctuation changed ("On
 * 10/22/26, <P> …"). Nothing in T5 asked for a new account.
 *
 * So, on a later turn's rebuild of the card on screen, the model's account may differ from the account shown only where
 * the manager's latest message brings the difference: a word the new account adds, or a word it drops, is one the
 * manager wrote in that message ("it was 30 min, not 45"; "she also yelled at a guest"; "take out the part about the
 * puppy"). Any other difference (a reworded sentence, a role line, a date reformatted, punctuation) is the model's, and
 * the card keeps the account as shown. Words are compared as words, never a phrase list.
 */

/** The account of the last card the chat showed, its form and person as the card held them (the reply's Observation line when the card's data is not in the history). */
export function shownAccount(history: readonly ChatMessage[]): { issue: string; employeeName: string | null; templateKey: string | null } | null {
  const lastCard = [...history].reverse().find((message) => message.role === "assistant" && (message.formProposal || /\*\*Observation of Offense:\*\*/.test(String(message.content))));
  if (!lastCard) return null;
  const issue = lastCard.formProposal?.issue ?? /\*\*Observation of Offense:\*\*\s*(.+)/.exec(String(lastCard.content ?? ""))?.[1]?.trim() ?? "";
  return { issue, employeeName: lastCard.formProposal?.employeeName ?? null, templateKey: lastCard.formProposal?.templateKey ?? null };
}

/** Each word of a text, lower-cased: letters of three or more, or anything holding a digit ("30", "10/22/26" → "10", "22", "26"). */
function wordsOf(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((word) => word.length >= 3 || /\d/.test(word)));
}

/**
 * Whether `next` changes the account `shown` without the manager's latest message asking for it: the texts differ, and
 * no word `next` adds or drops is in `latest`. Spacing alone is no change.
 */
export function unaskedAccountChange(shown: string, next: string, latest: string): boolean {
  const flat = (text: string) => text.replace(/\s+/g, " ").trim();
  if (!flat(shown) || !flat(next) || flat(shown) === flat(next)) return false;
  const before = wordsOf(shown);
  const after = wordsOf(next);
  const manager = wordsOf(latest);
  const moved = [...[...after].filter((word) => !before.has(word)), ...[...before].filter((word) => !after.has(word))];
  return !moved.some((word) => manager.has(word));
}
