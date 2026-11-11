import { afterEach, describe, expect, it, vi } from "vitest";

import manual151 from "@/test/fixtures/jba-manual-production-151.json";
import { citePolicyAnswer, planFullManualContext, type FullManualDocument } from "@/lib/ai/full-manual-context";
import { manualChunkFromRow, type ManualChunkRow } from "@/lib/knowledge/full-manual-load";

import { keepsSourceCard } from "./excerpt-brand-filter";

/**
 * EXCERPT_BRAND_HEADING_DROP_ENABLED. QA's round 17c live test (11 Nov 2026), EXCERPT_BRAND_FILTER on: "what are the
 * holidays?" had a clean reply, but source 3 of 5 was "Page 42 — <the sibling brand>" with only that heading as its
 * excerpt. Reproduced here on the production manual fixture (151 chunks).
 */
const FLAG = "EXCERPT_BRAND_HEADING_DROP_ENABLED";
const SIBLING = /Sun\s+Tan\s+City|\bSTC\b/i;
const ANSWER =
  "Buff City Soap is closed on New Years Day, Independence Day, Thanksgiving Day and Christmas Day [p.42]. These holidays are paid holidays for salaried managers and full-time staff [p.42]. Crunch Fitness is closed on Thanksgiving Day and Christmas Day [p.43].";

function sources() {
  const document = {
    id: manual151.document_ids["ask-bubbles"],
    title: "2025 JBA Policy Manual - Edited 5-2025",
    category: "policies_compliance",
    status: "indexed",
    indexed: true,
    chunks: (manual151.chunks as ManualChunkRow[]).map(manualChunkFromRow),
  } as FullManualDocument;
  const plan = planFullManualContext({ question: "what are the holidays?", documents: [document], budget: 10_000_000 });
  return citePolicyAnswer(ANSWER, plan).sources;
}

afterEach(() => vi.unstubAllEnvs());

describe('"what are the holidays?": no source card that is only the sibling brand\'s heading', () => {
  it("off (production today, EXCERPT_BRAND_FILTER on): a card labelled with the sibling brand, its excerpt only the heading (the bug)", () => {
    vi.stubEnv("EXCERPT_BRAND_FILTER_ENABLED", "true");
    const sibling = sources().filter((source) => SIBLING.test(source.locator));
    expect(sibling).toHaveLength(1);
    expect(sibling[0]!.excerpt.trim()).toMatch(SIBLING);
  });

  it("on: that card is left out; this company's, the office's and Crunch's stay, numbered in order", () => {
    vi.stubEnv("EXCERPT_BRAND_FILTER_ENABLED", "true");
    vi.stubEnv(FLAG, "true");
    const cards = sources();
    expect(cards.some((source) => SIBLING.test(`${source.locator} ${source.excerpt}`))).toBe(false);
    expect(cards.map((source) => source.locator)).toEqual(["Page 43 — Buff City Soap", "Page 42 — Corporate Office", "Page 43 — Crunch Fitness"]);
    expect(cards.map((source) => source.marker)).toEqual([1, 2, 3]);
  });
});

describe("keepsSourceCard", () => {
  it("off: every card", () => {
    expect(keepsSourceCard({ locator: "Page 42 — Sun Tan City", excerpt: "Sun Tan City" })).toBe(true);
  });

  it("on: a label naming the sibling brand, an empty excerpt, or a heading-only excerpt is left out", () => {
    vi.stubEnv(FLAG, "true");
    expect(keepsSourceCard({ locator: "Page 42 — Sun Tan City", excerpt: "o New Years Day" })).toBe(false);
    expect(keepsSourceCard({ locator: "Page 12", excerpt: "  " })).toBe(false);
    expect(keepsSourceCard({ locator: "Page 42 — Holiday Benefits", excerpt: "Holiday Benefits:" })).toBe(false);
    expect(keepsSourceCard({ locator: "Page 43 — Buff City Soap", excerpt: ": Buff City Soap is closed on the below listed holidays." })).toBe(true);
  });
});
