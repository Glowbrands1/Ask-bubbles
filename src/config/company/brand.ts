import type { BrandConfig } from "@/types";

/**
 * ============================================================================
 * BUFF CITY SOAP — BRAND CONFIGURATION
 * ============================================================================
 *
 * Everything brand-specific that COPY and the LOGO need: names, the Ask Bubbles
 * wordmark, the official Buff City Soap logo files, the user-facing noun for
 * one store, and the knowledge scope id.
 *
 * COLOURS ARE NOT HERE. They live in one place, the `--bcs-*` raw palette at
 * the top of `src/app/globals.css` — the Buff City Soap 2023 Brand Guidelines
 * values — which every semantic token points at.
 *
 * THE LOGO is the official stacked Buff City Soap artwork, one file per
 * approved colour (Tokyo Green, White, Charcoal), in `public/brand/` — see the
 * README there for provenance. No Ask Bubbles logo exists; the product is
 * shown by its wordmark and bubble mark (`components/brand-mark.tsx`).
 *
 * `vocabulary.locationNoun` is "location" on purpose. The brand guidelines'
 * vocabulary prefers "Soap Makery" for a store, and that may well be the right
 * word for this app — but the underlying location model stays generic until
 * Buff's Woven structure confirms what a location is. Changing the word here
 * changes it in copy everywhere; nothing else needs to move.
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
  logo: {
    stacked: {
      tokyoGreen: "/brand/bcs-logo-stacked-tokyo-green.png",
      white: "/brand/bcs-logo-stacked-white.png",
      charcoal: "/brand/bcs-logo-stacked-charcoal.png",
    },
    width: 720,
    height: 456,
  },
  knowledgeScopeId: "bcs-core",
  vocabulary: {
    locationNoun: "location",
    locationNounPlural: "locations",
  },
  // Empty = use the `--bcs-*` palette declared in globals.css.
  paletteTokens: {},
};
