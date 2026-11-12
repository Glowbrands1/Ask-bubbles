import { COMPANY_JOB_TITLES } from "@/config/company/job-titles";
import { titleBeforeNameEnabled } from "@/lib/config/chat-quality-flags";

/**
 * ============================================================================
 * A JOB TITLE BEFORE THE NAME IS NOT PART OF IT (TITLE_BEFORE_NAME_ENABLED)
 * ============================================================================
 *
 * QA's Bubbles 17h live test (11 Nov 2026): as Admin, "Corrective action for Team Member <name>" gave no card. The
 * words after "for" count as a name only when the first could be one, and "Team" cannot. "Create a corrective action
 * for Team Member <name>" carded with no employee for the same reason. A store title said in full ("Team Member", "Shift
 * Lead") or short ("TM", "ASM") in front of the name says who the person is, not what they are called.
 *
 * Only when at least one word follows the title: "Corrective action for Team Members" names nobody.
 */

/** This app's store titles written short, beside the company list's (as `title-not-part-of-name.ts`). */
const STORE_TITLE_SHORT = new Set(["tm", "tmpt", "tmft", "tl", "sl", "sm", "asm", "agm", "gm"]);

function isWholeTitle(phrase: string): boolean {
  const bare = phrase.replace(/[.,;:]+$/, "").trim();
  if (bare === "") return false;
  if (STORE_TITLE_SHORT.has(bare.toLowerCase())) return true;
  return COMPANY_JOB_TITLES.some((entry) => bare.replace(new RegExp(entry.pattern.source, "gi"), "").trim() === "");
}

/** How many of the leading words are a job title (0 when none, or the flag off, or no word follows it). */
export function leadingTitleLength(words: readonly string[]): number {
  if (!titleBeforeNameEnabled()) return 0;
  for (let length = Math.min(4, words.length - 1); length >= 1; length -= 1) {
    if (isWholeTitle(words.slice(0, length).join(" "))) return length;
  }
  return 0;
}

/** "Team Member Wren Tallis" → "Wren Tallis"; anything else, or the flag off, as typed. */
export function withoutLeadingTitle(name: string): string {
  const words = name.trim().split(/\s+/);
  const skip = leadingTitleLength(words);
  return skip === 0 ? name : words.slice(skip).join(" ");
}

const NAME_WORD = /^\p{Lu}[\p{L}'’-]*$/u;

/**
 * The name a request gives after "for <title>", one to three capitalised words up to the end of the sentence, or null.
 * "Corrective action for TM <name>" reached the roster step with no name on the card.
 */
export function nameAfterTitle(message: string | undefined): string | null {
  if (!titleBeforeNameEnabled() || !message) return null;
  for (const match of message.matchAll(/\bfor\s+([^.,;:!?\n]+)/giu)) {
    const words = match[1]!.trim().split(/\s+/);
    const skip = leadingTitleLength(words);
    if (skip === 0) continue;
    const name = words.slice(skip);
    if (name.length >= 1 && name.length <= 3 && name.every((word) => NAME_WORD.test(word))) return name.join(" ");
  }
  return null;
}

/**
 * The card's create check (`proposal-currency.ts`) re-reads the employee from the conversation and refused the card:
 * "the conversation now says the form is for Team Member <name>, not <name>". The conversation's reading is the card's
 * name with a title in front of it, and the request said "for <title> <name>": that is the same person.
 */
export function sameNameAfterTitle(read: string, card: string, userTurns: readonly string[]): boolean {
  if (!titleBeforeNameEnabled()) return false;
  const reading = read.trim().toLowerCase().replace(/\s+/g, " ");
  const name = card.trim().toLowerCase().replace(/\s+/g, " ");
  if (!name || reading === name || !reading.endsWith(` ${name}`)) return false;
  return userTurns.some((turn) => (nameAfterTitle(turn) ?? "").toLowerCase() === name || withoutLeadingTitle(read).toLowerCase() === name);
}
