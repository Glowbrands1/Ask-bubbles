import { expect, vi } from "vitest";

import { WEST_DODGE, replyMatchesDiff, savedForm, type ReplayCase, type ReplayContext } from "./cases";
import { REFUSAL_ROSTER, STEP_B_READER_FLAGS, patch } from "./nov7-step-b-refusals-scenarios";

/**
 * ============================================================================
 * "MAKE IT ABOUT <INCIDENT> ON <DATE>" ON A SAVED DRAFT CHANGED NOTHING (QA, LIVE ROUND 6, 9 Nov 2026)
 * ============================================================================
 *
 * QA's live trace on Ask Bubbles production (round 6, main 48a3353f, STEP_B_MAKE_IT_ABOUT_ACCOUNT on; the person is
 * invented here): a saved Coaching draft, Other "Missed monthly meeting", Details "Observed: … missed the monthly
 * meeting on 10/10/26 …", Date 2026-10-10. "make it about leaving the front desk unattended on 11/6/26" answered "I
 * haven't changed the Coaching Form for <name> — everything on it is as it was." The turn was handed to the old path,
 * whose revision wrote the new account and was refused by the reducer's protected values (`form-reducer.ts`
 * keepsProtected): 10/10/26, the form's Date, was dropped. Round 5 changed Other only. The reader's reading below is
 * round 5's (the topic only); the revision is scripted to write a correct new Details.
 * STEP_B_MAKE_IT_ABOUT_ACCOUNT_ENABLED (`forms/form-patch-turn.ts`).
 */
const SAID = "make it about leaving the front desk unattended on 11/6/26";
const REQUEST = "create a coaching form for Ottoline Ormsworth, she missed the monthly meeting on 10/10/26";
const DETAILS =
  "Observed:\nOttoline Ormsworth missed the monthly meeting on 10/10/26.\n\nExpectation:\nOttoline is expected to attend every scheduled meeting.\n\nGoing Forward:\nOttoline will put every scheduled meeting on her calendar.";
const DESK =
  "Observed:\nOttoline Ormsworth left the front desk unattended on 11/6/26.\n\nExpectation:\nOttoline is expected to keep the front desk covered at all times.\n\nGoing Forward:\nOttoline will ask a teammate to cover the front desk before stepping away.";
const TOPIC = patch("this_form", [
  { field: "other_topic", value: "Leaving the front desk unattended", how: "replace", evidence: "leaving the front desk unattended" },
  { field: "coaching_topics", options: ["other"], how: "replace", evidence: "make it about leaving the front desk unattended" },
]);
const FIX = [...STEP_B_READER_FLAGS, "EDIT_MAKE_IT_ABOUT_ENABLED", "STEP_B_MAKE_IT_ABOUT_ACCOUNT_ENABLED"];
const REPORT = "QA's live trace, Ask Bubbles production round 6 (9 Nov 2026): \"I haven't changed the Coaching Form … everything on it is as it was\"";
/** What the turn may change; every other saved value stays as it was. */
const CHANGED = new Set(["coaching_details", "form_date", "other_topic"]);

async function onDraft(t: ReplayContext, said: string, revised: string) {
  vi.setSystemTime(new Date("2026-11-08T19:40:00Z"));
  t.directory(REFUSAL_ROSTER);
  t.as("location_manager", WEST_DODGE);
  t.patchReads!({ [said]: TOPIC });
  const thread = t.thread();
  await thread.say(REQUEST);
  t.draftWrites({ coaching_details: DETAILS });
  const id = await thread.create();
  t.revisionWrites({ coaching_details: revised });
  const before = savedForm(t, id);
  const valuesBefore = { ...t.values(id) };
  const reply = await thread.say(said);
  replyMatchesDiff(t, id, before, reply, said);
  return { id, reply, valuesBefore, before };
}

export const NOV9_STEP_B_MAKE_IT_ABOUT_DATED_CASES: ReplayCase[] = [
  {
    id: "nov9-step-b-make-it-about-dated-incident",
    title: "a saved Coaching draft, \"make it about leaving the front desk unattended on 11/6/26\": Details rewritten, Other set, Date 2026-11-06, nothing else changed",
    report: REPORT,
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      const { id, reply, valuesBefore } = await onDraft(t, SAID, DESK);
      const saved = t.values(id);
      expect(saved.coaching_details ?? "", `Details of Coaching is not about the front desk:\n${reply.content}`).toMatch(/front desk unattended on 11\/6\/26/);
      expect(saved.coaching_details ?? "", "Details of Coaching is still about the missed meeting").not.toMatch(/monthly meeting/i);
      expect(saved.form_date, `the Date of the incident:\n${reply.content}`).toBe("2026-11-06");
      expect(saved.other_topic ?? "", `the reader's topic:\n${reply.content}`).toMatch(/front desk/i);
      for (const [key, value] of Object.entries(valuesBefore)) {
        if (!CHANGED.has(key)) expect(saved[key], `${key} changed`).toBe(value);
      }
      expect(reply.content, "the reply says nothing changed").not.toMatch(/I haven't changed/);
    },
  },
  {
    id: "nov9-step-b-make-it-about-dated-revision-refused",
    title: "the same turn, the revision's account refused: nothing is saved (QA's ruling: the Date, Other and the topic change with the account or not at all), and the reply asks what Details should say",
    report: `${REPORT} (QA's ruling, 9 Nov 2026: one incident, all or nothing)`,
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      const { id, reply, before } = await onDraft(t, SAID, "REWRITTEN");
      expect(savedForm(t, id), `the saved form changed:\n${reply.content}`).toBe(before);
      expect(reply.content, `the reply does not say what was not changed:\n${reply.content}`).toMatch(/I haven't changed the \*\*Coaching Form\*\*[^\n]*Details of Coaching[^\n]*Date and the topic stay as they were/);
      expect(reply.content.match(/\?/g) ?? [], `not one question:\n${reply.content}`).toHaveLength(1);
      expect(reply.formUpdate, "a form update with nothing changed").toBeUndefined();
    },
  },
];
