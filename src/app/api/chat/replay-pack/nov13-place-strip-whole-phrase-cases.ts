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
