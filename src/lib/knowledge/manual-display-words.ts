import { MANUAL_DISPLAY_WORDS, MULTI_BRAND_MANUAL_TITLES } from "@/config/company/knowledge";

import { isMultiBrandManual } from "./brand-sections";

/**
 * ============================================================================
 * THE POLICY MANUAL'S TEXT, IN THIS COMPANY'S WORDS, WHERE A MANAGER SEES IT
 * ============================================================================
 *
 * QA's live re-test (21 Nov 2026, item 7 / A5): the quoted Late Opening policy showed "salon" in this app. The
 * company's `MANUAL_DISPLAY_WORDS` ("salon" → "store") are applied to manual text on its way to the screen or a form:
 * whole words only, case kept ("salon" → "store", "Salon" → "Store", "SALON" → "STORE"). Never to the stored chunks,
 * a retrieval query, a manual title or a heading used to find a section: those are the manual's own and retrieval
 * depends on them. With no words configured, text comes back unchanged.
 */

const WORDS = Object.entries(MANUAL_DISPLAY_WORDS).filter(([from, to]) => from.trim() !== "" && to.trim() !== "");
const PATTERN = WORDS.length > 0 ? new RegExp(`\\b(?:${WORDS.map(([from]) => from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).sort((a, b) => b.length - a.length).join("|")})\\b`, "gi") : null;
const REPLACEMENT = new Map(WORDS.map(([from, to]) => [from.toLowerCase(), to]));

function withCaseOf(word: string, replacement: string): string {
  if (word.length > 1 && word === word.toUpperCase()) return replacement.toUpperCase();
  if (word.charAt(0) === word.charAt(0).toUpperCase()) return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  return replacement;
}

/** Manual text as this company shows it. */
export function manualWordsForDisplay(text: string): string {
  if (!PATTERN || text === "") return text;
  return text.replace(PATTERN, (word) => withCaseOf(word, REPLACEMENT.get(word.toLowerCase()) ?? word));
}

/** The same, only for the policy manual (by its title); any other document's text comes back unchanged. */
export function documentWordsForDisplay(text: string, documentTitle: string): string {
  return isMultiBrandManual(documentTitle, MULTI_BRAND_MANUAL_TITLES) ? manualWordsForDisplay(text) : text;
}

/**
 * A saved policy field's value (the manual's wording, then "Source: <title> — <heading>, p. N"), in this company's
 * words: the wording lines only; each Source line keeps the manual's own title and heading. Null stays null.
 */
export function policyValueForDisplay(value: string | null, documentTitle: string): string | null {
  if (value === null || !isMultiBrandManual(documentTitle, MULTI_BRAND_MANUAL_TITLES)) return value;
  return value
    .split("\n")
    .map((line) => (/^\s*Source:/.test(line) ? line : manualWordsForDisplay(line)))
    .join("\n");
}
