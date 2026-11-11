# Bubbles-only: EXCERPT_BRAND_HEADING_DROP_ENABLED (a source card that is only the sibling brand's heading is left out)

QA's round 17c live test (11 Nov 2026), EXCERPT_BRAND_FILTER on: "what are the holidays?" showed a source card labelled
"Page 42 — <the sibling brand>" whose excerpt was that heading alone. Here the full-manual source cards are built by
`ai/full-manual-context.ts` `excerptForHit`, which falls back to the heading when the filtered passage is empty. With
the flag, `knowledge/excerpt-brand-filter.ts` `keepsSourceCard` leaves such a card out and the rest are renumbered.

Not needed in Ask Sunny (checked on its main, 11 Nov 2026): its full-manual path builds each citation with the heading
itself as the excerpt and already drops a heading that names an excluded brand (`namesExcludedBrand` in its
`full-manual-context.ts`), so this card is never built there. Its retrieval cards (`rowToCitation`) are a separate
question, raised to QA with a test.
