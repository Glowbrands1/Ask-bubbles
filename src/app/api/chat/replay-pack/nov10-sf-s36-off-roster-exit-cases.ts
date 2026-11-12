import { expect } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * sf-s36's OTHER HALF: AN OFF-ROSTER NAME IN THE SAME WORDING (QA, 10 Nov 2026)
 * ============================================================================
 *
 * Ported from the sibling app (QA ran its nov7-sf-s36 on its main e9b3f32d): with production's flags the reply asks "Who is this form for?" and the typed
 * name is dropped, not even offered as an off-roster name. A manager whose employee really is not on the roster would
 * loop the same way. sf-s36's wording, word for word, with a full name that is on no roster and near nobody on it
 * (invented): with the name set on, a store manager is asked OFF_ROSTER_ASK's "I can't find **<name>** on your roster — … reply **use
 * <name>**", and "yes" puts the name on the card, ready to create.
 */
const TYPED = "Quillon Thaddeus";
const SAID = `I need a exit for for ${TYPED} TM. Quit without notice. not fulfilling a 2 weeks notice. payroll deduction is applicable. store items were returned.`;
const NAME_SET = [
  "FORM_NAME_FROM_ROSTER_ENABLED",
  "ROSTER_NEAR_MISS_ENABLED",
  "ROSTER_NAME_IN_CANDIDATE_ENABLED",
  "ROSTER_COMPOUND_SURNAME_ENABLED",
  "ROSTER_NOT_FOUND_ANY_PHRASING_ENABLED",
  "NEAR_MISS_QUESTION_RULES_ENABLED",
  "NEAR_MISS_DETAILS_ACCEPT_ENABLED",
  "FORM_NAME_OFF_ROSTER_ASK_ENABLED",
];

export const NOV10_SF_S36_OFF_ROSTER_EXIT_CASES: ReplayCase[] = [
  {
    id: "nov10-sf-s36-off-roster-exit",
    title: "sf-s36's wording with an off-roster name near nobody: the typed name is offered (\"use <name>\"), and \"yes\" puts it on the card",
    report: "QA, 10 Nov 2026 (the sibling app's main e9b3f32d, checked here): sf-s36 with production's flags drops the typed name",
    status: { open: "the message is answered by the model, not read as an exit form request (no card)" },
    fixFlags: NAME_SET,
    // As nov7-sf-s36 here: the message is not read as a form request in replay (this app's reader stub has no
    // reader-quoted name, and "a exit for for" alone is not a form request), with and without the name set. Kept OPEN
    // as the record of the sibling's case until a live trace from this app shows the path.
    // Changed on purpose (12 Nov 2026): fixStatus removed — the fix flags hold with the name set on since QA round 17h (FORM_FOR_FOR_TYPO live).
    async run(t) {
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      t.slotsRead({ employee: TYPED, formType: "Resignation/Exit Form", formTurn: true });
      const thread = t.thread();
      const first = await thread.say(SAID);
      const offered = /reply \*\*use Quillon Thaddeus\*\*/.test(first.content);
      const seated = thread.proposal?.employeeName === TYPED;
      expect(offered || seated, `the typed name is neither offered nor on the card:\n${first.content}`).toBe(true);
      expect(first.content, `the reply only asks who:\n${first.content}`).not.toMatch(/^(?![\s\S]*Quillon)[\s\S]*Who is this form for\?/);
      if (!seated) {
        const reply = await thread.say("yes");
        expect(thread.proposal, `"yes" does not put the typed name on the card:\n${reply.content}`).toMatchObject({ employeeName: TYPED, status: "ready" });
      }
    },
  },
];
