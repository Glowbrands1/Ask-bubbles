import type { BrandConfig } from "@/types";

/**
 * ============================================================================
 * BUFF CITY SOAP — BRAND CONFIGURATION (PROVISIONAL)
 * ============================================================================
 *
 * Everything brand-specific that COPY needs: names, the wordmark, the
 * user-facing noun for one store, and the knowledge scope id.
 *
 * COLOURS ARE NOT HERE. They live in one place, the `--bcs-*` raw palette at
 * the top of `src/app/globals.css`, which every semantic token points at.
 *
 * PROVISIONAL. There is no official Ask Bubbles design system yet. The
 * palette and wording follow Buff City Soap's public website (deep burgundy,
 * Buff orange, aqua, warm cream, charcoal; "Makery"; plant-based, handmade)
 * and are expected to be replaced when brand standards are supplied.
 *
 * `vocabulary.locationNoun` is "location" on purpose. Buff's public site calls
 * its stores "Makeries", and that may well be the right word for this app —
 * but the underlying location model stays generic until Buff's Woven
 * structure confirms what a location is. Changing the word here changes it in
 * copy everywhere; nothing else needs to move.
 */
export const BCS_BRAND: BrandConfig = {
  id: "bcs",
  brandName: "Buff City Soap",
  productName: "Ask Bubbles",
  assistantName: "Bubbles",
  operatorName: "Buff City Soap",
  wordmark: { lead: "ASK", trail: "BUBBLES" },
  tagline: "Answers, forms and know-how for your team",
  description:
    "Ask Bubbles is the Buff City Soap team assistant: grounded answers from company knowledge, guided forms, reports and history in one place.",
  knowledgeScopeId: "bcs-core",
  vocabulary: {
    locationNoun: "location",
    locationNounPlural: "locations",
  },
  // Empty = use the `--bcs-*` palette declared in globals.css.
  paletteTokens: {},
};
