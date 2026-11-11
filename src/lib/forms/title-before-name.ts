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
