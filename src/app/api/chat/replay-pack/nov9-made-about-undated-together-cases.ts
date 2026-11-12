import { expect, vi } from "vitest";

import { WEST_DODGE, savedForm, type ReplayCase, type ReplayContext } from "./cases";
import { REFUSAL_ROSTER, patch } from "./nov7-step-b-refusals-scenarios";

/**
 * ============================================================================
 * AN UNDATED "MAKE IT ABOUT …" CHANGES DETAILS AND THE TOPIC TOGETHER, OR NEITHER (QA's Sunny round-11 gate)
 * ============================================================================
 *
 * QA's gate (9 Nov 2026; the person invented): with the chain on, "I need you to make it about showing up late" (no date)
 * on a saved Coaching draft about the missed meeting rewrote Details of Coaching and left Other "Missed monthly meeting",
 * the mirror of the chain-off Other-only change. QA: the topic with Details, or neither; the Date stays (no date was
 * said), and the reply says so. MADE_ABOUT_UNDATED_TOGETHER_ENABLED (`forms/form-patch-turn.ts`).
 */
const SAID = "I need you to make it about showing up late";
const DETAILS = "Observed:\nOttoline Ormsworth missed the monthly meeting on 10/10/26.\n\nExpectation:\nOttoline is expected to attend every scheduled meeting.";
const LATE = "Observed:\nOttoline Ormsworth showed up late on 10/10/26.\n\nExpectation:\nOttoline is expected to arrive on time.";
const TOPIC = patch("this_form", [
  { field: "other_topic", value: "Showing up late", how: "replace", evidence: "showing up late" },
  { field: "coaching_topics", options: ["other"], how: "replace", evidence: "make it about showing up late" },
]);
const FIX = ["MADE_ABOUT_UNDATED_TOGETHER_ENABLED"];
const REPORT = "QA's Sunny round-11 gate (9 Nov 2026): the undated make-it-about rewrote Details and left Other on the old topic";

async function onDraft(t: ReplayContext, reading: unknown, revised: string) {
  vi.setSystemTime(new Date("2026-11-09T15:00:00Z"));
  t.directory(REFUSAL_ROSTER);
  t.as("location_manager", WEST_DODGE);
  if (reading) t.patchReads!({ [SAID]: reading as never });
  const thread = t.thread();
  await thread.say("create a coaching form for Ottoline Ormsworth, she missed the monthly meeting on 10/10/26");
  t.draftWrites({ coaching_details: DETAILS, other_topic: "Missed monthly meeting" }, { coaching_topics: ["other"] });
  const id = await thread.create();
  const before = savedForm(t, id);
  t.revisionWrites({ coaching_details: revised });
  const reply = await thread.say(SAID);
  return { id, reply, before };
}

function together(reading: unknown) {
  return async (t: ReplayContext) => {
    const { id, reply } = await onDraft(t, reading, LATE);
    const saved = t.values(id);
    expect(saved.coaching_details ?? "", `Details:\n${reply.content}`).toMatch(/showed up late/);
    expect(saved.other_topic ?? "", `Other is still the old topic:\n${reply.content}`).toMatch(/late/i);
    expect(saved.form_date, `the Date:\n${reply.content}`).toBe("2026-10-10");
    expect(reply.content, `the reply does not say the Date stays:\n${reply.content}`).toMatch(/The \*\*Date\*\* stays 2026-10-10; tell me if it should change\./);
  };
}

export const NOV9_MADE_ABOUT_UNDATED_TOGETHER_CASES: ReplayCase[] = [
  {
    id: "nov9-made-about-undated-topic",
    title: "\"I need you to make it about showing up late\", the reader reads the topic: Details and Other together, the Date stays and the reply says so",
    report: REPORT,
    status: { open: "Details is rewritten and Other stays \"Missed monthly meeting\"" },
    fixFlags: FIX,
    run: together(TOPIC),
  },
  {
    id: "nov9-made-about-undated-no-reading",
    title: "the same, the reader reads nothing: the topic from the manager's words, with Details",
    report: REPORT,
    status: { open: "Details is rewritten and Other stays \"Missed monthly meeting\"" },
    fixFlags: FIX,
    run: together(undefined),
  },
  {
    id: "nov9-made-about-undated-refused",
    title: "the same, the reader reads the topic and the revision's account is refused: neither is saved, and the reply says so",
    report: `${REPORT} (the condition: Details and the topic together, or neither)`,
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      const { id, reply, before } = await onDraft(t, TOPIC, "REWRITTEN");
      expect(savedForm(t, id), `the saved form changed:\n${reply.content}`).toBe(before);
      expect(reply.content, `the reply says the form changed:\n${reply.content}`).not.toMatch(/^Updated the|^Changed /m);
      // QA, group 4 (961ab16c): the undated topic "stays as it was", not "stays as they were".
      if (/I couldn't rewrite/.test(reply.content)) expect(reply.content).not.toMatch(/topic stays as they were/);
    },
  },
];
