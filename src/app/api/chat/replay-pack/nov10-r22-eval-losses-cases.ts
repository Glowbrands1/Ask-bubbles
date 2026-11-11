import { expect } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";

/**
 * Port of the sibling app's round-22 eval check (10 Nov 2026): with the roster-name set on, two cards lost what the
 * manager gave — a lower-case surname after the request's "for" (sf-s4), and a date given earlier, after a near-miss
 * name correction ("Oops, it's <name>", s14). Fixed in the set: sf-s4 under FORM_NAME_FROM_ROSTER
 * (`forms/request-slot.ts`), s14 under ROSTER_NEAR_MISS (`ai/first-name-suggest.ts`). Invented people; this app's
 * own wording.
 */
const SET = [
  "FORM_NAME_FROM_ROSTER_ENABLED",
  "ROSTER_NEAR_MISS_ENABLED",
  "ROSTER_NAME_IN_CANDIDATE_ENABLED",
  "ROSTER_COMPOUND_SURNAME_ENABLED",
  "ROSTER_NOT_FOUND_ANY_PHRASING_ENABLED",
];
const REPORT = "QA, 10 Nov 2026: the sibling app's round-22 eval check (sf-s4, s14), ported before Bubbles round 16c";
const GLOBAL = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };

const ROZLYN: DirectoryRow = {
  id: "e-rozlyn-quellmar",
  firstName: "Rozlyn",
  lastName: "Quellmar",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "Team Member Part Time",
};

const SF_S4 = "make me a CA for Odalys merriwether for being late to opening this morning";

export const NOV10_R22_EVAL_LOSSES_CASES: ReplayCase[] = [
  {
    id: "nov10-r22-sf-s4-roster-read-empty",
    title: "sf-s4, the roster read returns nobody: the card keeps the surname",
    report: `${REPORT} (sf-s4, roster read failing)`,
    status: "fixed",
    fixFlags: SET,
    async run(t) {
      t.directory([]);
      t.as("location_manager", GLOBAL);
      const thread = t.thread();
      await thread.say(SF_S4);
      // This app keeps the name as typed (TYPED_NAME); the loss was the surname.
      expect(thread.proposal?.employeeName ?? null).toMatch(/^Odalys merriwether$/i);
    },
  },
  {
    id: "nov10-r22-sf-s4-off-roster-lowercase-surname",
    title: "sf-s4, off the roster: never the first name alone",
    report: `${REPORT} (sf-s4)`,
    status: "fixed",
    fixFlags: SET,
    async run(t) {
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say(SF_S4);
      expect(thread.proposal?.employeeName ?? null, "never the first name alone").not.toBe("Odalys");
      expect(reply.content, "never offered as the first name alone").not.toMatch(/\*\*Odalys\*\*/);
    },
  },
  {
    id: "nov10-r22-sf-s4-negative-for-being-late",
    title: "negative: a lower-case word after \"for\" that is no name (\"for being late\", \"for tardiness\") never becomes one",
    report: `${REPORT} (sf-s4 negative)`,
    status: "fixed",
    fixFlags: SET,
    async run(t) {
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      for (const said of ["make me a CA for being late to opening this morning", "make me a CA for tardiness, she was late again"]) {
        const thread = t.thread();
        const reply = await thread.say(said);
        expect(thread.proposal?.employeeName ?? null, `"${said}": no employee is read from the reason`).toBeNull();
        expect(reply.content).not.toMatch(/\*\*(?:Being|Being Late|Tardiness)\*\*/i);
      }
    },
  },
  {
    id: "nov10-r22-s14-date-kept-after-name-correction",
    title: "s14: after \"Oops, it's Rozlyn quellmar\", the follow-up coaching card keeps the date given earlier",
    report: `${REPORT} (s14)`,
    /*
     * OPEN here (10 Nov 2026, coding 2): the sibling app's cause ("Oops, it's" kept before the name) is fixed in this
     * app too (`besidesTheName`, unit-tested), but this chat loses the date on two other paths: (1) with ROSTER_NEAR_MISS,
     * the answer's card is built from the answer and its request only (the Coaching Form, no date), and (2) even with the
     * roster set off, the later "create a follow-up coaching form for rozlyn quellmar" drops it. Reported to QA.
     */
    status: { open: "the date given on turn 2 is lost after the near-miss answer and on the next request for her" },
    fixFlags: SET,
    fixStatus: { open: "the same with the roster set on: the fix for these two paths is pending" },
    async run(t) {
      t.directory([...STAFF, ROZLYN]);
      t.as("location_manager", GLOBAL);
      const thread = t.thread();
      for (const said of [
        "help me create a coaching form",
        "October 1st",
        "ok, create a follow-up coaching form for rozline quellmar. i trained her on the new promo and we roleplayed a couple objections",
        "Oops, it's Rozlyn quellmar",
        "create a follow-up coaching form for rozlyn quellmar",
        "This draft is missing 'follow-up observation', 'progress level', and 'specific evidence' that was filled in the draft before that.",
      ]) await thread.say(said);
      expect(thread.proposal?.employeeName ?? null).toBe("Rozlyn Quellmar");
      expect(thread.proposal?.formDate ?? null, "the date given on turn 2 is kept").toMatch(/-10-01$/);
    },
  },
];
