import { expect, vi } from "vitest";

import { STAFF, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * REASON_PLACE_NEVER_STORE — "BECAUSE SHE WAS AT KEARNEY" IS NEVER THE STORE, AND KEEPS ITS WORDS (QA, 14 Nov 2026)
 * ============================================================================
 *
 * QA's Bubbles 17z live bug (main 0f0bf697, production flags: REASON_PLACE_NOT_STORE and FUZZY_STORE_ASKS on): the
 * tester's "write a CA for <A>, she was late because she was at kearney" came back "Issue: she was late because she was
 * at Kearney NE · Store: Kearney, NE, as you said", resolved, no question. Two paths:
 *   (a) the AI reader (AI_READS_CODE_CHECKS) read "kearney" as the location and the merge filed it: #879 covered only
 *       the mention reader (a two-store city like "sioux falls west" was never filed by the reader alone);
 *   (b) with REASON_PLACE_NOT_STORE on the mention reader no longer saw a store, so the store-alias pass rewrote the
 *       manager's "kearney" as "Kearney NE" in the turn the Issue is read from.
 * The replay's reader reads the place as the live one does (`readerReads`). With REASON_PLACE_NEVER_STORE_ENABLED neither
 * happens. Invented person.
 */
const FLAG = "REASON_PLACE_NEVER_STORE_ENABLED";
const REPORT = "QA's Bubbles 17z live bug (Tester-Bubbles, 14 Nov 2026), the tester's wording; invented person";
const KEARNEY = "loc-66";

async function cardFor(t: ReplayContext, turn: string) {
  vi.setSystemTime(new Date("2026-11-14T15:00:00Z"));
  t.directory([...STAFF]);
  t.as("admin", { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] });
  t.readerReads({ location: "kearney" });
  const thread = t.thread();
  const reply = (await thread.say(turn)).content;
  return {
    reply,
    locationId: (thread.proposal as { locationId?: string | null } | null)?.locationId ?? null,
    issue: /^\*\*Issue:\*\* ([^\n]*?)(?: · |$)/m.exec(reply)?.[1] ?? "",
  };
}

const TURN = "write a CA for tavia quellan, she was late because she was at kearney";

export const NOV14_REASON_PLACE_NEVER_STORE_CASES: ReplayCase[] = [
  {
    id: "nov14-reason-place-never-store-kearney",
    title: `Admin: "${TURN}" — not filed at Kearney, NE`,
    report: REPORT,
    status: { open: "the AI reader's location files the reason's place as Kearney, NE" },
    fixFlags: [FLAG],
    async run(t: ReplayContext) {
      const { reply, locationId } = await cardFor(t, TURN);
      expect(locationId, `the reason's place was filed as the store:\n${reply}`).not.toBe(KEARNEY);
    },
  },
  {
    id: "nov14-reason-place-never-store-issue-as-typed",
    title: `Admin: "${TURN}" — the Issue keeps "because she was at kearney" as typed`,
    report: REPORT,
    status: { open: "the Issue reads \"… at Kearney NE\"" },
    fixFlags: [FLAG],
    async run(t: ReplayContext) {
      const { reply, issue } = await cardFor(t, TURN);
      expect(issue, `the manager's words were rewritten:\n${reply}`).toBe("she was late because she was at kearney");
    },
  },
];

/** Guards, flag off and on: a store said as the store is still filed. */
export const NOV14_REASON_PLACE_NEVER_STORE_GUARDS: ReplayCase[] = [
  { key: "late-at-kearney", turn: "write a CA for tavia quellan, she was late at kearney" },
  { key: "at-the-kearney-store", turn: "write a CA for tavia quellan at the kearney store, she was late" },
].map((wording) => ({
  id: `nov14-reason-place-never-store-guard-${wording.key}`,
  title: `Admin: "${wording.turn}" — filed at Kearney, NE`,
  report: REPORT,
  status: "fixed",
  fixFlags: [FLAG],
  async run(t: ReplayContext) {
    const { reply, locationId } = await cardFor(t, wording.turn);
    expect(locationId, `the store was not filed:\n${reply}`).toBe(KEARNEY);
  },
}));
