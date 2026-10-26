import { BCS_BRAND } from "@/config/company/brand";
import { POLICY_MANUAL_BRAND_SCOPE } from "@/config/company/knowledge";
import { brandReplyGuardEnabled } from "@/lib/config/chat-quality-flags";

/**
 * ============================================================================
 * A REPLY SPEAKS FOR THIS COMPANY ONLY (BRAND_REPLY_GUARD_ENABLED)
 * ============================================================================
 *
 * QA, 25 Oct 2026 (testers G21, U1, U6; production): retrieval already leaves
 * the other brands' sections out (`lib/knowledge/brand-sections.ts`), but the
 * model's own prose still carried them from the manual's company-wide text:
 * an attendance answer that "applies across all brands (…)" listing every
 * brand and the operating group's office, each brand's own scheduling system
 * in one list, "for any brand under <the operating group>", service animals
 * "in the tanning room", the sibling company's role titles, and "open the
 * salon/store".
 *
 * At answer time, sentence by sentence:
 *
 *   a parenthetical or a list item that names another brand is taken out,
 *   and what is left is kept when it no longer names one;
 *   a sentence that is about another brand and nothing else is taken out;
 *   the location word is this company's ("store");
 *   a quoted phrase and a manual title ("… Policy", "… Manual") are never
 *   rewritten, and the manual's own name is kept;
 *   a reply is never emptied: if nothing of it is left, a short line says so
 *   in this company's name.
 *
 * The other brands are this company's own configuration
 * (`POLICY_MANUAL_BRAND_SCOPE.otherBrands`), plus the operating group's name
 * and the tanning-room words. The manual's title ("JBA Policy Manual") and its
 * page citations are never touched. Off, the reply as written.
 */

const OTHER_BRAND = new RegExp(
  String.raw`\b(?:${[
    ...POLICY_MANUAL_BRAND_SCOPE.otherBrands,
    // The operating group, except as the manual's own name ("JB & Associates Policy Manual").
    String.raw`JB\s*&\s*Associates(?:\s+office)?(?!\s+(?:Policy\s+)?Manual)`,
    String.raw`J\.?B\.?\s+and\s+Associates(?!\s+(?:Policy\s+)?Manual)`,
    String.raw`tanning(?:\s+(?:rooms?|beds?|booths?|sessions?|clients?|consultants?|salons?|equipment))?`,
    // The sibling company's role titles.
    String.raw`(?:Assistant\s+)?Salon\s+Directors?`,
    String.raw`ASDs?`,
    String.raw`VersaSpa`,
    String.raw`spray\s+tan\w*`,
  ].join("|")})\b`,
  "i",
);

/** "for any brand under JB & Associates" says "here". */
const ANY_BRAND = /\b(?:for|at|across)\s+(?:any|every|all)\s+(?:brands?|locations?)\s+(?:under|of|in)\s+(?:the\s+)?JB\s*&\s*Associates(?:\s+family)?\b/gi;

const LOCATION = BCS_BRAND.vocabulary.locationNoun;
const LOCATIONS = BCS_BRAND.vocabulary.locationNounPlural;

/** The sibling company's title inside a slash list: "AMM/ASD/AGM", "Assistant Salon Directors/Assistant Makery Managers". */
const SIBLING_TITLE = String.raw`(?:(?:Assistant\s+)?Salon\s+Directors?|ASDs?)`;
function withoutSlashedTitles(sentence: string): string {
  return sentence
    .replace(new RegExp(String.raw`\s*/\s*${SIBLING_TITLE}\b`, "g"), "")
    .replace(new RegExp(String.raw`\b${SIBLING_TITLE}\s*/\s*`, "g"), "");
}

/** Parentheticals that name another brand. */
function withoutBrandParentheticals(sentence: string): string {
  return sentence.replace(/\s*\(([^()]*)\)/g, (whole, inner: string) => (OTHER_BRAND.test(inner) ? "" : whole));
}

/** List items that name another brand: "MyGlow for Buff City Soap, MyGlow for <another brand>, or Woven for <another>". */
function withoutBrandListItems(sentence: string): string {
  const parts = sentence.split(/(,\s*(?:(?:and|or)\s+)?|\s+(?:and|or)\s+)/);
  if (parts.length < 3) return sentence;
  const items: { sep: string; text: string }[] = [];
  for (let index = 0; index < parts.length; index += 2) items.push({ sep: index === 0 ? "" : parts[index - 1]!, text: parts[index]! });
  const kept = items.filter((item) => !OTHER_BRAND.test(item.text));
  if (kept.length === items.length || kept.length === 0) return sentence;
  const last = items[items.length - 1]!;
  // A dropped last item keeps the citations and the stop it carried: "… or Woven for Crunch [p.37]."
  const tail = kept.at(-1) === last ? "" : (/((?:\s*\[(?:p|S)\.?\s*\d+\])*)\s*([.!?:;]?)\s*$/.exec(last.text) ?? ["", "", ""]).slice(1).join("");
  return kept
    .map((item, index) => (index === 0 ? item.text : `${item.sep}${item.text}`))
    .join("")
    .concat(tail);
}

/**
 * Quoted text and manual titles are kept as written: `"Salon Opening Policy"`,
 * "Salon Director Manual". Each is swapped for a placeholder while the
 * location word is changed, then put back.
 */
const KEPT_AS_WRITTEN =
  /"[^"\n]*"|“[^”\n]*”|\b(?:[A-Z][\w&'/-]*\s+){0,5}(?:Policy|Policies|Manual|Handbook|Guide)\b(?:\s+\[p\.\d+\])?/g;

/** This company's word for a location. */
function withLocationWord(text: string): string {
  const kept: string[] = [];
  const masked = text.replace(KEPT_AS_WRITTEN, (match) => `\u0000${kept.push(match) - 1}\u0000`);
  const swapped = masked
    .replace(/\bsalons?\s*\/\s*stores?\b|\bstores?\s*\/\s*salons?\b/gi, (match) => (/s\b/i.test(match.split("/")[0]!.trim()) ? LOCATIONS : LOCATION))
    .replace(/\b(S|s)alons\b/g, (_m, s: string) => (s === "S" ? cap(LOCATIONS) : LOCATIONS))
    .replace(/\b(S|s)alon\b/g, (_m, s: string) => (s === "S" ? cap(LOCATION) : LOCATION));
  return swapped.replace(/\u0000(\d+)\u0000/g, (_m, index: string) => kept[Number(index)]!);
}

function cap(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** One sentence, with another brand taken out of it, or null when nothing of it is left. */
function guardSentence(sentence: string): string | null {
  if (!OTHER_BRAND.test(sentence) && !ANY_BRAND.test(sentence)) return sentence;
  ANY_BRAND.lastIndex = 0;
  let text = sentence.replace(ANY_BRAND, `at ${BCS_BRAND.brandName}`);
  if (!OTHER_BRAND.test(text)) return text;
  text = withoutSlashedTitles(text);
  if (!OTHER_BRAND.test(text)) return text;
  text = withoutBrandParentheticals(text);
  if (!OTHER_BRAND.test(text)) return text;
  text = withoutBrandListItems(text);
  return OTHER_BRAND.test(text) ? null : text;
}

/** Said when nothing of a reply is left: this company's name only. */
export const NOTHING_LEFT = `That one isn't part of the ${BCS_BRAND.brandName} policy as far as I can see. Ask me about ${BCS_BRAND.brandName} and I'll check the manual.`;

/** The reply in this company's words, never empty. Off, as written. */
export function withoutOtherBrands(content: string): string {
  if (!brandReplyGuardEnabled() || !content) return content;
  const lines = content.split("\n").map((line) => {
    const pieces = line.split(/(?<=[.!?])(\s+)/);
    const out: string[] = [];
    let dropped = false;
    for (let index = 0; index < pieces.length; index += 2) {
      const sentence = pieces[index]!;
      const space = pieces[index + 1] ?? "";
      const kept = guardSentence(sentence);
      if (kept === null || kept.trim() === "" || /^\s*[-*•]\s*$/.test(kept) || /^\s*\d+\.\s*$/.test(kept)) {
        dropped = true;
        continue;
      }
      out.push(kept, space);
    }
    const joined = out.join("").trimEnd();
    return dropped && joined.trim() === "" ? null : joined;
  });
  const guarded = withLocationWord(lines.filter((line): line is string => line !== null).join("\n")).replace(/\n{3,}/g, "\n\n");
  // What is left must still say something: not only a citation, a label or punctuation.
  const words = guarded.replace(/\[(?:p|S)\.?\s*\d+\]/g, " ").replace(/[^A-Za-z]+/g, " ").trim().split(/\s+/).filter(Boolean);
  return words.length < 3 ? NOTHING_LEFT : guarded;
}
