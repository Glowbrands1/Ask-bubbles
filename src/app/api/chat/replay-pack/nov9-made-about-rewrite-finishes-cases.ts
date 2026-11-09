import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { REFUSAL_ROSTER, patch } from "./nov7-step-b-refusals-scenarios";

/**
 * ============================================================================
 * ONCE THE ACCOUNT IS REWRITTEN, THE MADE-ABOUT TURN FINISHES (ported from the sibling app's live round-13 test, 9 Nov 2026)
 * ============================================================================
 *
 * QA's live test there (the person invented here): on a saved Coaching draft about the missed monthly meeting on
 * 10/10/26, "make it about leaving the front desk unattended on 11/6/26" answered "Updated the Coaching Form for …:
 * Details of Coaching. Everything else on the form is as it was." Only Details changed (its Going Forward gone); Other
 * and the Date stayed. The live trace had two revision calls: the made-about path's revision rewrote Details, then the
 * reader's own edits were refused, the turn left the patch path, and the old path's revision ran again. This app has the
 * same path (MADE_ABOUT_ALL_OR_NOTHING and MADE_ABOUT_READER_ACCOUNT on). A refused reader edit (one that would blank
 * Other) is the scripted shape that gives that form and reply. MADE_ABOUT_REWRITE_FINISHES_ENABLED (`forms/form-patch-turn.ts`).
 */
const SAID = "make it about leaving the front desk unattended on 11/6/26";
const DETAILS = "Observed:\nOttoline Ormsworth missed the monthly meeting on 10/10/26.\n\nExpectation:\nOttoline is expected to attend every scheduled meeting.\n\nGoing Forward:\nOttoline will attend every meeting.";
const DESK = "Observed:\nOttoline Ormsworth left the front desk unattended on 11/6/26.\n\nExpectation:\nOttoline is expected to keep the front desk covered at all times.";
const OTHER = { field: "other_topic", value: "Leaving the front desk unattended", how: "replace", evidence: "leaving the front desk unattended" } as const;
const DET = { field: "coaching_details", value: DESK, how: "replace", evidence: "leaving the front desk unattended on 11/6/26" } as const;
const FIX = ["MADE_ABOUT_REWRITE_FINISHES_ENABLED"];
const REPORT = "Ported from the sibling app: QA's live round-13 test there (9 Nov 2026): only Details changed, Other and the Date stayed";

async function onDraft(t: ReplayContext, reading: unknown, beforeTurn?: (t: ReplayContext) => void) {
  vi.setSystemTime(new Date("2026-11-09T22:00:00Z"));
  t.directory(REFUSAL_ROSTER);
  t.as("location_manager", WEST_DODGE);
  t.patchReads!({ [SAID]: reading as never });
  const thread = t.thread();
  await thread.say("create a coaching form for Ottoline Ormsworth, she missed the monthly meeting on 10/10/26");
  t.draftWrites({ coaching_details: DETAILS, other_topic: "Missed monthly meeting" }, { coaching_topics: ["other"] });
  const id = await thread.create();
  t.revisionWrites({ coaching_details: DESK });
  beforeTurn?.(t);
  const revisionsBefore = t.calls().revision;
  const reply = await thread.say(SAID);
  return { id, reply, revisions: t.calls().revision - revisionsBefore };
}

function allThree(reading: unknown) {
  return async (t: ReplayContext) => {
    const { id, reply, revisions } = await onDraft(t, reading);
    const saved = t.values(id);
    expect(saved.form_date, `the Date:\n${reply.content}`).toBe("2026-11-06");
    expect(saved.other_topic ?? "", `Other:\n${reply.content}`).toMatch(/front desk/i);
    expect(saved.coaching_details ?? "", `Details:\n${reply.content}`).toMatch(/front desk unattended on 11\/6\/26/);
    expect(reply.content, `the reply does not say the Date changed:\n${reply.content}`).toMatch(/Changed Date to/);
    expect(revisions, "the old path's revision ran a second time").toBe(1);
  };
}

export const NOV9_MADE_ABOUT_REWRITE_FINISHES_CASES: ReplayCase[] = [
  {
    id: "nov9-made-about-rewrite-finishes-reader-refused",
    title: "the live shape: Details rewritten, then the reader's own edit refused — Other and the Date still written, one revision",
    report: REPORT,
    status: { open: "the refused reader edit hands the turn to the old path after the rewrite: only Details changes" },
    fixFlags: FIX,
    run: allThree(patch("this_form", [{ ...OTHER, value: "" }, DET])),
  },
  {
    id: "nov9-made-about-rewrite-finishes-details-only",
    title: "the reader sets Details only (set aside): Other is read from the manager's words, with the Date",
    report: `${REPORT} (the reader's Details-only shape)`,
    status: { open: "a dated made-about turn whose reader set only Details leaves Other on the old topic" },
    fixFlags: FIX,
    run: allThree(patch("this_form", [DET])),
  },
  {
    id: "nov9-made-about-rewrite-finishes-error-after-rewrite",
    title: "a save fails after Details is rewritten: the old path never runs again, and the reply says Other and the Date were not saved",
    report: `${REPORT} (the catch-all after the rewrite)`,
    status: { open: "an error after the rewrite returns null: the old path's revision runs again and the reply is its own" },
    fixFlags: FIX,
    async run(t) {
      const { id, reply, revisions } = await onDraft(t, patch("this_form", [OTHER, DET]), (ctx) => ctx.failSavesOf!("other_topic"));
      const saved = t.values(id);
      expect(saved.coaching_details ?? "", `Details:\n${reply.content}`).toMatch(/front desk unattended on 11\/6\/26/);
      expect(revisions, "the old path's revision ran a second time").toBe(1);
      expect(reply.content, `the reply does not say what was not saved:\n${reply.content}`).toMatch(/couldn't save the change to .*\*\*Other\*\*/);
      expect(reply.content, `the reply does not say the Date was not saved:\n${reply.content}`).toMatch(/couldn't save the change to .*\*\*Date\*\*/);
      expect(saved.form_date, "the Date changed although the reply says it was not saved").toBe("2026-10-10");
    },
  },
];
