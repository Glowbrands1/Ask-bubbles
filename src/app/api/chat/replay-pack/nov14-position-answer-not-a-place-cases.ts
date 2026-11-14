import { expect, vi } from "vitest";

import { type DirectoryRow, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * A STORE ANSWER IS NEVER HER POSITION (QA's live rollback of POSITION_ANSWER_NOT_A_SENTENCE, 14 Nov 2026)
 * ============================================================================
 *
 * Production (Bubbles, 11:10Z, chat conv_mwgayqsv230a7sf): "write a CA for <A> at the front desk, she was rude to a
 * guest" asked for both the Position and the Store; the manager answered "Kearney" in a turn of its own. The Store was
 * Kearney, NE (right), and the card's Position was ALSO "Kearney", from the manager, with the Position question gone
 * and nothing announced. A store, or its city, is never a title. The person is invented, with no Woven store or
 * position, as the live employee had none.
 */

const FLAG = "POSITION_ANSWER_NOT_A_SENTENCE_ENABLED";
const REPORT = "QA's live rollback of POSITION_ANSWER_NOT_A_SENTENCE (Bubbles, 14 Nov 2026): the store answer \"Kearney\" was also saved as the Position";
const NOWHERE: DirectoryRow[] = [
  { id: "pn-place-1", firstName: "Marnie", lastName: "Holloway", preferredFirstName: null, employmentStatus: "active", locationIds: [], positionName: null },
];

/*
 * "Lincoln" (QA's third variant) is no store of this app: the resolver cannot tell it from a one-word title ("Barista"),
 * and it is read as the Position on production already. Left for QA's ruling, not asserted here.
 */
export const NOV14_POSITION_ANSWER_NOT_A_PLACE_CASES: ReplayCase[] = ["Kearney", "Omaha West"].map(
  (answer): ReplayCase => ({
    id: `nov14-position-answer-not-a-place-${answer.toLowerCase().replace(/\s+/g, "-")}`,
    title: `"write a CA for Marnie Holloway at the front desk, she was rude to a guest" → "${answer}": the answer is never her Position`,
    report: REPORT,
    status: "fixed",
    fixFlags: [FLAG],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-14T11:00:00Z"));
      t.directory(NOWHERE);
      t.as("admin", { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] } as never);
      const thread = t.thread();
      const first = await thread.say("write a CA for Marnie Holloway at the front desk, she was rude to a guest");
      expect(first.content, "the card asks for the position").toMatch(/position \(job title\)/i);
      expect(first.content, "the card asks for the store").toMatch(/which store/i);
      const reply = await thread.say(answer);
      const card = thread.proposal as Record<string, unknown> | null;
      expect(String(card?.employeeRole ?? ""), reply.content).not.toMatch(new RegExp(answer, "i"));
      expect(reply.content, "a store announced as the title").not.toMatch(/Job title set to/);
    },
  }),
);
