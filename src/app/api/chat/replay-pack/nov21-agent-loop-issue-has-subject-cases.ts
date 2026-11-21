import { expect, vi } from "vitest";

import type { ChatFormProposal } from "@/types";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * THE CARD'S ISSUE LINE IS A SENTENCE ABOUT THE PERSON (QA's live re-test of the loop, 21 Nov 2026, A5)
 * ============================================================================
 *
 * QA (Pau's account, loop on): "Card issue line has no subject: "Opening store late on 10-1-26."" for "create verbal ca
 * for <name> for opening store late on 10-1-26. previous coaching is jba policy manual 1-1-26. payroll deduct DOES apply
 * and state $25 will be payroll deducted". Expected: "<First> opened the store late on 10/1/26." The live model put the
 * request's for-clause in what_happened as typed. propose_form now hands a subjectless account back
 * (`account_no_subject`, `card-account.ts`), and writes a dashed date as the issue line writes dates. The stand-in sends
 * the for-clause first, as the live model did, and writes the sentence again when handed it back. Fenna Prewitt is
 * invented (`loop-roster.ts`).
 */

const REPORT = "QA's live re-test (21 Nov 2026, A5, loop on): \"Card issue line has no subject: \\\"Opening store late on 10-1-26.\\\"\"";
const SAID = "create verbal ca for fenna prewitt for opening store late on 10-1-26. previous coaching is jba policy manual 1-1-26. payroll deduct DOES apply and state $25 will be payroll deducted";

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-21T18:40:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", WEST_DODGE);
}

const proposals = (view: LoopView) => view.results.filter((result) => result.tool === "propose_form").map((result) => result.output);

/** The live model's account first; handed back `account_no_subject`, the sentence with the first name as its subject. */
const liveModel = () =>
  loopStandIn((view): LoopDecision => {
    const handedBack = proposals(view).some((output) => output.reason_code === "account_no_subject");
    if (!lastResult(view, "propose_form") || (handedBack && !proposals(view).some((output) => output.card))) {
      return {
        tool: "propose_form",
        input: {
          template_key: "dpoa",
          employee_name: "fenna prewitt",
          person_evidence: evidenceFrom(view, "fenna prewitt"),
          warning_level: "verbal",
          level_evidence: evidenceFrom(view, "verbal"),
          what_happened: handedBack ? "Fenna opened the store late on 10-1-26." : "Opening store late on 10-1-26.",
          incident_date: "2026-10-01",
        },
      };
    }
    return { text: "Here's the Corrective Action Form for **Fenna**." };
  });

export const NOV21_AGENT_LOOP_ISSUE_HAS_SUBJECT_CASES: ReplayCase[] = [
  {
    id: "nov21-agent-loop-issue-line-has-subject",
    title: `"${SAID}": the model sends "Opening store late on 10-1-26."; the card's issue line is "Fenna opened the store late on 10/1/26."`,
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      const model = liveModel();
      t.loopModel!(model);
      const reply = await t.thread().say(SAID);
      const card = reply.formProposal as ChatFormProposal | undefined;
      expect(card, "no card was made (the case proves nothing)").toBeTruthy();
      expect(card?.issue, `the issue line:\n${card?.issue}`).toBe("Fenna opened the store late on 10/1/26.");
      expect(model.views.flatMap(proposals).some((output) => output.reason_code === "account_no_subject"), "the subjectless account was never handed back").toBe(true);
    },
  },
];
