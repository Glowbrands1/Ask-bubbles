import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * EVERY DATE IS A STEP'S: THE CARD IS DATED TODAY, NOT BY A COACHING (QA round 5, Bubbles live, 7 Nov 2026 18:56Z)
 * ============================================================================
 *
 * The manager's words (the employee invented): "hi, i need a performance corrective action for <name>, a team member.
 * she is under performance for september. she already received a verbal warning and coaching on 9/8/2026, 9/15/2026
 * and 9/25/2026. no payroll deduction applies. today's date is fine." The card's Date was 2026-09-15.
 * STEP_DATE_NOT_INCIDENT (on in production) rightly reads all three dates as the steps', so no incident date is left,
 * and the card kept the first date `extractFormDate` read: a coaching. With every flag off it asked "9/15 or 9/25?".
 * STEP_DATES_NOT_FORM_DATE_ENABLED (`forms/incident-dates.ts` decideFormDate).
 */

const TAMSIN: DirectoryRow = {
  id: "e-tamsin-vale-r5",
  firstName: "Tamsin",
  lastName: "Vale",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "Team Member Part Time",
};

const STEPS = "she already received a verbal warning and coaching on 9/8/2026, 9/15/2026 and 9/25/2026.";
const SAID = `hi, i need a performance corrective action for tamsin vale, a team member. she is under performance for september. ${STEPS} no payroll deduction applies. today's date is fine.`;
const FIX = ["STEP_DATES_NOT_FORM_DATE_ENABLED"];
const REPORT = "QA round 5, Bubbles live 7 Nov 2026 18:56Z (history 3ec9e561)";
const STEP_DATES = ["2026-09-08", "2026-09-15", "2026-09-25"];

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-07T18:56:00Z"));
  t.directory([...STAFF, TAMSIN]);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

export const NOV8_STEP_DATES_NOT_FORM_DATE_CASES: ReplayCase[] = [
  {
    id: "nov8-r5-step-dates-today-is-fine",
    title: "\"… coaching on 9/8/2026, 9/15/2026 and 9/25/2026 … today's date is fine\": the card is dated today, not 9/15",
    report: REPORT,
    status: { open: "the card's Date is 2026-09-15, a coaching date" },
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      const reply = await thread.say(SAID);
      expect(thread.proposal, `no Corrective Action card:\n${reply.content}`).toMatchObject({ templateKey: "dpoa", employeeName: "Tamsin Vale" });
      expect(thread.proposal?.formDate, `the card is dated by a step:\n${reply.content}`).toBe("2026-11-07");
    },
  },
  {
    id: "nov8-r5-step-dates-no-today",
    title: "the same request without \"today's date is fine\": no step date dates the card",
    report: `${REPORT} (the condition)`,
    status: { open: "the card's Date is 2026-09-15, a coaching date" },
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      const reply = await thread.say(SAID.replace(" today's date is fine.", ""));
      expect(thread.proposal, `no Corrective Action card:\n${reply.content}`).toMatchObject({ templateKey: "dpoa" });
      expect(STEP_DATES, `the card is dated by a step:\n${reply.content}`).not.toContain(thread.proposal?.formDate);
    },
  },
  {
    id: "nov8-r5-step-date-incident-kept",
    title: "negative: \"… late on 10/20/2026. she already received a verbal warning on 9/8/2026.\" keeps 10/20 (SF4's shape)",
    report: `${REPORT} (the condition)`,
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      const reply = await thread.say("create a corrective action for tamsin vale, she was late on 10/20/2026. she already received a verbal warning on 9/8/2026.");
      expect(thread.proposal?.formDate, `the incident date is lost:\n${reply.content}`).toBe("2026-10-20");
    },
  },
];
