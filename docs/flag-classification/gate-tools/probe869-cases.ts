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

/* GATE PROBE (not committed). */
import { appendFileSync } from "node:fs";
const GATE_PERSON = { id: "e-gate-tessaly", firstName: "Tessaly", lastName: "Varn", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-66", "loc-264"], positionName: "Team Member Part Time" };
const GATE_TURNS = [
  "verbal ca for tessaly varn at kearney 11/1/26 she was late",
  "verbal ca for tessaly varn at west dodge 11/1/26 she was late",
  "ca for tessaly varn at kearney - no call no show on 11/1/26",
  "coaching for tessaly varn at kearney monday she was late",
  "ca for tessaly varn at kearney ne late again on 11/1/26",
  "coaching for tessaly varn at kearney not wearing her apron on 11/1/26",
  "coaching for tessaly varn at kearney (late on 11/1/26)",
  "ca for tessaly varn at kearney today, she was late",
  "ca for tessaly varn at the west dodge store, she was late on 11/1/26",
  "ca for tessaly varn, she was late on 11/1/26 because she was at kearney high",
  "ca for tessaly varn, she was late on 11/1/26 because she was at sioux falls west",
  "ca for tessaly varn, she was late on 11/1/26 because she was at omaha central",
  "ca for tessaly varn, she was late on 11/1/26 because of west dodge road construction",
];
NOV13_PLACE_STRIP_WHOLE_PHRASE_CASES.push(
  ...GATE_TURNS.map((turn, i): ReplayCase => ({
    id: `gateprobe869-${String(i).padStart(2, "0")}`,
    title: turn,
    report: "gate probe",
    status: "fixed",
    fixFlags: [FLAG],
    async run(t: ReplayContext) {
      vi.setSystemTime(new Date("2026-11-13T15:00:00Z"));
      t.directory([...STAFF, GATE_PERSON as never]);
      t.as("admin", { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] } as never);
      const thread = t.thread();
      const reply = (await thread.say(turn)).content;
      appendFileSync(process.env.PROBE_OUT as string, JSON.stringify({ i, turn, flag: process.env[FLAG] ?? "off", loc: thread.proposal?.locationId ?? null, emp: thread.proposal?.employeeName ?? null, reply }) + "\n");
    },
  })),
);
