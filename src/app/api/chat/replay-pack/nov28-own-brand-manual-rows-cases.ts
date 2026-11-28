import { expect, vi } from "vitest";

import fixture from "@/test/fixtures/jba-manual-production-151.json";

import { STAFF, WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * THE SHARED MANUAL'S OTHER BRANDS NEVER REACH AN ANSWER, ON ANY RETRIEVER (K1/K2 port, owner's review, 28 Nov 2026)
 * ============================================================================
 *
 * The owner's review found the sibling app's answers quoting other brands' lines of the shared JBA Policy Manual
 * (retrieval did not read it by brand; the loop's brand rule was a rules-book line). Here the vector match already
 * reads the manual by brand, but hybrid and recall did not, and search_knowledge held the rule only in its rules book.
 * The tool now holds it in code, whatever the retriever returns. The manager's question is invented; the manual rows
 * are production's (`jba-manual-production-151.json`). No person is named.
 */
const REPORT = "Owner's review (28 Nov 2026): answers in the sibling app mentioned other brands' content from the JBA Policy Manual; here hybrid, recall and the loop's search_knowledge did not read it by brand";
const SAID = "what holidays are we closed and do we get paid for them?";

type Row = { chunk_index: number; content: string; section: string | null; page: number | null; locator: string };
const row = (index: number) => {
  const chunk = (fixture.chunks as Row[]).find((entry) => entry.chunk_index === index)!;
  return {
    chunk_id: `jba-${index}`,
    document_id: "doc-manual",
    document_title: "2025 JBA Policy Manual - Edited 5-2025",
    category: "policies_compliance",
    locator: chunk.locator,
    page: chunk.page,
    section: chunk.section,
    content: chunk.content,
    similarity: 0.81,
  };
};
/* What retrieval returns for a holiday question: the corporate office's list, then every brand's. */
const HOLIDAY_ROWS = [row(140), row(141), row(142)];
/* The other brands, as regular-expression sources (no company name is written out here). */
const OTHER_BRANDS = /Crunch|Sun\s+Tan\s+City|\bSTC\b/;

function setUp(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-28T16:00:00Z"));
  t.directory([...STAFF]);
  t.as("location_manager", WEST_DODGE);
  t.knowledgeHas!(HOLIDAY_ROWS);
}

export const NOV28_OWN_BRAND_MANUAL_ROWS_CASES: ReplayCase[] = [
  {
    id: "nov28-loop-search-knowledge-never-another-brands-holidays",
    title: `Standard mode (the agent loop), "${SAID}": search_knowledge's passages carry this company's and the corporate office's lists and the holiday pay rule, never another brand's`,
    report: REPORT,
    status: "fixed",
    async run(t) {
      if (!t.loopOn?.()) throw new Error("the loop is off");
      setUp(t);
      let seen = "";
      t.loopModel!(loopStandIn((view): LoopDecision => {
        const found = view.results.find((result) => result.tool === "search_knowledge");
        if (!found) return { tool: "search_knowledge", input: { query: "holidays closed holiday pay" } };
        seen = JSON.stringify(found.output);
        return { text: "Our stores are closed on Independence Day, Thanksgiving, Christmas, New Years Day and Easter." };
      }));
      await t.thread().say(SAID);
      expect(seen, "search_knowledge ran").not.toBe("");
      expect(seen).toContain("Buff City Soap is closed on the below listed holidays.");
      expect(seen).toContain("1.5 times their regular wage");
      expect(seen.match(new RegExp(OTHER_BRANDS.source, "g")) ?? [], "another brand reached the model").toEqual([]);
    },
  },
];
