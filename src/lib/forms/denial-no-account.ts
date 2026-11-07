import { denialNoAccountEnabled } from "@/lib/config/chat-quality-flags";

/*
 * DENIAL_NO_ACCOUNT_ENABLED (coding 4's finding via QA, 7 Nov 2026; the sibling app's BARE_NOT_DENIAL /
 * BARE_NOT_AFTER_REQUEST mechanism): "create a corrective action for <name>, not late" made a card with
 * "**Issue:** not late" and no "what happened" ask. A denial is no account. With the flag on, a text that,
 * without its request head and the employee's name, only denies a fault (every part of it: "not late",
 * "she was never late", "no problems") gives no Issue, and the card asks what happened. "not late but left
 * the register open" says what happened. The fault words are `draft-never-blank.ts` EXONERATING's (that file
 * imports `incident-issue.ts`, so they are not imported from there). Off, false.
 */
const NEGATION = String.raw`(?:never|not|did\s+not|didn['’]?t|was\s+not|wasn['’]?t|has\s+not|hasn['’]?t|no)`;
const FAULT = String.raw`(?:late|tardy|problems?|issues?|wrong|trouble|complaints?|mistakes?|absent|concerns?)`;
/** A part that is only a denied fault: a negation, at most four words, the fault, and nothing after it. */
const ONLY_A_DENIAL = new RegExp(String.raw`^(?:(?:she|he|they)\s+)?(?:(?:is|was|were|has|had)\s+)?${NEGATION}\b(?:\s+[\w']+){0,4}?\s+${FAULT}\b[\s.!]*$`, "i");
const REQUEST_HEAD = /^.*?\b(?:corrective\s+action(?:\s+form)?|ca|c\/a|write[- ]?up|warning|dpoa)\s+(?:for|to)\s+/i;

export function onlyDeniesAFault(text: string, employeeName: string | null): boolean {
  if (!denialNoAccountEnabled()) return false;
  const own = new Set((employeeName ?? "").toLowerCase().split(/\s+/).filter(Boolean));
  const words = text.trim().replace(REQUEST_HEAD, "").split(/\s+/).filter(Boolean);
  while (words.length > 0 && own.has(words[0]!.toLowerCase().replace(/[^\p{L}'’-]/gu, ""))) words.shift();
  const parts = words
    .join(" ")
    .split(/\s*[,;\n]\s*|\s+(?:but|and)\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 && parts.every((part) => ONLY_A_DENIAL.test(part));
}
