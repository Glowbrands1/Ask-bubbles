import { isJobTitleAbbreviation } from "@/config/company/job-titles";
import { titleNotPartOfNameEnabled } from "@/lib/config/chat-quality-flags";

/**
 * TITLE_NOT_PART_OF_NAME_ENABLED (B-C3 part 2, QA, 11 Nov 2026; the sibling app's Pau scan sf-s36): "… exit for <first>
 * <last, one letter off> TM. Quit without notice." read "<first> <last> TM" as the name, so the roster readers found
 * nobody and never offered the roster's spelling. A store title written short ("TM", "AGM" …) after a typed name of two
 * words or more is not part of it. A name of fewer words, or the flag off, is returned as typed.
 */
/** This app's store titles written short, beside the company list's (`isJobTitleAbbreviation`, which has no "TM"). */
const STORE_TITLE_SHORT = new Set(["tm", "tmpt", "tmft", "tl", "sl", "sm", "asm", "agm", "gm"]);

function isTitleWord(word: string): boolean {
  const bare = word.replace(/[.,;:]+$/, "");
  return STORE_TITLE_SHORT.has(bare.toLowerCase()) || isJobTitleAbbreviation(bare);
}

export function withoutTitleWord(name: string): string {
  const words = name.trim().split(/\s+/);
  if (!titleNotPartOfNameEnabled() || words.length < 3) return name;
  if (!isTitleWord(words[words.length - 1]!)) return name;
  return words.slice(0, -1).join(" ");
}
