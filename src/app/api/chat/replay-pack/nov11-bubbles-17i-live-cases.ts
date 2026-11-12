import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext, type ReplayThread } from "./cases";
import { REFUSAL_ROSTER } from "./nov7-step-b-refusals-scenarios";

/**
 * ============================================================================
 * QA's BUBBLES 17i LIVE TEST (main c6063f2c, 11 Nov 2026)
 * ============================================================================
 *
 * One chat, the manager's turns as typed (chat_traces, 23:37Z; the employee invented, on the pack's roster):
 *   1. "my team member keeps showing up out of uniform, wearing a hoodie, what do I do?" — ended "… I can prepare one of
 *      the forms below." with no forms below it (FORMS_BELOW_NEEDS_FORMS_ENABLED, the turn's last step);
 *   2. "can you make a CA for <C> for wearing a hoodie to work?" — a Corrective Action card with no Policy line, its plan
 *      on "the applicable company policy" (WORN_CLOTHING_IS_DRESS_CODE_ENABLED);
 *   3. "Do i need to copy and paste it?" — answered as if there were no card: "say 'create a corrective action for <C>'
 *      and the form card will appear" (COPY_PASTE_POINTS_TO_CARD_ENABLED).
 */
const REPORT = "QA's Bubbles 17i live test, 11 Nov 2026";

/** The manual's Dress Code section, as `nov10-not-following-dress-code-cases.ts` has it. */
const DRESS_CODE_CHUNK = {
  chunkIndex: 44,
  chunkId: "jba-44",
  locator: "Page 15 — Dress Code for The Company",
  page: 16,
  content:
    "Dress Code for The Company\nThe Company Employees are to keep a neat, clean, professional appearance at all times. Anyone\nviolating their Brand’s Dress code policy will be sent home to change into proper work attire.",
  section: "Dress Code for The Company",
  printedPage: 15,
  sections: [
    { heading: "Dress Code for The Company", page: 15 },
    { heading: "All Locations Dress Code", page: 15 },
  ],
};

const TURN_1 = "my team member keeps showing up out of uniform, wearing a hoodie, what do I do?";
const TURN_2 = "can you make a CA for Marnie Holloway for wearing a hoodie to work?";
const TURN_3 = "Do i need to copy and paste it?";

function start(t: ReplayContext): ReplayThread {
  vi.setSystemTime(new Date("2026-11-11T23:37:00Z"));
  t.directory(REFUSAL_ROSTER);
  t.as("location_manager", WEST_DODGE);
  t.manualAlsoHas?.([DRESS_CODE_CHUNK]);
  return t.thread();
}

/** "… one of the forms below." only with forms below it. */
function formsBelowHasForms(answer: { content: string }): void {
  const offered = Boolean((answer as { formSelection?: unknown }).formSelection);
  if (/one of the forms below/.test(answer.content)) expect(offered, `"the forms below" with no forms:\n${answer.content}`).toBe(true);
}

export const NOV11_BUBBLES_17I_LIVE_CASES: ReplayCase[] = [
  {
    id: "nov11-17i-forms-below-has-forms",
    title: "the hoodie chat: a reply that says \"one of the forms below\" carries forms",
    report: REPORT,
    // The pack's turns carry their forms today; the live gap was not reproduced here. The guard holds it either way.
    status: "fixed",
    fixFlags: ["FORMS_BELOW_NEEDS_FORMS_ENABLED"],
    async run(t) {
      const thread = start(t);
      for (const turn of [TURN_1, TURN_2, TURN_3]) formsBelowHasForms(await thread.say(turn));
    },
  },
  {
    id: "nov11-17i-hoodie-ca-dress-code",
    title: "\"can you make a CA for <C> for wearing a hoodie to work?\": the card's Policy is the Dress Code",
    report: REPORT,
    status: { open: "the card has no Policy line; the plan says \"the applicable company policy\"" },
    fixFlags: ["WORN_CLOTHING_IS_DRESS_CODE_ENABLED"],
    async run(t) {
      const reply = await start(t).say(TURN_2);
      expect(reply.content, reply.content).toMatch(/\*\*Policy:\*\* Dress Code/);
      // QA's Bubbles 17m live test (12 Nov 2026): the read-from-request Dress Code line carries its printed page, as a
      // named policy's line does.
      expect(reply.content, `the Policy line has no page:\n${reply.content}`).toMatch(/\*\*Policy:\*\* Dress Code \(JBA Policy Manual p\.15\)/);
      expect(reply.content, reply.content).not.toMatch(/review the applicable company policy/);
    },
  },
  {
    id: "nov11-17i-copy-paste-points-to-card",
    title: "\"Do i need to copy and paste it?\" with the card on screen: the reply points to the card's Create draft",
    report: REPORT,
    status: { open: "the reply answers as if there were no card, with a form menu under it" },
    fixFlags: ["COPY_PASTE_POINTS_TO_CARD_ENABLED"],
    async run(t) {
      const thread = start(t);
      await thread.say(TURN_2);
      expect(thread.proposal, "no Corrective Action card for Marnie Holloway").toMatchObject({ templateKey: "dpoa", employeeName: "Marnie Holloway" });
      const reply = await thread.say(TURN_3);
      expect(reply.content, reply.content).toMatch(/Create draft/);
      expect(reply.content, reply.content).not.toMatch(/form card will appear|one of the forms below/i);
      expect(reply.formProposal, "the card is no longer on the reply").toMatchObject({ templateKey: "dpoa", employeeName: "Marnie Holloway" });
    },
  },
];
