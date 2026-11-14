import { expect, vi } from "vitest";

import { STAFF, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * A CITY INSIDE A LONGER PLACE IS NOT THE STORE (guards; the sibling app's 38h live bug, 14 Nov 2026)
 * ============================================================================
 *
 * In the sibling app an Admin's "create a ca for <A> at kearney high, she was late" (and "lincoln high", "the kearney
 * mall", "omaha west") was filed at that city's location, unasked, while the reply said "this form won't name one".
 * Here, with production's flags, an Admin covering every store gets no store for these, and the reply's line agrees
 * (QA, 14 Nov 2026: naming no store is safe; no new ask). Guards, so a later change cannot start filing them; "at
 * kearney" and "at the kearney store" are still filed. Invented person.
 */
const REPORT = "The sibling app's 38h live bug (QA, 14 Nov 2026); guards on 17z; invented person";
const EVERY_STORE = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
const KEARNEY = "loc-66";

async function cardFor(t: ReplayContext, turn: string) {
  vi.setSystemTime(new Date("2026-11-14T15:00:00Z"));
  t.directory([...STAFF]);
  t.as("admin", EVERY_STORE);
  const thread = t.thread();
  const reply = (await thread.say(turn)).content;
  return { reply, locationId: (thread.proposal as { locationId?: string | null } | null)?.locationId ?? null };
}

const NOT_A_STORE: readonly { key: string; turn: string }[] = [
  { key: "bellevue-high", turn: "create a ca for tavia quellan at bellevue high, she was late" },
  { key: "kearney-high", turn: "create a ca for tavia quellan at kearney high, she was late" },
  { key: "the-kearney-mall", turn: "create a ca for tavia quellan at the kearney mall, she was late" },
  { key: "because-kearney-high", turn: "create a ca for tavia quellan, she was late because she was at kearney high of all places" },
];

export const NOV14_LONGER_PLACE_NOT_STORE_GUARDS: ReplayCase[] = [
  ...NOT_A_STORE.map((wording): ReplayCase => ({
    id: `nov14-longer-place-not-store-${wording.key}`,
    title: `Admin: "${wording.turn}" — no store is filed, and the reply agrees`,
    report: REPORT,
    status: "fixed",
    async run(t: ReplayContext) {
      const { reply, locationId } = await cardFor(t, wording.turn);
      expect(locationId, `a store was filed from a longer place:\n${reply}`).toBeNull();
    },
  })),
  ...(["create a ca for tavia quellan at kearney, she was late", "create a ca for tavia quellan at the kearney store, she was late"] as const).map(
    (turn, index): ReplayCase => ({
      id: `nov14-longer-place-not-store-kearney-named-${index + 1}`,
      title: `Admin: "${turn}" — filed at Kearney, NE, and the reply agrees`,
      report: REPORT,
      status: "fixed",
      async run(t: ReplayContext) {
        const { reply, locationId } = await cardFor(t, turn);
        expect(locationId, `the store named was not filed:\n${reply}`).toBe(KEARNEY);
        expect(reply, `the card names a store, the reply says it won't name one:\n${reply}`).not.toMatch(/won't name one/i);
      },
    }),
  ),
];
