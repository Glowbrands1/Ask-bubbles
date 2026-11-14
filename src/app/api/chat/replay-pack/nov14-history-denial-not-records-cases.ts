import { expect, vi } from "vitest";

import { STAFF, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * HISTORY_DENIAL_NOT_RECORDS — "NEVER BEEN WRITTEN UP" IS NOT A QUESTION ABOUT FORMS ON FILE (QA, 14 Nov 2026)
 * ============================================================================
 *
 * Gate-Bubbles-3's #888 follow-up (QA, medium): "verbal ca for <A>, she was late on 11/3/26. no payroll deduct. never
 * been written up" (or "… no prior coaching") was answered from the policy/forms reply with no card. With
 * HISTORY_DENIAL_NOT_RECORDS_ENABLED the card is made. Invented person.
 */
const FLAG = "HISTORY_DENIAL_NOT_RECORDS_ENABLED";
const REPORT = "Gate-Bubbles-3's #888 follow-up, QA (14 Nov 2026); invented person";

export const NOV14_HISTORY_DENIAL_NOT_RECORDS_CASES: ReplayCase[] = [
  { key: "never-written-up", turn: "verbal ca for remy calder, she was late on 11/3/26. no payroll deduct. never been written up" },
  { key: "no-prior-coaching", turn: "verbal ca for remy calder, she was late on 11/3/26. no payroll deduct. no prior coaching" },
].map((wording) => ({
  id: `nov14-history-denial-not-records-${wording.key}`,
  title: `"${wording.turn}" — the Corrective Action card is made`,
  report: REPORT,
  status: { open: "the turn is answered from the forms/policy reply with no card" },
  fixFlags: [FLAG],
  async run(t: ReplayContext) {
    vi.setSystemTime(new Date("2026-11-13T15:00:00Z"));
    t.directory([...STAFF]);
    t.as("location_manager", { level: "location", primaryAreaId: "loc-264", alsoCoversAreaIds: [] });
    const thread = t.thread();
    const reply = (await thread.say(wording.turn)).content;
    const card = thread.proposal as { templateKey?: string; employeeName?: string | null } | null;
    expect(card, `no card:\n${reply}`).not.toBeNull();
    expect(card?.employeeName ?? "", reply).toMatch(/remy calder/i);
  },
}));
