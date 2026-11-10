import { expect, vi } from "vitest";

import { WEST_DODGE, savedForm, type ReplayCase, type ReplayContext } from "./cases";
import { REFUSAL_ROSTER, patch } from "./nov7-step-b-refusals-scenarios";

/**
 * ============================================================================
 * THE READER'S OWN EDIT OF THE ACCOUNT NEVER SKIPS THE DATE (QA's live Bubbles round-9 test, 9 Nov 2026)
 * ============================================================================
 *
 * QA's live check of round 9 (MADE_ABOUT_ALL_OR_NOTHING live; the person invented): a saved Coaching draft about the
 * missed monthly meeting on 10/10/26, "make it about leaving the front desk unattended on 11/6/26" answered "Changed Other
 * to "Leaving the front desk unattended". Changed Details of Coaching to …", and the Date stayed 2026-10-10 (the sibling
 * app, same draft and wording, changed all three). The reader set Details itself ("add": the new incident under the old
 * one), so the made-about path that writes the Date never ran. The reader's reading is scripted in that shape (and the
 * replace shape); the revision writes the new Details. MADE_ABOUT_READER_ACCOUNT_ENABLED (`forms/form-patch-turn.ts`).
 */
const SAID = "make it about leaving the front desk unattended on 11/6/26";
const DETAILS = "Observed:\nOttoline Ormsworth missed the monthly meeting on 10/10/26.\n\nExpectation:\nOttoline is expected to attend every scheduled meeting.";
const DESK = "Observed:\nOttoline Ormsworth left the front desk unattended on 11/6/26.\n\nExpectation:\nOttoline is expected to keep the front desk covered at all times.";
const OTHER = { field: "other_topic", value: "Leaving the front desk unattended", how: "replace", evidence: "leaving the front desk unattended" } as const;
const ADDED = patch("this_form", [
  OTHER,
  { field: "coaching_details", value: "Ottoline Ormsworth left the front desk unattended on 11/6/26.", how: "add", evidence: "leaving the front desk unattended on 11/6/26" },
]);
const REPLACED = patch("this_form", [
  OTHER,
  { field: "coaching_details", value: DESK, how: "replace", evidence: "leaving the front desk unattended on 11/6/26" },
]);
const FIX = ["MADE_ABOUT_READER_ACCOUNT_ENABLED"];
const REPORT = "QA's live Bubbles round-9 test (9 Nov 2026): Other and Details changed, the Date stayed 2026-10-10";

/** The live draft's account carried no date the app reads, so the reader's replace was not refused: only the Date stayed. */
const UNDATED_DETAILS = "Observed:\nOttoline Ormsworth missed the monthly meeting.\n\nExpectation:\nOttoline is expected to attend every scheduled meeting.";

async function onDraft(t: ReplayContext, reading: unknown, revised: string, details = DETAILS) {
  vi.setSystemTime(new Date("2026-11-09T16:40:00Z"));
  t.directory(REFUSAL_ROSTER);
  t.as("location_manager", WEST_DODGE);
  t.patchReads!({ [SAID]: reading as never });
  const thread = t.thread();
  await thread.say("create a coaching form for Ottoline Ormsworth, she missed the monthly meeting on 10/10/26");
  t.draftWrites({ coaching_details: details, other_topic: "Missed monthly meeting" }, { coaching_topics: ["other"] });
  const id = await thread.create();
  const before = savedForm(t, id);
  t.revisionWrites({ coaching_details: revised });
  const reply = await thread.say(SAID);
  return { id, reply, before };
}

function together(reading: unknown, details = DETAILS) {
  return async (t: ReplayContext) => {
    const { id, reply } = await onDraft(t, reading, DESK, details);
    const saved = t.values(id);
    expect(saved.form_date, `the Date:\n${reply.content}`).toBe("2026-11-06");
    expect(saved.other_topic ?? "", `Other:\n${reply.content}`).toMatch(/front desk/i);
    expect(saved.coaching_details ?? "", `Details:\n${reply.content}`).toMatch(/front desk unattended on 11\/6\/26/);
    expect(saved.coaching_details ?? "", `Details still about the meeting:\n${reply.content}`).not.toMatch(/monthly meeting/);
    expect(reply.content, `the reply does not say the Date changed:\n${reply.content}`).toMatch(/Changed Date to/);
  };
}

export const NOV9_MADE_ABOUT_READER_ACCOUNT_CASES: ReplayCase[] = [
  {
    id: "nov9-made-about-reader-account-added",
    title: "the reader adds the new incident to Details and sets Other (the live shape): Other, the Date and Details together",
    report: REPORT,
    status: { open: "Other and Details (the new incident added under the old) change; the Date stays 2026-10-10" },
    fixFlags: FIX,
    run: together(ADDED),
  },
  {
    id: "nov9-made-about-reader-account-replaced",
    title: "the reader replaces Details and sets Other: Other, the Date and Details together, never refused for the old date",
    report: `${REPORT} (the reader's replace shape)`,
    status: { open: "nothing is saved: the reader's Details drops 10/10/26 and the write is refused" },
    fixFlags: FIX,
    run: together(REPLACED),
  },
  {
    id: "nov9-made-about-reader-account-replaced-live",
    title: "the live shape (QA's read of the saved draft): the reader replaces Details and sets Other on an account with no date the app reads — the Date is written too",
    report: `${REPORT} (QA's live read: Details fully rewritten, Other changed, the Date stayed)`,
    status: { open: "Other and Details change; the Date stays 2026-10-10" },
    fixFlags: FIX,
    run: together(REPLACED, UNDATED_DETAILS),
  },
  {
    id: "nov9-made-about-reader-account-refused",
    title: "the reader adds to Details and the revision's account is refused: nothing is saved, and the reply says so",
    report: `${REPORT} (the condition: all three, or none)`,
    status: { open: "Other and the added sentence are saved, the Date stays" },
    fixFlags: FIX,
    async run(t) {
      const { id, reply, before } = await onDraft(t, ADDED, "REWRITTEN");
      expect(savedForm(t, id), `the saved form changed:\n${reply.content}`).toBe(before);
      expect(reply.content, `the reply says the form changed:\n${reply.content}`).not.toMatch(/^Updated the|^Changed /m);
    },
  },
];
