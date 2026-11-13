import { expect, vi } from "vitest";

import { STAFF, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * A STORE IS READ ONLY WHERE ITS WHOLE PHRASE ENDS (QA, 13 Nov 2026; from the sibling app's gate probes)
 * ============================================================================
 *
 * QA (high: it changes an HR record's meaning), from the sibling app's probes: "she was late because she was at lincoln
 * high" became "… she was high" there. Checked here (main 7d5b7bb2): "… because she was at kearney high" is written "…
 * at Kearney NE high" by the store-alias pass, a store inside a longer name. With the flag a store is written only
 * where its phrase ends; otherwise the words are kept as typed. Invented person.
 */
const FLAG = "PLACE_STRIP_WHOLE_PHRASE_ONLY_ENABLED";
const REPORT = "QA, 13 Nov 2026 (from the sibling app's #933 gate probes), checked on main; invented person";

async function observationOf(t: ReplayContext, turn: string): Promise<{ said: string; reply: string }> {
  vi.setSystemTime(new Date("2026-11-13T15:00:00Z"));
  t.directory([...STAFF]);
  t.as("admin", { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] } as never);
  const reply = (await t.thread().say(turn)).content;
  return { said: /\*\*(?:Observation of Offense|Issue)[^:]*:\*\*\s*([^\n·]*)/i.exec(reply)?.[1]?.trim() ?? "", reply };
}

export const NOV13_PLACE_STRIP_WHOLE_PHRASE_CASES: ReplayCase[] = [
  {
    id: "nov13-place-strip-kearney-high-kept",
    title: `"… she was late because she was at kearney high" — never "Kearney NE high"; the words are kept`,
    report: REPORT,
    status: { open: `the account reads "… at Kearney NE high"` },
    fixFlags: [FLAG],
    async run(t: ReplayContext) {
      const { said, reply } = await observationOf(t, "create a ca for marnie holloway, she was late because she was at kearney high");
      expect(said, `a store was written inside "kearney high":\n${reply}`).not.toMatch(/Kearney NE high/i);
      expect(said, `the words were lost:\n${reply}`).toMatch(/\bkearney high\b/i);
    },
  },
];

/*
 * Gate-Bubbles-3 (#869, 13 Nov 2026): with the first version of the flag (an allow-list of words that may follow a
 * store), a real store followed by anything else was no longer read, and the chat asked "Which store?". These were
 * all read with the flag off; they must be read with it on. Guards: they hold on production's flags and with the flag.
 */
const MUST_READ: readonly { key: string; turn: string; store: string }[] = [
  { key: "kearney-date", turn: "verbal ca for marnie holloway at kearney 11/1/26 she was late", store: "loc-66" },
  { key: "west-dodge-date", turn: "verbal ca for marnie holloway at west dodge 11/1/26 she was late", store: "loc-264" },
  { key: "kearney-dash", turn: "verbal ca for marnie holloway at kearney - no call no show", store: "loc-66" },
  { key: "kearney-monday", turn: "verbal ca for marnie holloway at kearney monday she was late", store: "loc-66" },
  { key: "kearney-not-wearing", turn: "verbal ca for marnie holloway at kearney not wearing her apron", store: "loc-66" },
  { key: "kearney-paren", turn: "verbal ca for marnie holloway at kearney (late on 11/1/26)", store: "loc-66" },
  // QA's ruling on the sibling gate's probes: a capitalised word after the store does not make it a longer name.
  { key: "kearney-today-caps", turn: "verbal ca for marnie holloway, she was late at Kearney Today", store: "loc-66" },
  { key: "kearney-nov-1-caps", turn: "verbal ca for marnie holloway, she was late at Kearney Nov 1", store: "loc-66" },
  { key: "kearney-sat-caps", turn: "verbal ca for marnie holloway, she was late at Kearney Sat", store: "loc-66" },
  { key: "kearney-ncns-caps", turn: "verbal ca for marnie holloway, she was at Kearney NCNS", store: "loc-66" },
  { key: "kearney-then-name", turn: "verbal ca for marnie holloway, she was late at kearney Marnie skipped her closing duties", store: "loc-66" },
];

export const NOV13_PLACE_STRIP_MUST_READ_CASES: ReplayCase[] = MUST_READ.map((wording) => ({
  id: `nov13-place-strip-must-read-${wording.key}`,
  title: `"${wording.turn}" — the store is still read`,
  report: "Gate-Bubbles-3 on #869 (13 Nov 2026), QA: a real store mention is never lost; invented person",
  status: "fixed",
  async run(t: ReplayContext) {
    vi.setSystemTime(new Date("2026-11-13T15:00:00Z"));
    t.directory([...STAFF]);
    t.as("admin", { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] } as never);
    const thread = t.thread();
    const reply = (await thread.say(wording.turn)).content;
    expect((thread.proposal as { locationId?: string | null } | null)?.locationId ?? null, `the store was not read:\n${reply}`).toBe(wording.store);
  },
}));
