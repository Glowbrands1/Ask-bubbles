import { expect } from "vitest";

import { STAFF, WEST_DODGE, noClaimWithoutUpdate, replyMatchesDiff, savedForm, type DirectoryRow, type ReplayAnswer, type ReplayCase, type ReplayContext, type ReplayThread } from "./cases";

/*
 * STEP B, ALL PATHS (FORM_PATCH_ALL_PATHS_ENABLED, QA 4 Nov 2026). The patch
 * turn and the draft route already merge through the form reducer; the chat
 * correction, the Corrective Action's date reader, the redraft and the
 * same-form copy now do too, and their reply claims only what was saved. Each
 * case is a manager's wording (people invented), and every turn on the open
 * draft is checked with `replyMatchesDiff`: a reply that says the form changed
 * needs a saved change.
 *
 * `fixFlags` are Step B's three flags. A case that already holds with
 * production's flags is a guard; one that does not is open, and says why.
 * Not here: the revision path (`chat-revision.ts` is protected; its edit waits
 * for the owner), and the honest-reply write on a question turn (H2: QA ruled
 * a question never writes a form field). See
 * `docs/parity-log/2026-11-04-form-patch-all-paths.md`.
 */

const ALL_PATHS_FLAGS = ["FORM_PATCH_REDUCER_ENABLED", "FORM_REPLY_FROM_DIFF_ENABLED", "FORM_PATCH_ALL_PATHS_ENABLED"];

const PEOPLE: DirectoryRow[] = [
  ...STAFF,
  { id: "ap-pat", firstName: "Pat", lastName: "Rivera", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" },
  { id: "ap-wren", firstName: "Wrenna", lastName: "Ashgrove", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" },
  { id: "ap-bryony", firstName: "Bryony", lastName: "Castellane", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" },
  { id: "ap-tamsin", firstName: "Tamsin", lastName: "Rookwood", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" },
];

/** One turn on the open draft, checked: no claim of a change that was not saved. */
async function turn(t: ReplayContext, thread: ReplayThread, id: string, text: string): Promise<ReplayAnswer> {
  const before = savedForm(t, id);
  const reply = await thread.say(text);
  replyMatchesDiff(t, id, before, reply, text);
  return reply;
}

/** A Corrective Action for Pat Rivera dated 10-20-26, created. */
async function caForPat(t: ReplayContext, request: string): Promise<{ thread: ReplayThread; id: string }> {
  t.directory(PEOPLE);
  t.as("location_manager", WEST_DODGE);
  const thread = t.thread();
  await thread.say(request);
  expect(thread.proposal).toMatchObject({ templateKey: "dpoa", employeeName: "Pat Rivera" });
  const id = await thread.create();
  return { thread, id };
}

/** A Coaching Form for Wrenna Ashgrove, created. */
async function coachingForWrenna(t: ReplayContext): Promise<{ thread: ReplayThread; id: string }> {
  t.directory(PEOPLE);
  t.as("location_manager", WEST_DODGE);
  const thread = t.thread();
  for (const said of ["Create a coaching form.", "Wrenna", "yes"]) await thread.say(said);
  expect(thread.proposal).toMatchObject({ templateKey: "coaching", employeeName: "Wrenna Ashgrove" });
  const id = await thread.create();
  return { thread, id };
}

export const NOV3_ALL_PATHS_CASES: readonly ReplayCase[] = [
  {
    id: "nov3-allpaths-a1-same-date",
    title: "\"change the date to 10/20\" when the form is already dated 10/20 does not claim a change",
    report: 'Step B, all paths (QA, 4 Nov 2026), case A1: "change the date to 10/20" on a Corrective Action already dated 10/20 said "Updated … Date → 10/20/2026"',
    status: { open: "the correction saves the same date and replies \"Updated the Corrective Action Form …: Date → …\" with a formUpdate" },
    fixFlags: ALL_PATHS_FLAGS,
    async run(t) {
      const { thread, id } = await caForPat(t, "create ca form for pat rivera for a register shortage on 10-20-26.");
      expect(t.values(id).form_date).toBe("2026-10-20");
      const reply = await turn(t, thread, id, "change the date to 10/20");
      expect(t.values(id).form_date).toBe("2026-10-20");
      expect(reply.formUpdate, "a change claimed with the date as it was").toBeUndefined();
    },
  },
  {
    id: "nov3-allpaths-a2-last-name-its",
    title: "\"fix her last name its Pike\" on a Coaching Form: the name moves, or the reply does not say it did",
    report: 'Step B, all paths (QA, 4 Nov 2026), case A2, in the manager\'s words: "fix her last name its Pike"',
    status: "fixed",
    fixFlags: ALL_PATHS_FLAGS,
    async run(t) {
      const { thread, id } = await coachingForWrenna(t);
      const reply = await turn(t, thread, id, "fix her last name its Pike");
      const name = t.values(id).employee_name ?? "";
      if (reply.formUpdate?.updated.includes("employee_name")) {
        expect(name.startsWith("Wrenna "), `the first name she did not repeat was lost: "${name}"`).toBe(true);
        expect(name.endsWith("Pike"), `the last name she gave is not on the form: "${name}"`).toBe(true);
      }
    },
  },
  {
    id: "nov3-allpaths-a3-hyphenated-typed",
    title: "\"fix her last name, Ashby-Morrow\" with the name typed on the card: no claim without the change",
    report: 'Step B, all paths (QA, 4 Nov 2026), case A3: "fix her last name, Ashby-Morrow", the manager having typed the name on the card',
    status: "fixed",
    fixFlags: ALL_PATHS_FLAGS,
    async run(t) {
      const { thread, id } = await coachingForWrenna(t);
      t.typeOnForm(id, { employee_name: "Wrenna Ashgrove" });
      const reply = await turn(t, thread, id, "fix her last name, Ashby-Morrow");
      noClaimWithoutUpdate(reply);
      const name = t.values(id).employee_name ?? "";
      expect(name, "the typed name was blanked").not.toBe("");
      if (reply.formUpdate?.updated.includes("employee_name")) expect(name.startsWith("Wrenna "), `the first name was lost: "${name}"`).toBe(true);
    },
  },
  {
    id: "nov3-allpaths-a4-prior-verbal-restated",
    title: "a prior verbal warning said twice is on Prior Actions once",
    report: 'Step B, all paths (QA, 4 Nov 2026), case A4: "she also had a verbal ca on 9-1-26", said again a turn later',
    status: "fixed",
    fixFlags: ALL_PATHS_FLAGS,
    async run(t) {
      const { thread, id } = await caForPat(t, "create ca form for pat rivera for a register shortage on 10-20-26.");
      await turn(t, thread, id, "she also had a verbal ca on 9-1-26");
      await turn(t, thread, id, "she also had a verbal ca on 9-1-26");
      const lines = (t.values(id).prior_actions ?? "").split("\n").filter((line) => ["09/01/2026", "9-1-26", "2026-09-01"].some((date) => line.includes(date)));
      expect(lines.length, `the prior verbal is on Prior Actions ${lines.length} times`).toBeLessThanOrEqual(1);
    },
  },
  {
    id: "nov3-allpaths-b1-redraft-nothing-new",
    title: "a redraft that changes nothing on the form does not say \"Redrafted\"",
    report: 'Step B, all paths (QA, 4 Nov 2026), case B1: the account told again on a blank Corrective Action; the reply said "Redrafted the … from what you described" and the form was as it was',
    status: { open: "the redraft claims every key the draft route lists, changed or not" },
    fixFlags: ALL_PATHS_FLAGS,
    async run(t) {
      const { thread, id } = await caForPat(t, "create ca for pat rivera");
      // She had already typed the account and the plan on the card, so the redraft has nothing of its own to write.
      t.typeOnForm(id, {
        observation: "Pat was short at the register by 20 dollars at close on 10-20-26.",
        action_plan: "Pat will count the drawer with a manager at every close for the next 30 days.",
      });
      const reply = await turn(t, thread, id, "she was short at the register by 20 dollars at close on 10-20-26");
      expect(reply.content.startsWith("Redrafted"), "\"Redrafted\" with nothing on the form changed").toBe(false);
    },
  },
  {
    id: "nov3-allpaths-d1-same-copy-twice",
    title: "the same copy made twice: the second does not claim it copied anything",
    report:
      'Step B, all paths (QA, 4 Nov 2026), case D1: "can you create the same draft that we did with bryony castellane by changing the name and position?" asked again after the copy was made, "yes, replace them"',
    status: { open: "the second copy rewrites the same values and replies \"Copied … onto … draft\" with a formUpdate" },
    fixFlags: ALL_PATHS_FLAGS,
    async run(t) {
      t.directory(PEOPLE);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      for (const said of ["Create a coaching form.", "Bryony", "yes"]) await thread.say(said);
      expect(thread.proposal).toMatchObject({ templateKey: "coaching", employeeName: "Bryony Castellane" });
      t.draftWrites({ coaching_details: "Bryony was coached on ship from store: print the packing slip, clip it to the rolling rack in order, then pack." });
      await thread.create();
      t.draftWrites({});
      // Tamsin's draft, in a chat of its own.
      const tamsin = t.thread();
      for (const said of ["Create a coaching form.", "Tamsin", "yes"]) await tamsin.say(said);
      expect(tamsin.proposal).toMatchObject({ templateKey: "coaching", employeeName: "Tamsin Rookwood" });
      const id = await tamsin.create();
      const ask = "can you create the same draft that we did with bryony castellane by changing the name and position?";
      for (let round = 0; round < 2; round += 1) {
        const reply = await turn(t, tamsin, id, ask);
        if (reply.content.includes("Replace them with")) await turn(t, tamsin, id, "yes, replace them");
      }
      expect(t.values(id).coaching_details ?? "", "the copy never reached Tamsin's draft").toContain("rolling rack");
    },
  },
  {
    id: "nov3-allpaths-h1-ordinary-answer",
    title: "an ordinary answer that says it updated the open draft is not let through",
    report: 'Step B, all paths (QA, 4 Nov 2026), case H1: "make that update" with a draft open, and the answering model said the draft was updated',
    status: "fixed",
    fixFlags: ALL_PATHS_FLAGS,
    async run(t) {
      const { thread, id } = await coachingForWrenna(t);
      t.modelSays("Done — I updated the draft with those details.");
      const reply = await turn(t, thread, id, "make that update");
      noClaimWithoutUpdate(reply);
      t.modelSays(null);
    },
  },
  {
    id: "nov3-allpaths-q1-payroll-withdrawn-twice",
    title: "a payroll answer withdrawn twice: the second turn does not claim a change",
    report:
      'QA, 4 Nov 2026 (Q1): a withdrawn payroll answer is cleared untouched by the reducer; "hold off on the $3.25 payroll deduction", then "not sure about the payroll deduction anymore"',
    status: { open: "the second withdrawal clears an answer already cleared and replies \"Updated …\" with a formUpdate" },
    fixFlags: ALL_PATHS_FLAGS,
    async run(t) {
      const { thread, id } = await caForPat(
        t,
        "create ca form for pat rivera for a register shortage on 10-20-26. payroll deduct applies and $3.25 will be deducted from check.",
      );
      expect(t.checked(id).payroll_deduct).toEqual(["yes"]);
      await turn(t, thread, id, "hold off on the $3.25 payroll deduction");
      expect(t.checked(id).payroll_deduct ?? [], "the withdrawn Yes was kept").not.toContain("yes");
      await turn(t, thread, id, "not sure about the payroll deduction anymore");
    },
  },
];
