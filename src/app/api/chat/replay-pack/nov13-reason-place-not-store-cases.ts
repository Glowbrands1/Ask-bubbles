import { expect, vi } from "vitest";

import { STAFF, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * REASON_PLACE_NOT_STORE — WHERE SHE WAS IS WHY SHE WAS LATE, NOT THE STORE (Gate-Bubbles-3, #869, 13 Nov 2026)
 * ============================================================================
 *
 * Gate-Bubbles-3's #869 probe, in its wording: "ca for tessaly varn, she was late on 11/1/26 because she was at sioux
 * falls west" gave **Store:** Sioux Falls, SD (W 41st St) with the flag off and on — "sioux falls west" (a school) is
 * read by close spelling as the W 41st St store, and production's GLOBAL_STORE_ASK takes it. A place in a "because she
 * was at …" reason is why she was late, not where the form is filed: with REASON_PLACE_NOT_STORE_ENABLED the store
 * comes from Woven, or is asked when she has two. The account keeps the words. Invented people.
 */
const FLAG = "REASON_PLACE_NOT_STORE_ENABLED";
const REPORT = "Gate-Bubbles-3's #869 probes (13 Nov 2026, R869), QA: a separate case; invented people";

/** Two Woven stores, as in the gate's probe. */
const TESSALY = { id: "e-tessaly", firstName: "Tessaly", lastName: "Varn", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-66", "loc-264"], positionName: "Team Member Part Time" };

async function cardFor(t: ReplayContext, turn: string) {
  vi.setSystemTime(new Date("2026-11-13T15:00:00Z"));
  t.directory([...STAFF, TESSALY as never]);
  t.as("admin", { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] } as never);
  const thread = t.thread();
  const reply = (await thread.say(turn)).content;
  return { reply, locationId: (thread.proposal as { locationId?: string | null } | null)?.locationId ?? null };
}

export const NOV13_REASON_PLACE_NOT_STORE_CASES: ReplayCase[] = [
  {
    id: "nov13-reason-place-not-store-sioux-falls-west-two-stores",
    title: `"ca for tessaly varn, she was late on 11/1/26 because she was at sioux falls west" — no Sioux Falls store; her two Woven stores are asked`,
    report: REPORT,
    status: { open: "the reason's place is read as the Sioux Falls (W 41st St) store" },
    fixFlags: [FLAG],
    async run(t: ReplayContext) {
      const { reply, locationId } = await cardFor(t, "ca for tessaly varn, she was late on 11/1/26 because she was at sioux falls west");
      expect(locationId, `a store was read from the reason:\n${reply}`).not.toBe("loc-225");
      expect(reply, `a Sioux Falls store is on the card:\n${reply}`).not.toMatch(/\*\*Store:\*\*[^\n]*Sioux Falls/i);
      // Two Woven stores: the chat asks which, and draws no card (no Issue, no Store line) until it is answered.
      expect(reply, `the store is not asked:\n${reply}`).toMatch(/Which store is this about\?/);
    },
  },
  {
    id: "nov13-reason-place-not-store-sioux-falls-west-one-store",
    title: `"create a ca for marnie holloway, she was late because she was at sioux falls west" — her one Woven store`,
    report: REPORT,
    status: { open: "the reason's place is read as the Sioux Falls (W 41st St) store" },
    fixFlags: [FLAG],
    async run(t: ReplayContext) {
      const { reply, locationId } = await cardFor(t, "create a ca for marnie holloway, she was late because she was at sioux falls west");
      expect(locationId, `the store is not her Woven store:\n${reply}`).toBe("loc-264");
      expect(reply, `the account lost the words:\n${reply}`).toMatch(/because she was at sioux falls west/i);
    },
  },
  // Gate-Bubbles-3's #879 probes: the same reason said "bc" or "since" (QA: one commit on #879).
  ...(["bc", "since"] as const).map((why): ReplayCase => ({
    id: `nov13-reason-place-not-store-sioux-falls-west-${why}`,
    title: `"ca for tessaly varn, she was late on 11/1/26 ${why} she was at sioux falls west" — no Sioux Falls store`,
    report: `${REPORT}; Gate-Bubbles-3's #879 probes`,
    status: { open: "the reason's place is read as the Sioux Falls (W 41st St) store" },
    fixFlags: [FLAG],
    async run(t: ReplayContext) {
      const { reply, locationId } = await cardFor(t, `ca for tessaly varn, she was late on 11/1/26 ${why} she was at sioux falls west`);
      expect(locationId, `a store was read from the reason:\n${reply}`).not.toBe("loc-225");
    },
  })),
];

/** Guards, flag off and on: a store said as the store is still read; the reason flag leaves them alone. */
const MUST_READ: readonly { key: string; turn: string; store: string }[] = [
  { key: "kearney-date", turn: "verbal ca for tessaly varn at kearney 11/1/26 she was late", store: "loc-66" },
  { key: "west-dodge-store", turn: "ca for tessaly varn at the west dodge store, she was late on 11/1/26", store: "loc-264" },
  { key: "kearney-west-of", turn: "verbal ca for tessaly varn at kearney west of the register, she was late on 11/1/26", store: "loc-66" },
  { key: "late-at-kearney", turn: "verbal ca for tessaly varn, she was late at kearney on 11/1/26", store: "loc-66" },
];

export const NOV13_REASON_PLACE_NOT_STORE_GUARDS: ReplayCase[] = MUST_READ.map((wording) => ({
  id: `nov13-reason-place-not-store-guard-${wording.key}`,
  title: `"${wording.turn}" — the store is still read`,
  report: REPORT,
  status: "fixed",
  fixFlags: [FLAG],
  async run(t: ReplayContext) {
    const { reply, locationId } = await cardFor(t, wording.turn);
    expect(locationId, `the store was not read:\n${reply}`).toBe(wording.store);
  },
}));
