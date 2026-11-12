import { expect, vi } from "vitest";

import { STAFF, TWO_STORES, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * A STORE ANSWER TO THE OFF-ROSTER ASK IS ONLY THE STORE (OFF_ROSTER_STORE_ANSWER_ONLY_ENABLED; QA's #735 ruling, 12 Nov 2026)
 * ============================================================================
 *
 * A two-store manager, a person not in the directory (invented): "create a ca for kira dunmore, she was late today" is
 * met with the off-roster ask ("I can't find **Kira Dunmore** … reply **use Kira Dunmore**"). With production's flags, a
 * reply that is only a store this app already reads ("dodge", "Omaha, NE (West Dodge Rd)") made the card for
 * "kira dunmore", in lowercase, at once: the confirmation was skipped. The store answer only sets the store; the name
 * still needs "use Kira Dunmore".
 */
const FLAG = "OFF_ROSTER_STORE_ANSWER_ONLY_ENABLED";
const DODGE = "loc-264";
const REPORT = "QA's #735 ruling (12 Nov 2026), Gate-Bubbles-3 R735's off-roster ask, a plain store answer";

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-10-25T15:00:00Z"));
  t.directory([...STAFF]);
  t.as("location_manager", TWO_STORES);
  return t.thread();
}

const card = (thread: { proposal: unknown }) => thread.proposal as { employeeName?: string | null; locationId?: string | null } | null;

export const NOV12_OFF_ROSTER_STORE_ANSWER_ONLY_CASES: ReplayCase[] = (
  [
    ["dodge", "dodge"],
    ["full-name", "Omaha, NE (West Dodge Rd)"],
  ] as const
).map(([key, store]) => ({
  id: `nov12-off-roster-store-answer-only-${key}`,
  title: `"create a ca for kira dunmore, she was late today" → "${store}" → "use Kira Dunmore": the store answer sets only the store`,
  report: REPORT,
  status: { open: `"${store}" makes the card for "kira dunmore" at once, skipping "use Kira Dunmore"` },
  fixFlags: [FLAG],
  async run(t: ReplayContext) {
    const thread = start(t);
    const asked = await thread.say("create a ca for kira dunmore, she was late today");
    expect(asked.content, "no off-roster ask").toMatch(/reply \*\*use Kira Dunmore\*\*/);
    const answered = await thread.say(store);
    expect(answered.content, `the store answer skipped the confirmation:\n${answered.content}`).toMatch(/reply \*\*use Kira Dunmore\*\*/);
    expect(card(thread)?.employeeName ?? null, "the name was confirmed by a store answer").toBeNull();
    expect(card(thread)?.locationId ?? null, "the store answer did not set the store").toBe(DODGE);
    const confirmed = await thread.say("use Kira Dunmore");
    expect(card(thread)?.employeeName ?? null, `"use Kira Dunmore" did not confirm:\n${confirmed.content}`).toBe("Kira Dunmore");
    expect(card(thread)?.locationId ?? null, `the store was lost:\n${confirmed.content}`).toBe(DODGE);
  },
}));
