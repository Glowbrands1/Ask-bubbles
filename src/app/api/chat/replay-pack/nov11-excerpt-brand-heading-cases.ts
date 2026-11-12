import { expect } from "vitest";

import manual151 from "@/test/fixtures/jba-manual-production-151.json";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * NO SOURCE CARD SHOWS THE SIBLING COMPANY (QA's round 17c live test, 11 Nov 2026; EXCERPT_BRAND_FILTER on in
 * production; the heading-only card: EXCERPT_BRAND_HEADING_DROP_ENABLED)
 * ============================================================================
 *
 * "what are the holidays?" over the production manual (fixture, 151 chunks), the answering model scripted to restate
 * pages 42–43. Gate-Bubbles noted no case put a sibling-brand excerpt through the production path; this one does.
 * With production's flags the reply's own text is clean, but one source card is labelled with the sibling brand and its
 * excerpt is that heading alone.
 */
const SIBLING = /Sun\s+Tan\s+City|\bSTC\b/i;
const ANSWER =
  "Buff City Soap is closed on New Years Day, Independence Day, Thanksgiving Day and Christmas Day [p.42]. These holidays are paid holidays for salaried managers and full-time staff [p.42]. Crunch Fitness is closed on Thanksgiving Day and Christmas Day [p.43].";

export const NOV11_EXCERPT_BRAND_HEADING_CASES: readonly ReplayCase[] = [
  {
    id: "nov11-excerpt-brand-heading-holidays",
    title: '"what are the holidays?": no source card labelled with the sibling brand; this company\'s card stays',
    report: "QA's Bubbles round 17c live test (11 Nov 2026): excerpt 3 of 5 was \"Page 42 — <sibling brand>\" with only that heading as its body.",
    status: { open: "a source card labelled with the sibling brand, its excerpt only the heading" },
    fixFlags: ["EXCERPT_BRAND_HEADING_DROP_ENABLED"],
    async run(t) {
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      t.fullManual?.({ id: manual151.document_ids["ask-bubbles"], title: "2025 JBA Policy Manual - Edited 5-2025", chunks: manual151.chunks });
      t.modelSays(ANSWER);
      const reply = await t.thread().say("what are the holidays?");
      const cards = reply.citations ?? [];
      expect(cards.length, `no source cards:\n${reply.content}`).toBeGreaterThan(0);
      expect(reply.content, "the reply names the sibling brand").not.toMatch(SIBLING);
      const shown = cards.map((card) => `${card.locator ?? ""} | ${card.excerpt ?? ""}`);
      expect(shown.filter((card) => SIBLING.test(card)), shown.join("\n")).toEqual([]);
      expect(shown.some((card) => /Buff City Soap is closed on the below listed holidays/.test(card)), shown.join("\n")).toBe(true);
    },
  },
];
