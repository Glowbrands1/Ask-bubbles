import { expect, vi } from "vitest";

import { STAFF, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * REASON_SUBJECT_ANY_NOUN_PHRASE — "BECAUSE HER KID WAS SICK IN …" IS WHY, NOT THE STORE (QA, 14 Nov 2026)
 * ============================================================================
 *
 * Gate-Sunny's #975 follow-up, QA's ruling (both apps): "she left early because her kid was sick in lincoln" still
 * read the place as the location (the reason's subject is not she/he). Here, with production's flags
 * (REASON_PLACE_NOT_STORE on), an Admin's "… because her kid was sick in kearney" and "… because her car broke down in
 * kearney" are filed at Kearney, NE. With REASON_SUBJECT_ANY_NOUN_PHRASE_ENABLED they are not. Invented person.
 */
const FLAG = "REASON_SUBJECT_ANY_NOUN_PHRASE_ENABLED";
const REPORT = "Gate-Sunny's #975 follow-up, QA's ruling (14 Nov 2026); invented person";
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

const OPEN: readonly { key: string; turn: string }[] = [
  { key: "kid-sick", turn: "create a ca for tavia quellan, she left early because her kid was sick in kearney" },
  { key: "car-broke-down", turn: "create a ca for tavia quellan, she was late because her car broke down in kearney" },
];

export const NOV14_REASON_SUBJECT_ANY_NOUN_PHRASE_CASES: ReplayCase[] = OPEN.map((wording) => ({
  id: `nov14-reason-subject-any-noun-phrase-${wording.key}`,
  title: `Admin: "${wording.turn}" — the reason's place is not the store`,
  report: REPORT,
  status: { open: "a place in a noun-phrase reason is read as Kearney, NE" },
  fixFlags: [FLAG],
  async run(t: ReplayContext) {
    const { reply, locationId } = await cardFor(t, wording.turn);
    expect(locationId, `a store was read from the reason:\n${reply}`).not.toBe(KEARNEY);
  },
}));

/** Guards, flag off and on: a store said as the store, or where she was late, is still filed. */
const STILL_READ: readonly { key: string; turn: string }[] = [
  { key: "at-kearney-then-reason", turn: "create a ca for tavia quellan at kearney, she left early because her kid was sick" },
  { key: "late-at-kearney-reason", turn: "create a ca for tavia quellan, she was written up because she was late at kearney" },
];

export const NOV14_REASON_SUBJECT_ANY_NOUN_PHRASE_GUARDS: ReplayCase[] = STILL_READ.map((wording) => ({
  id: `nov14-reason-subject-any-noun-phrase-guard-${wording.key}`,
  title: `Admin: "${wording.turn}" — filed at Kearney, NE`,
  report: REPORT,
  status: "fixed",
  fixFlags: [FLAG],
  async run(t: ReplayContext) {
    const { reply, locationId } = await cardFor(t, wording.turn);
    expect(locationId, `the store was not filed:\n${reply}`).toBe(KEARNEY);
  },
}));
