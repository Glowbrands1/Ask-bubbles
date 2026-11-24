import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase } from "./cases";
import { LOOP_FENNA, LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * WITH A CARD ON SCREEN, THE MODEL IS TOLD WHICH CARD IT IS (port of the sibling app's #1247, c7027d8; its 266-chat run's 011)
 * ============================================================================
 *
 * In the sibling app, with the Corrective Action card on screen, "it should be the policy for staying past shceduled
 * shift" got "Which form do you want it on, and who is it for?". This app's system block has the same bare open-card line
 * ("A card is open"). It now names the card's form (its card record's template name, never the person's name, which the
 * record does not hold) and says a message naming no other form or person is about that card, so the model never asks
 * which form or who. A prompt line: the stand-in cannot show the model's choice, so the case checks what the model is
 * shown; QA's live batch checks the reply. The manager's words keep the sibling's shape (its typos); the people are this
 * app's invented loop staff (Fenna Prewitt; Thaddea Kroll as the assistant manager).
 */

const REPORT = "Port of the sibling app's #1247 (its 266-chat run, case 011): with the CA card on screen, \"it should be the policy for staying past shceduled shift\" got \"Which form do you want it on, and who is it for?\"";
const T1 = "Make me A CA form for Fenna Prewitt for staying over her scheduled shift to do extracleaning. AGM Thaddea Kroll spoke to Fenna Prewitt on November 9 going over the policy for this. Fenna Prewitt Stsyed late again on 11/11.";
const T2 = "it should be the policy for staying past shceduled shift";

export const NOV22_AGENT_LOOP_OPEN_CARD_NAMED_CASES: ReplayCase[] = [
  {
    id: "nov22-open-card-named-in-prompt",
    title: "\"it should be the policy for staying past shceduled shift\" with the CA card on screen: the model is told the Corrective Action Form card is open and the message is about it",
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
      t.directory([...LOOP_STAFF]);
      t.as("location_manager", WEST_DODGE);
      const model = loopStandIn((view): LoopDecision => {
        if (lastResult(view, "propose_form")) return { text: "Here's the Corrective Action Form for **Fenna**." };
        if (view.turns.filter((turn) => turn.role === "user").length > 1) return { text: "Which policy do you want on the card?" };
        return { tool: "propose_form", input: { template_key: "dpoa", employee_id: LOOP_FENNA.id, person_evidence: evidenceFrom(view, "Fenna Prewitt"), what_happened: "Fenna Prewitt stayed over the scheduled shift to do extra cleaning. Fenna Prewitt stayed late again on 11/11." } };
      });
      t.loopModel!(model);
      const thread = t.thread();
      await thread.say(T1);
      expect(thread.proposal?.templateKey, "no CA card on screen (the case proves nothing)").toBe("dpoa");
      await thread.say(T2);
      const shown = model.views.at(-1)!.system;
      expect(shown, `the model is not told the card is open:\n${shown.slice(0, 600)}`).toMatch(/A card is open/);
      expect(shown, "the model is not told WHICH card is open").toMatch(/A card is open: your last reply showed the Corrective Action Form card/);
      expect(shown, "the model is not told the message is about that card").toMatch(/never ask which form it is for or who it is for/);
    },
  },
];
