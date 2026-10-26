import { afterEach, describe, expect, it, vi } from "vitest";

import rows from "@/test/fixtures/jba-manual-production-151.json";
import { accountManualSections } from "@/lib/ai/account-manual-sections";
import { citedSections } from "@/lib/ai/violation-policy";
import { manualChunkFromRow, type ManualChunkRow } from "@/lib/knowledge/full-manual-load";

import type { ManualChunk } from "./official-policy-manual";
import { sectionsNamedIn } from "./policy-change";

/**
 * ============================================================================
 * "VERBAL WARNING" IS A LEVEL, NOT THE WARNING SHEET
 * (POLICY_WARNING_NOT_SECTION_ENABLED)
 * ============================================================================
 *
 * QA item 7, 25 Oct 2026 (Ask Bubbles only): a corrective action asked for as
 * a "verbal warning" cited "Warning p.36", the manual's retirement-plan
 * sheet. Ask Sunny already keeps that sheet out (NOT_A_SECTION and the card);
 * this ports the mechanism behind a flag. Name invented.
 */

const CHUNKS: readonly ManualChunk[] = (rows.chunks as ManualChunkRow[]).map((row) => {
  const chunk = manualChunkFromRow(row);
  return { ...chunk, page: chunk.page ?? null, locator: chunk.locator ?? undefined };
});
const TURN = "verbal warning for Tobin Arle, attendance";
const names = (sections: readonly { heading: string; page: number }[]) => sections.map((s) => `${s.heading} p.${s.page}`);

afterEach(() => vi.unstubAllEnvs());

describe("verbal warning", () => {
  it("flag off: Warning p.36 is cited (the bug)", () => {
    expect(names(sectionsNamedIn({ text: TURN, chunks: CHUNKS }))).toContain("Warning p.36");
    expect(names(accountManualSections(TURN, CHUNKS))).toContain("Warning p.36");
  });

  it("flag on: never Warning p.36; Attendance p.14 stays", () => {
    vi.stubEnv("POLICY_WARNING_NOT_SECTION_ENABLED", "true");
    expect(names(sectionsNamedIn({ text: TURN, chunks: CHUNKS }))).not.toContain("Warning p.36");
    expect(names(accountManualSections(TURN, CHUNKS))).toEqual(["Attendance p.14"]);
    expect(citedSections([TURN], CHUNKS)).toEqual([{ section: "Attendance", page: 14 }]);
  });

  it.each(["written warning for Tobin Arle, violating the standards of conduct", "final warning, dress code"])(
    "flag on: %s cites no Warning sheet",
    (text) => {
      vi.stubEnv("POLICY_WARNING_NOT_SECTION_ENABLED", "true");
      expect(names(accountManualSections(text, CHUNKS)).some((line) => line.startsWith("Warning"))).toBe(false);
    },
  );
});

/* HOW MANAGERS TYPE (Pau, 26 Oct 2026): the same reading in all lowercase and in sentence case. */
const lower = (text: string) => text.toLowerCase();
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();

describe("flag on: every register", () => {
  it.each([lower(TURN), sentence(TURN), "verbl warning for tobin, attendance", "Verbal Warning for Tobin Arle, Attendance"])("%s cites no Warning p.36", (text) => {
    vi.stubEnv("POLICY_WARNING_NOT_SECTION_ENABLED", "true");
    expect(names(accountManualSections(text, CHUNKS)).some((line) => line.startsWith("Warning"))).toBe(false);
  });
});
