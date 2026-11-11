import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * "<A> HAS SIGNED A COACHING DOCUMENT FOR …" IS HISTORY, NOT A SECOND FORM (QA's Bubbles live tester, round 4, 8 Nov 2026)
 * ============================================================================
 *
 * The manager's words (the employee invented): "Can you draw me up a CA for <A> for being late on 10/23/26. <A> has
 * signed a coaching document for being late on 10/14/26. I need you to make sure the policy is on this CA." With
 * CA_REQUEST_NOT_PRIOR_COACHING on (production since round 4) the reply was "You asked for two forms, so here are two
 * separate cards": a CA card with no Prior actions, and a Coaching Form card nobody asked for. SIGNED_STEP_NOT_A_REQUEST
 * (`forms/form-requests.ts`): one CA card, "Prior actions: Coaching — 10/14/2026", as the sibling app gives.
 */
const TAMSIN: DirectoryRow = {
  id: "e-tamsin-vale-s35",
  firstName: "Tamsin",
  lastName: "Vale",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "Team Member Part Time",
};
const SAID =
  "Can you draw me up a CA for Tamsin Vale for being late on 10/23/26. Tamsin Vale has signed a coaching document for being late on 10/14/26. I need you to make sure the policy is on this CA.";
const REPORT = "QA's Bubbles live tester, round 4 (production e7a7ba9c), 8 Nov 2026";

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-08T02:00:00Z"));
  t.directory([...STAFF, TAMSIN]);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

export const NOV8_S35_SIGNED_COACHING_IS_HISTORY_CASES: ReplayCase[] = [
  {
    id: "nov8-s35-signed-coaching-is-history",
    title: "\"… <A> has signed a coaching document for being late on 10/14/26 …\": one CA card, the coaching in Prior actions",
    report: REPORT,
    status: { open: "two cards (a CA and a Coaching Form), and the CA has no Prior actions" },
    fixFlags: ["CA_REQUEST_NOT_PRIOR_COACHING_ENABLED", "SIGNED_STEP_NOT_A_REQUEST_ENABLED"],
    async run(t) {
      const thread = start(t);
      const reply = await thread.say(SAID);
      expect(reply.content, `a second card:\n${reply.content}`).not.toMatch(/You asked for two forms|Coaching Form/);
      expect(thread.proposal, `no CA card:\n${reply.content}`).toMatchObject({ templateKey: "dpoa", employeeName: "Tamsin Vale" });
      expect(reply.content, `the signed coaching is not a prior action:\n${reply.content}`).toMatch(/\*\*Prior actions:\*\* Coaching — 10\/14\/2026/);
    },
  },
  {
    id: "nov8-s35-two-forms-still-two",
    title: "negative: \"a CA for <A> and a coaching form for <A>\" still asks for two forms",
    report: `${REPORT} (the condition)`,
    status: "fixed",
    fixFlags: ["SIGNED_STEP_NOT_A_REQUEST_ENABLED"],
    async run(t) {
      const thread = start(t);
      const reply = await thread.say("make a CA for Tamsin Vale for being late on 10/23/26 and a coaching form for Tamsin Vale for her phone use");
      expect(reply.content, `the second request was lost:\n${reply.content}`).toMatch(/Coaching Form/);
    },
  },
];
