import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * ONE TYPED WORD NEVER OPENS A TWO-WORD NAME'S FORM (port from the sibling app's #1160)
 * ============================================================================
 *
 * QA's live re-test on the sibling app (20 Nov 2026): "show me forms for Tes" opened the draft of a person filed as
 * "Test Te" with no question: the close-spelling reader (`forms/reopen-close-spelling.ts`, REOPEN_CLOSE_SPELLING, on in
 * this app's production) let the one typed word "tes" stand for both "test" and "te". This app's reopen path reads the
 * same reader. Here, "Edit Mar CA" with a Corrective Action on file for the invented "Mara Ma": never opened; the full
 * name, misspelt one letter, still opens it.
 */

type T = ReplayContext;

const MARA: DirectoryRow = {
  id: "e-mara-ma",
  firstName: "Mara",
  lastName: "Ma",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "Team Member Part Time",
};

/** The invented person of this file (a function: the registry reads exported arrays as cases). */
export function reopenOneWordPeople(): readonly DirectoryRow[] {
  return [MARA];
}

const REPORT = "QA's live re-test on the sibling app (20 Nov 2026, ported): \"show me forms for Tes\" opened \"Test Te\"'s draft";

async function existingCa(t: T): Promise<string> {
  vi.setSystemTime(new Date("2026-11-20T15:00:00Z"));
  t.directory([...STAFF, MARA]);
  t.as("location_manager", WEST_DODGE);
  const earlier = t.thread();
  await earlier.say("I need a corrective action for Mara Ma, she was late opening the store on Monday");
  t.draftWrites({ observation: "Observed:\nMara Ma opened the store late on Monday." });
  return earlier.create();
}

export const NOV20_REOPEN_CLOSE_SPELLING_ONE_WORD_CASES: ReplayCase[] = [
  {
    id: "nov20-reopen-close-spelling-one-word-never-opens",
    title: "\"Edit Mar CA\" with a Corrective Action on file for Mara Ma: one typed word never opens a two-word name's form",
    report: REPORT,
    status: "fixed",
    fixFlags: ["REOPEN_BY_ANY_OPEN_VERB_ENABLED", "REOPEN_CLOSE_SPELLING_ENABLED"],
    async run(t: T) {
      const id = await existingCa(t);
      const reply = await t.thread().say("Edit Mar CA");
      expect(reply.formOpened?.instanceId, `one typed word opened Mara Ma's form:\n${reply.content}`).not.toBe(id);
    },
  },
  {
    id: "nov20-reopen-close-spelling-both-words-opens",
    title: "Control: \"Edit Marra Ma CA\" (each name word typed, one misspelt) still opens Mara Ma's Corrective Action",
    report: `${REPORT}; a close spelling of every word still opens`,
    status: "fixed",
    fixFlags: ["REOPEN_BY_ANY_OPEN_VERB_ENABLED", "REOPEN_CLOSE_SPELLING_ENABLED"],
    async run(t: T) {
      const id = await existingCa(t);
      const reply = await t.thread().say("Edit Marra Ma CA");
      expect(reply.formOpened?.instanceId, `the close spelling did not open the form:\n${reply.content}`).toBe(id);
    },
  },
];
