import { expect, vi } from "vitest";

import { WEST_DODGE, savedForm, type ReplayCase, type ReplayContext } from "./cases";
import { REFUSAL_ROSTER, patch } from "./nov7-step-b-refusals-scenarios";

/**
 * ============================================================================
 * "MAKE IT ABOUT <INCIDENT> ON <DATE>" CHANGES THE TOPIC, THE DATE AND DETAILS TOGETHER, OR NONE (QA, live round 7)
 * ============================================================================
 *
 * QA's live test, Ask Bubbles round 7 (9 Nov 2026, 13:15Z; the person invented): a saved Coaching draft with Other
 * "Missed monthly meeting", Date 2026-10-10 and Details about the missed meeting on 10/10/26. "make it about leaving the
 * front desk unattended on 11/6/26" answered "Updated the Coaching Form for <D>: Details of Coaching. Everything else on
 * the form is as it was." Saved: Details new, Other and the Date as before. The reader read no edit of this form, so the
 * turn went to the old path, whose revision #632 let drop the old date: Details alone. #632's design was all or nothing.
 * MADE_ABOUT_ALL_OR_NOTHING_ENABLED (`forms/form-patch-turn.ts`, `forms/form-write.ts`). The reader's reading is scripted
 * as none (the live shape) or another form's; the revision writes the new Details.
 */
const SAID = "make it about leaving the front desk unattended on 11/6/26";
const DETAILS =
  "Observed:\nOttoline Ormsworth missed the monthly meeting on 10/10/26.\n\nExpectation:\nOttoline is expected to attend every scheduled meeting.";
const DESK = "Observed:\nOttoline Ormsworth left the front desk unattended on 11/6/26.\n\nExpectation:\nOttoline is expected to keep the front desk covered at all times.";
const FIX = ["MADE_ABOUT_ALL_OR_NOTHING_ENABLED"];
const REPORT = "QA's live test, Ask Bubbles round 7 (9 Nov 2026 13:15Z): Details changed, Other and the Date did not";

async function onDraft(t: ReplayContext, reading: unknown, revised: string) {
  vi.setSystemTime(new Date("2026-11-09T13:15:00Z"));
  t.directory(REFUSAL_ROSTER);
  t.as("location_manager", WEST_DODGE);
  if (reading) t.patchReads!({ [SAID]: reading as never });
  const thread = t.thread();
  await thread.say("create a coaching form for Ottoline Ormsworth, she missed the monthly meeting on 10/10/26");
  t.draftWrites({ coaching_details: DETAILS, other_topic: "Missed monthly meeting" }, { coaching_topics: ["other"] });
  const id = await thread.create();
  const before = savedForm(t, id);
  const valuesBefore = { ...t.values(id) };
  t.revisionWrites({ coaching_details: revised });
  const reply = await thread.say(SAID);
  return { id, reply, before, valuesBefore };
}

function together(reading: unknown) {
  return async (t: ReplayContext) => {
    const { id, reply, valuesBefore } = await onDraft(t, reading, DESK);
    const saved = t.values(id);
    expect(saved.coaching_details ?? "", `Details:\n${reply.content}`).toMatch(/front desk unattended on 11\/6\/26/);
    expect(saved.other_topic ?? "", `Other:\n${reply.content}`).toMatch(/front desk/i);
    expect(saved.form_date, `the Date:\n${reply.content}`).toBe("2026-11-06");
    for (const [key, value] of Object.entries(valuesBefore)) {
      if (!["coaching_details", "other_topic", "form_date"].includes(key)) expect(saved[key], `${key} changed`).toBe(value);
    }
  };
}

export const NOV9_MADE_ABOUT_ALL_OR_NOTHING_CASES: ReplayCase[] = [
  {
    id: "nov9-made-about-all-or-nothing-no-reading",
    title: "the reader reads nothing (the live shape): Other, the Date and Details change together",
    report: REPORT,
    status: { open: "Details changes alone; Other stays \"Missed monthly meeting\" and the Date 2026-10-10" },
    fixFlags: FIX,
    run: together(undefined),
  },
  {
    id: "nov9-made-about-all-or-nothing-other-form",
    title: "the reader reads another form's turn: Other, the Date and Details change together",
    report: REPORT,
    status: { open: "Details changes alone; Other stays \"Missed monthly meeting\" and the Date 2026-10-10" },
    fixFlags: FIX,
    run: together(patch("other", [])),
  },
  {
    id: "nov9-made-about-all-or-nothing-refused",
    title: "the reader reads nothing and the revision's account is refused: nothing is saved, and the reply says so",
    report: `${REPORT} (the condition: one of them not written, none written)`,
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      const { id, reply, before } = await onDraft(t, undefined, "REWRITTEN");
      expect(savedForm(t, id), `the saved form changed:\n${reply.content}`).toBe(before);
      expect(reply.content, `the reply says the form changed:\n${reply.content}`).not.toMatch(/^Updated the|^Changed /m);
    },
  },
];
