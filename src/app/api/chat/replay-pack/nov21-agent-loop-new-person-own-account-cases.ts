import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_FENNA, LOOP_OZREN, LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * "THE SAME FOR <B>, <ACCOUNT ON A DATE>" IS A NEW REQUEST, EVEN WITHOUT new_form_evidence (port from the sibling app)
 * ============================================================================
 *
 * QA2's ruling (21 Nov 2026), ported: with CARD_PERSON_THIS_REQUEST on, a card for another person while one is open
 * needs new_form_evidence. The live model passes it for "do the same … for <B>", and this is belt-and-braces: a manager
 * message that names a roster person other than the open card's, does not name the open card's person (any of their
 * names, the first name alone included), and states its own date is that person's own request, by the records (the
 * roster and the message's dates), never a word list. A person named inside an account about the open card's person
 * ("Shift Lead, <B>, messaged <A> …") still names <A>, so it is not.
 * Invented people from the loop roster (`loop-roster.ts`): Fenna Prewitt (<A>), Ozren Brack (<B>).
 */

const NEW_FLAG = "CARD_PERSON_THIS_REQUEST_ENABLED";
const REPORT = "QA2 (21 Nov 2026, port from the sibling app): \"the same for <B>, she was late on 11/10/26\" refused without new_form_evidence";

function setup(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", WEST_DODGE);
}

const card = (employeeId: string, account: string) => ({ tool: "propose_form" as const, input: { template_key: "dpoa", employee_id: employeeId, policy: "Attendance", what_happened: account, warning_level: "verbal" } });

export const NOV21_AGENT_LOOP_NEW_PERSON_OWN_ACCOUNT_CASES: ReplayCase[] = [
  {
    id: "nov21-new-person-own-dated-account-is-a-new-request",
    title: "\"verbal ca for fenna prewitt, …\" then \"the same for ozren brack, he was late on 11/10/26\" with no new_form_evidence: Ozren's card is made",
    report: REPORT,
    status: "fixed",
    fixFlags: [NEW_FLAG],
    async run(t) {
      setup(t);
      t.loopModel!(loopStandIn((view): LoopDecision => (lastResult(view, "propose_form") ? { text: "Here is the card." } : card(LOOP_FENNA.id, "Late on 11/9/26."))));
      const thread = t.thread();
      await thread.say("verbal ca for fenna prewitt, she was 20 minutes late on 11/9/26");
      expect(thread.proposal?.employeeName, "no card for <A> (the case proves nothing)").toBe("Fenna Prewitt");
      // Ozren's card states no level of its own: this case is about whose card it is, not the level.
      const second = loopStandIn((view): LoopDecision => (lastResult(view, "propose_form") ? { text: "Here is the second card." } : { tool: "propose_form", input: { template_key: "dpoa", employee_id: LOOP_OZREN.id, policy: "Attendance", what_happened: "Late on 11/10/26." } }));
      t.loopModel!(second);
      await thread.say("the same for ozren brack, he was late on 11/10/26");
      const result = lastResult(second.views.at(-1)!, "propose_form") as { reason_code?: string } | null;
      expect(result?.reason_code, `Ozren's card was refused:\n${JSON.stringify(result).slice(0, 600)}`).toBeUndefined();
      expect((thread.proposal as { employeeName?: string } | undefined)?.employeeName).toBe("Ozren Brack");
    },
  },
  {
    id: "nov21-new-person-inside-account-about-open-person-still-refused",
    title: "Control: Fenna's card open, then \"On 11/14/26 Shift Lead, Ozren Brack, messaged Fenna Prewitt asking …\" (names Fenna too): a card for Ozren is still refused",
    report: REPORT,
    status: "fixed",
    fixFlags: [NEW_FLAG],
    async run(t) {
      setup(t);
      t.loopModel!(loopStandIn((view): LoopDecision => (lastResult(view, "propose_form") ? { text: "Here is the card." } : card(LOOP_FENNA.id, "Late on 11/9/26."))));
      const thread = t.thread();
      await thread.say("verbal ca for fenna prewitt, she was 20 minutes late on 11/9/26");
      expect(thread.proposal?.employeeName, "no card for <A> (the case proves nothing)").toBe("Fenna Prewitt");
      const second = loopStandIn((view): LoopDecision => {
        if (lastResult(view, "propose_form")) return { text: "Kept Fenna's card." };
        const made = card(LOOP_OZREN.id, "Ozren messaged Fenna.");
        return { ...made, input: { ...made.input, person_evidence: evidenceFrom(view, "Ozren Brack") } };
      });
      t.loopModel!(second);
      await thread.say("On 11/14/26 Shift Lead, Ozren Brack, messaged Fenna Prewitt asking if she forgot to clock in on 11/13/26");
      const result = lastResult(second.views.at(-1)!, "propose_form") as { reason_code?: string } | null;
      expect(result?.reason_code).toBe("person_change_not_asked");
    },
  },
];
