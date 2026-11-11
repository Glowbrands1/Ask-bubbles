import { expect } from "vitest";

import { noClaimWithoutUpdate, STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";

/*
 * FORM_NAME_FROM_ROSTER_ENABLED (Pau, 5 Nov 2026): only a roster person is
 * ever the card's employee, so with the flag on the person these chats correct
 * is on the roster (as typed) for the card to exist; the claims under test are
 * the same. Off, the directory as before.
 */
function claimRoster(): DirectoryRow[] {
  if (process.env.FORM_NAME_FROM_ROSTER_ENABLED !== "true") return STAFF;
  return [...STAFF, { id: "e-delia", firstName: "Delia", lastName: "Garza Ramso", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" }];
}

/** The 2 Nov scan's honesty report here (P5): "updated" and "confirmed" with nothing changed or read. */
export const NOV2_CLAIM_CASES: readonly ReplayCase[] = [
  {
    id: "nov2-p5-name-claims",
    title: "\"now reads\" / \"Confirmed against records\" are never said when the form did not change",
    report:
      "\"The bot said it updated the employee name …, but the form didn't change. Later it said the name was 'confirmed against records' without checking, and several replies ended with an empty 'I can prepare:'.\"",
    // Fixed in production: the scan-fix flags on (QA, 3 Nov 2026, 04:20 UTC).
    status: "fixed",
    fixFlags: ["CLAIM_GUARD_ENABLED", "OPEN_FORM_NO_SELECTION_ENABLED"],
    async run(t) {
      t.directory(claimRoster());
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say("i have an employee, Delia Garza Ramso that needs a corrective action form with a customer complaint");
      await thread.say("verbal warning, no payroll deduct, part-time team member,");
      t.draftWrites({});
      await thread.create();
      t.modelSays("Got it — the employee name on the draft now reads **Delia Garza Ramos**. Everything else on the card stays as it was.");
      const first = await thread.say("make that update");
      noClaimWithoutUpdate(first);
      t.modelSays("Confirmed against records — the Employee Name on the draft is now **Delia Garza Ramos**, matching Woven.");
      const second = await thread.say("okay the correct way is Delia Garza Ramos");
      noClaimWithoutUpdate(second);
      for (const reply of [first, second]) {
        expect(reply.content, "a form selection's heading with the draft open").not.toMatch(/I can prepare:\s*$/);
      }
    },
  },
];

/** P3: a policy change and more in one turn. */
export const NOV2_POLICY_REST_CASES: readonly ReplayCase[] = [
  {
    id: "nov2-p3-policy-and-prior-coaching",
    title: "a policy named with the prior coaching in one turn: both reach the form, or the reply says what did not",
    report:
      "\"A manager said the previous coaching was her policy manual signing in May 2025. The bot replied 'everything else is as it was,' but Prior Actions stayed empty.\"",
    // Fixed in production: the scan-fix flags on (QA, 3 Nov 2026, 04:20 UTC).
    status: "fixed",
    fixFlags: ["POLICY_CHANGE_REST_OF_TURN_ENABLED"],
    async run(t) {
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say("CA for Remy Calder for underperformance in the month of October");
      t.draftWrites({});
      await thread.create();
      t.revisionWrites({ prior_actions: "Coaching — signed policy manual, May 2025" });
      const reply = await thread.say(
        'CA for Remy Calder for underperformance in the month of October with "Standards of Conduct" from the Policy Manual. Previous Coaching is when she signed the Policy manual May 2025',
      );
      const priorWritten = reply.formUpdate?.updated.includes("prior_actions") ?? false;
      if (!priorWritten) {
        expect(reply.content, "said the rest was as it was, with the prior coaching dropped").not.toMatch(/everything else on the form is as it was/i);
      }
    },
  },
];

/** P5: the name corrections she typed. A Corrective Action's name is not chat-correctable here (the form registry): the reply must say so, never "updated". */
export const NOV2_NAME_CORRECTION_CASES: readonly ReplayCase[] = [
  {
    id: "nov2-p5-name-corrections",
    title: "\"fix her last name …\" / \"the correct way is …\" on a Corrective Action: the name changes, or the reply says how — never \"updated\"",
    report: "\"The bot said it updated the employee name …, but the form didn't change.\"",
    // Fixed in production: the scan-fix flags on (QA, 3 Nov 2026, 04:20 UTC).
    status: "fixed",
    fixFlags: ["NAME_CORRECTION_WORDS_ENABLED"],
    async run(t) {
      t.directory(claimRoster());
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say("i have an employee, Delia Garza Ramso that needs a corrective action form with a customer complaint");
      await thread.say("verbal warning, no payroll deduct, part-time team member,");
      t.draftWrites({});
      const id = await thread.create();
      t.modelSays("Got it — the employee name on the draft now reads **Delia Garza Ramos**.");
      for (const turn of ["fix her last name ramos", "okay the correct way is Delia Garza Ramos"]) {
        const before = t.calls().chat;
        const reply = await thread.say(turn);
        const changed = /Ramos/.test(t.values(id).employee_name ?? "");
        if (!changed) {
          expect(t.calls().chat, `"${turn}" went to the answering model`).toBe(before);
          expect(reply.content).toMatch(/Nothing on the form has changed yet/);
        }
      }
      t.modelSays(null);
    },
  },
];

