import { expect, vi } from "vitest";

import { WEST_DODGE, replyMatchesDiff, savedForm, type ReplayCase, type ReplayContext } from "./cases";
import { REFUSAL_ROSTER, STEP_B_READER_FLAGS, patch } from "./nov7-step-b-refusals-scenarios";

/**
 * ============================================================================
 * "MAKE IT ABOUT … MAKE THE DATE FOR 10/14/26": THE DATE IS WRITTEN, AND THE REPLY SAYS DETAILS WAS KEPT (round 6)
 * ============================================================================
 *
 * The Bubbles round-5 gate (8 Nov 2026): with STEP_B_DATE_SAID and STEP_B_MAKE_IT_ABOUT_ACCOUNT both on, QA's live
 * turn "I need you to make it about showing up late and please list the policy make the date for 10/14/26" was handed
 * to the old path (the reader set only the topic), and the Date stayed 2026-10-10. QA's ruling (option A): the turn
 * stays on Step B, the topic and the date are written, and the reply says plainly that Details was kept, since Step B
 * cannot write new account text the reader did not give. STEP_B_DATE_WITH_ABOUT_ENABLED (`forms/form-patch-turn.ts`).
 * The live reading is scripted (the topic and its box); the person is invented.
 */
const SAID = "I need you to make it about showing up late and please list the policy make the date for 10/14/26";
const BOTH = [...STEP_B_READER_FLAGS, "EDIT_POLICY_ASK_ENABLED", "STEP_B_DATE_SAID_ENABLED", "STEP_B_MAKE_IT_ABOUT_ACCOUNT_ENABLED"];
const REPORT = "The Bubbles round-5 gate (8 Nov 2026): STEP_B_DATE_SAID + STEP_B_MAKE_IT_ABOUT_ACCOUNT left the Date at 10/10";
const TOPIC = patch("this_form", [
  { field: "other_topic", value: "Showing up late", how: "replace", evidence: "showing up late" },
  { field: "coaching_topics", options: ["other"], how: "replace", evidence: "make it about showing up late" },
]);

async function onDraft(t: ReplayContext, said: string) {
  vi.setSystemTime(new Date("2026-11-07T15:00:00Z"));
  t.directory(REFUSAL_ROSTER);
  t.as("location_manager", WEST_DODGE);
  t.patchReads!({ [said]: TOPIC });
  const thread = t.thread();
  await thread.say("create a coaching form for Ottoline Ormsworth, she missed the monthly meeting on 10/10/26");
  t.draftWrites({ coaching_details: "Observed:\nOttoline Ormsworth missed the monthly meeting on 10/10/26.\n\nExpectation:\nOttoline attends every scheduled meeting." });
  const id = await thread.create();
  const before = savedForm(t, id);
  const reply = await thread.say(said);
  replyMatchesDiff(t, id, before, reply, said);
  return { id, reply };
}

export const NOV8_STEP_B_DATE_WITH_ABOUT_CASES: ReplayCase[] = [
  {
    id: "nov8-step-b-date-with-about",
    title: "both flags on, the gate's turn: the Date is 10/14/2026, the topic is set, and the reply says the date changed and Details was kept",
    report: REPORT,
    status: { open: "the Date stays 2026-10-10 (the turn is handed to the old path)" },
    fixFlags: [...BOTH, "STEP_B_DATE_WITH_ABOUT_ENABLED"],
    async run(t) {
      const { id, reply } = await onDraft(t, SAID);
      expect(t.values(id).form_date, `the Date the manager said:\n${reply.content}`).toBe("2026-10-14");
      expect(t.values(id).other_topic ?? "", "the reader's topic").toMatch(/late/i);
      expect(reply.content, `the reply does not say the Date changed:\n${reply.content}`).toMatch(/Changed Date to/);
      expect(reply.content, `the reply does not say Details was kept:\n${reply.content}`).toMatch(/I kept \*\*Details of Coaching\*\* as it was/);
    },
  },
  {
    id: "nov8-step-b-date-with-about-no-date",
    title: "negative: \"I need you to make it about showing up late\" (no date): still handed to the old path, as STEP_B_MAKE_IT_ABOUT_ACCOUNT does",
    report: `${REPORT} (the condition: only a turn that also says the date stays on Step B)`,
    status: "fixed",
    fixFlags: [...BOTH, "STEP_B_DATE_WITH_ABOUT_ENABLED"],
    async run(t) {
      t.revisionWrites({ coaching_details: "Observed:\nOttoline Ormsworth showed up late.\n\nExpectation:\nOttoline arrives on time for every shift." });
      const { reply } = await onDraft(t, "I need you to make it about showing up late");
      expect(reply.content, `the reply says Details was kept on a turn with no date:\n${reply.content}`).not.toMatch(/I kept \*\*Details of Coaching\*\*/);
    },
  },
];
