import { EXCERPT_HIDDEN_BRANDS } from "@/config/company/knowledge";
import { excerptBrandHeadingDropEnabled } from "@/lib/config/chat-quality-flags";
import type { SourceCitation } from "@/types";

/**
 * ============================================================================
 * NO EMPTY SOURCE CARD, AND NONE LABELLED WITH THE SIBLING COMPANY
 * ============================================================================
 *
 * The sibling app's EXCERPT_EMPTY_CARD_DROP mechanism (QA via Coding-5, 11 Nov 2026), gated here on this app's
 * EXCERPT_BRAND_HEADING_DROP (`excerptBrandHeadingDropEnabled`), its equivalent: no source card labelled with the
 * sibling brand or with an empty excerpt (`excerpt-brand-filter.ts`). Not wired: only the agent loop, when it is
 * ported, calls it. The hidden brands are this app's own list (`EXCERPT_HIDDEN_BRANDS`, the one
 * `excerpt-brand-filter.ts` reads).
 *
 * With the brand filter on, a JBA Policy Manual block written for the sibling company alone filters to nothing, and
 * its card came out as "Page 43 — <the sibling company>" with an empty excerpt. On: a card whose excerpt is empty is
 * not shown, and a card whose locator names a hidden brand keeps only its page ("Page 43"). The cards are numbered by
 * their place in this list and the prose's [S#] markers are stripped before display, so nothing else needs
 * renumbering. Off: the list as built.
 */
const HIDDEN = new RegExp(String.raw`\b(?:${EXCERPT_HIDDEN_BRANDS.join("|")})\b`, "i");

function withoutHiddenBrandLabel(card: SourceCitation): SourceCitation {
  const locator = card.locator;
  if (!HIDDEN.test(locator)) return card;
  const page = /^(Page\s+\d+)/i.exec(locator)?.[1] ?? null;
  return { ...card, locator: page ?? "" };
}

/** The cards to show: none with an empty excerpt, none labelled with a hidden brand. */
export function shownCitations(cards: SourceCitation[]): SourceCitation[] {
  if (!excerptBrandHeadingDropEnabled()) return cards;
  return cards.filter((card) => (card.excerpt ?? "").trim() !== "").map(withoutHiddenBrandLabel);
}
