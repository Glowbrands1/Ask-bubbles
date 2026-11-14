import { expect, vi } from "vitest";

import { STAFF, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * RELATIVE_DAY_PART_WORDS — "TONIGHT" DATES THE CARD AS TODAY DOES (QA's Sunny live check, 13 Nov 2026)
 * ============================================================================
 *
 * QA, live at 6:20 PM Central on 13 Nov 2026: "verbal ca for <B>, she no-call no-showed tonight" gave a card with
 * no Date (formDate null); "today" gave 11/13. With RELATIVE_DAY_PART_WORDS_ENABLED "tonight", "this morning", "this
 * afternoon" and "this evening" are the business today and "last night" the day before. The clock is QA's (00:20Z on
 * the 14th is 6:20 PM Central on the 13th). The person is invented.
 */
const FLAG = "RELATIVE_DAY_PART_WORDS_ENABLED";
const REPORT = "Ported from the sibling app (QA's Sunny live check, 13 Nov 2026, 6:20 PM Central), tester's wording; invented person";

async function formDateOf(t: ReplayContext, turn: string): Promise<{ reply: string; formDate: string | null }> {
  vi.setSystemTime(new Date("2026-11-14T00:20:00Z"));
  t.directory([...STAFF]);
  t.as("location_manager", { level: "location", primaryAreaId: "loc-264", alsoCoversAreaIds: [] });
  const thread = t.thread();
  const reply = (await thread.say(turn)).content;
  return { reply, formDate: (thread.proposal as { formDate?: string | null } | null)?.formDate ?? null };
}

const OPEN: readonly { key: string; turn: string; day: "today" | "yesterday" }[] = [
  { key: "tonight", turn: "verbal ca for marnie holloway, she no-call no-showed tonight", day: "today" },
  { key: "this-evening", turn: "verbal ca for marnie holloway, she no-call no-showed this evening", day: "today" },
  { key: "this-morning", turn: "verbal ca for marnie holloway, she was late this morning", day: "today" },
  { key: "last-night", turn: "verbal ca for marnie holloway, she no-call no-showed last night", day: "yesterday" },
];

export const NOV14_RELATIVE_DAY_PART_WORDS_CASES: ReplayCase[] = OPEN.map((wording) => ({
  id: `nov14-relative-day-part-words-${wording.key}`,
  title: `"${wording.turn}" — the card is dated the business ${wording.day}`,
  report: REPORT,
  status: { open: "a part of the day is no date: the card has no Date" },
  fixFlags: [FLAG],
  async run(t: ReplayContext) {
    // "today", said the same way at the same moment, is the business today (it already works).
    const { formDate: today } = await formDateOf(t, "verbal ca for marnie holloway, she no-call no-showed today");
    expect(today, "the control: \"today\" dates the card").toBe("2026-11-13");
    const { reply, formDate } = await formDateOf(t, wording.turn);
    expect(formDate, `the card's Date:\n${reply}`).toBe(wording.day === "today" ? "2026-11-13" : "2026-11-12");
  },
}));

/*
 * Gate-Bubbles's #891 finding (14 Nov 2026): with the flag on, "last night" was read as an earlier step's date (it was
 * not a relative word to RELATIVE_DAY_NOT_HISTORY), so the warning level said after it was dropped. Guards, flag off
 * and on: the level stays. The gate's wording; invented person.
 */
const LEVEL_KEPT: readonly { key: string; turn: string; level: "written" | "verbal" }[] = [
  { key: "cash-written", turn: "need a CA for remy calder. she mishandled cash at close last night. written warning", level: "written" },
  { key: "ncns-verbal", turn: "need a CA for remy calder. she no-call no-showed last night. verbal warning", level: "verbal" },
];

export const NOV14_RELATIVE_DAY_PART_LEVEL_GUARDS: ReplayCase[] = LEVEL_KEPT.map((wording) => ({
  id: `nov14-relative-day-part-words-level-kept-${wording.key}`,
  title: `"${wording.turn}" — the ${wording.level} warning level stays`,
  report: "Gate-Bubbles's #891 finding, 14 Nov 2026; invented person",
  status: "fixed",
  fixFlags: [FLAG],
  async run(t: ReplayContext) {
    vi.setSystemTime(new Date("2026-11-14T15:00:00Z"));
    t.directory([...STAFF]);
    t.as("location_manager", { level: "location", primaryAreaId: "loc-264", alsoCoversAreaIds: [] });
    const thread = t.thread();
    const reply = (await thread.say(wording.turn)).content;
    const level = (thread.proposal as { warningLevel?: string | null } | null)?.warningLevel ?? null;
    expect(level, `the warning level was dropped:\n${reply}`).toBe(wording.level);
  },
}));
