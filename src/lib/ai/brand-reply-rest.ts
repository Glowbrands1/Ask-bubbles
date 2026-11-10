import { BCS_BRAND } from "@/config/company/brand";
import { POLICY_MANUAL_BRAND_SCOPE } from "@/config/company/knowledge";
import { brandReplyGuardEnabled } from "@/lib/config/chat-quality-flags";

/**
 * ============================================================================
 * WHAT THE OWN-BRAND STEP STILL LEFT, OR DROPPED WITH ITS RULE (BRAND_REPLY_GUARD_ENABLED)
 * ============================================================================
 *
 * QA's October triage of #198 (10 Nov 2026), on main with production's flags (OWN_BRAND_ONLY and OWN_BRAND_PARENT on):
 *
 *   "… applies across all brands (Buff City Soap, Crunch, Sun Tan City, JB & Associates office) [p.14]."
 *        kept "(Buff City Soap, JB & Associates office)".
 *   "IF YOU CAN'T OPEN THE SALON/STORE ON TIME …"                 kept "SALON/STORE".
 *   "Submit availability changes … in MyGlow for Buff City Soap, MyGlow for <another brand>, or Woven for <another>"
 *        dropped whole, this company's system with it.
 *   "The Late Opening policy applies for any brand under JB & Associates: … reimburses $25.00 [p.15]."
 *        dropped whole, the rule with it.
 *
 * On, before the own-brand step (`own-brand-only.ts`) reads the reply:
 *
 *   A BRACKETED LIST OF BRANDS     that holds this one, and the JB & Associates office among them, goes.
 *   "FOR ANY BRAND UNDER <parent>" becomes "at <this brand>".
 *   "<X> FOR <this brand>, <Y> FOR <another>, or <Z> FOR <another>"   keeps "<X> for <this brand>".
 *   "SALON/STORE"                  becomes "store", in the case it was written in.
 *
 * So the own-brand step then sees a sentence that names only this company and keeps it. Brand names come from
 * config; none is written here. Pure; off, the text as given.
 */

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const OWN = escape(BCS_BRAND.brandName).replace(/\\? /g, String.raw`\s+`);
const OTHER = `(?:${POLICY_MANUAL_BRAND_SCOPE.otherBrands.join("|")})`;
const PARENT = String.raw`JB\s*(?:&|and)\s*Associates`;
const ITEM = `(?:${OWN}|${OTHER}|${PARENT}(?:\\s+office)?)`;
const SEP = String.raw`\s*(?:,\s*(?:and\s+|or\s+|&\s+)?|\s+and\s+|\s+or\s+|\s*&\s*|\s*\/\s*)`;

const BRACKETED = new RegExp(String.raw`\s*\(\s*(${ITEM}(?:${SEP}${ITEM})+)\s*\)`, "gi");
const ANY_BRAND_UNDER = new RegExp(String.raw`\b(?:for|at|in|across)\s+(?:any|every|all)(?:\s+(?:of\s+)?the)?\s+brands?\s+(?:under|of|within)\s+${PARENT}\b`, "gi");
const FOR_OWN_THEN_OTHERS = new RegExp(
  String.raw`(\b[\w'’-]+(?:\s+[\w'’-]+){0,3}\s+for\s+${OWN})((?:\s*,\s*(?:or\s+|and\s+)?|\s+or\s+|\s+and\s+)[\w'’-]+(?:\s+[\w'’-]+){0,3}\s+for\s+${OTHER})+`,
  "gi",
);
const SALON_STORE = /\bsalon\s*\/\s*store\b/gi;

function storeInCase(written: string): string {
  if (written === written.toUpperCase()) return "STORE";
  return /^S/.test(written) ? "Store" : "store";
}

/** The reply with the leftovers above rewritten. Pure. */
export function brandReplyRest(text: string): string {
  return text
    .replace(BRACKETED, (whole, list: string) => (new RegExp(`\\b${OWN}\\b`, "i").test(list) ? "" : whole))
    .replace(ANY_BRAND_UNDER, `at ${BCS_BRAND.brandName}`)
    .replace(FOR_OWN_THEN_OTHERS, (_whole, kept: string) => kept)
    .replace(SALON_STORE, storeInCase);
}

/** BRAND_REPLY_GUARD_ENABLED: `brandReplyRest`, or the text as given when off. */
export function withBrandReplyRest(text: string): string {
  return brandReplyGuardEnabled() ? brandReplyRest(text) : text;
}
