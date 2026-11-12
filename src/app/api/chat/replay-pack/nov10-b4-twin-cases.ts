import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";
import { pauSfS21TwinPeople } from "./nov5-pau-sf-s21-s25-twin-cases";

/**
 * QA's B4 (10 Nov 2026), Pau's sf-s22 and sf-s25 (5 Nov 2026, the sibling app's production), this app's twins of the
 * sibling app's nov10-b4 cases; the turns are the twin cases' (`nov5-pau-sf-s21-s25-twin-cases.ts`), the people
 * invented.
 */
const S22_T1 =
  "create a ca for must see behaviors for performace  this should be for wynne sarrow  - verbal\n146 transactions \nBelow in UPT, Average Sale, Conversion  but i need it to be in the format of Tamsyn ca  it needs to look exactally the same as tamsyns but wtih all of this information";
const REVIEWER_NOTES =
  "Please make the following edits and resubmit:\n\n1. **Kit Coaching Document:** This was signed on 10/16/2026. I do not see a date showing that Bundles was signed by Corwen. Please make sure all coaching documents are signed and dated (mm/dd/yyyy format) before uploading.\n\n2. **Details – Observed:** Please reword this section to:\n   \n   For the month of October 2026, Corwen completed 24 transactions and was below expectations in UPT, Average Sale, and Conversion.\n\n3. **Policy Violated:** Please change this from **Under Performance** to **Standards of Conduct**, as the second bullet under that policy is lack of sales performance. You may need to manually add this bullet.";

function start(t: Parameters<ReplayCase["run"]>[0]) {
  vi.setSystemTime(new Date("2026-11-04T23:30:00Z"));
  t.directory([...STAFF, ...pauSfS21TwinPeople()]);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

export const NOV10_B4_TWIN_CASES: ReplayCase[] = [
  {
    id: "nov10-b4-twin-ca-not-coaching-form-type",
    title: "sf-s22, the form type: pasted reviewer notes naming a \"Kit Coaching Document\" never turn the Corrective Action card into a Coaching Form",
    report: "Pau via QA, 5 Nov 2026, sf-s22 (the sibling app): \"It needs to be a CA, not a coaching form\" → \"Make this: …\" → back to a Coaching Form",
    // With this app's production flags the first request makes no Corrective Action card (CA_SALES_POLICY rolled back here).
    status: { open: "with this app's production flags the first request makes no Corrective Action card; with it, the pasted notes make a Coaching Form card" },
    fixFlags: ["CA_SALES_POLICY_ENABLED", "PASTED_FORM_NAME_NOT_REQUEST_ENABLED"],
    async run(t) {
      const thread = start(t);
      await thread.say(S22_T1);
      expect(thread.proposal, "no Corrective Action card for the request").toMatchObject({ templateKey: "dpoa" });
      const pasted = await thread.say(`Use this to make it: ${REVIEWER_NOTES}`);
      expect(pasted.content, `the pasted notes made a Coaching Form card:\n${pasted.content}`).not.toMatch(/what I would put on a \*\*Coaching Form\*\*/);
      await thread.say("It needs to be a CA, not a coaching form");
      expect(thread.proposal, "\"It needs to be a CA\" is not a Corrective Action").toMatchObject({ templateKey: "dpoa" });
      const again = await thread.say(`Make this:${REVIEWER_NOTES}`);
      expect(again.content, `back to the Coaching Form after "It needs to be a CA":\n${again.content}`).not.toMatch(/what I would put on a \*\*Coaching Form\*\*/);
      await thread.say("Its a CA");
      expect(thread.proposal, "\"Its a CA\" is still a Coaching Form").toMatchObject({ templateKey: "dpoa" });
    },
  },
  {
    id: "nov10-b4-twin-closing-not-late-opening",
    title: "sf-s25: a closing account (clocked out early, the registers taken down before close) is never cited as Late Opening",
    report: "Pau via QA, 5 Nov 2026, sf-s25 (the sibling app): closing duties read as Late Opening",
    status: "fixed",
    fixFlags: ["LATE_OPENING_NEEDS_OPENING_ENABLED"],
    async run(t) {
      const thread = start(t);
      await thread.say("closing policy");
      await thread.say("What policy would it be if a team member did not complete the closing correctly and i have already talked to her about it");
      // The sibling app's live trace (5 Nov 2026): the intent read returned policyHeading "Late Opening" for this turn.
      t.slotsRead({ policyHeading: "Late Opening" });
      const reply = await thread.say(
        "Write a CA for Wynne Sarrow she is a team member works at West Dodge and on 11/3/26 she was scheduled until 9:15PM and clocked out at 9:01. She also took down the registers at 8:11 PM before the Store was closed.",
      );
      expect(reply.content, `a closing account is cited as Late Opening:\n${reply.content}`).not.toMatch(/Late Opening/i);
    },
  },
];
