import { expect, vi } from "vitest";

import { type DirectoryRow, type ReplayCase } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * "DID YOU MEAN <P>?" IS NOT ASKED AGAIN ONCE THE CARD IS <P>'S (QA's live round-2 re-run on production f9461c1, 22 Nov
 * 2026, U35(a))
 * ============================================================================
 *
 * An assistant manager at Grand Island, the tester's chat word for word (typos rebuilt the same way: "Vagras", "moerno"
 * are swaps, "Loreno" a changed first letter). The person, invented by the tester: Liesl Moreno Vargas (a two-word surname),
 * Team Member PT at Grand Island. Live, the same "Did you mean <P>?" was asked at T3, T5 and T6 after T4 had already put
 * <P> on the card. With AGENT_LOOP_LIVE=1 the real model plays every turn.
 */

const REPORT = "QA's live round-2 re-run (22 Nov 2026, U35(a)): the same \"Did you mean <P>?\" was re-asked at T3, T5 and T6 after T4 switched the card to <P>";
const LIESL: DirectoryRow = { id: "e-liesl-moreno-vargas", firstName: "Liesl", lastName: "Moreno Vargas", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-236"], positionName: "Team Member Part Time" };
const GRAND_ISLAND = { level: "location", primaryAreaId: "loc-236", alsoCoversAreaIds: [] };
export const U35_TURNS = [
  "tell me how to make foaming hand soap with ingredinet measurements",
  "i have an employee, Liesl Moreno Vagras that needs a corrective action form with a customer complaint",
  "verbal warning, no payroll deduct, part-time team member,",
  "fix her last name vargas",
  "make that update",
  "under the employee line the name is supposed to be liesl moerno vargas",
  "redo liesl moreno vargas",
  "make that change to Liesl Loreno Vargas",
  "okay the correct way is Liesl Moreno Vargas",
  "can i review the card",
  "Create a Corrective Action Form from this conversation.",
  "it was a customer complaint about the experience with Liesl",
] as const;

const users = (view: LoopView) => view.turns.filter((turn) => turn.role === "user").length;

export const NOV22_AGENT_LOOP_U35A_DID_YOU_MEAN_ONCE_CASES: ReplayCase[] = [
  {
    id: "nov22-u35a-did-you-mean-not-repeated-after-card",
    title: "U35(a) verbatim (T1–T12, Grand Island assistant manager, \"Liesl Moreno Vagras\"): from T4 \"fix her last name vargas\" (the typo corrected to the offered name) on, the card is Liesl Moreno Vargas's and no reply asks \"Did you mean **Liesl Moreno Vargas**?\" again",
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
      t.directory([...LOOP_STAFF, LIESL]);
      t.as("assistant_manager", GRAND_ISLAND);
      /* The stand-in: the card from T2 on, proposed with the name as the manager last typed it (the live model's habit). */
      t.loopModel!(loopStandIn((view): LoopDecision => {
        const turn = users(view);
        const result = lastResult(view, "propose_form") as { card?: unknown; ask_exactly?: string; reason_code?: string } | null;
        if (result) return { text: result.card ? "Here's the Corrective Action Form for **Liesl**." : (result.ask_exactly ?? "ok") };
        if (turn === 1) return { text: "Here's how to make foaming hand soap." };
        const said = view.turns.filter((entry) => entry.role === "user").at(-1)!.text;
        /* The name as the manager last typed it; a turn naming nobody re-proposes T2's spelling (the worst case). */
        const typed = /liesl [a-z]+ [a-z]+/i.exec(said)?.[0] ?? "Liesl Moreno Vagras";
        return { tool: "propose_form", input: { template_key: "dpoa", employee_name: typed, person_evidence: evidenceFrom(view, typed, /liesl/i.test(said) ? 0 : turn - 2), what_happened: "A customer complained about the experience with Liesl." } };
      }));
      const thread = t.thread();
      const replies: { turn: number; text: string; card: string | null }[] = [];
      for (const [index, said] of U35_TURNS.entries()) {
        const reply = await thread.say(said);
        replies.push({ turn: index + 1, text: reply.content, card: (thread.proposal as { employeeName?: string } | null)?.employeeName ?? null });
      }
      /*
       * Live (main, 22 Nov 2026), the question was asked at T2 and again at T3–T6, though T4 "fix her last name vargas" is
       * the manager's correction of the typo to the offered name; the tester's run had the card switched at T4 and asked
       * again at T5/T6. From T4 on, the question is settled either way.
       */
      const askedAgain = replies.slice(3).filter((entry) => /Did you mean \*\*Liesl Moreno Vargas\*\*\?/.test(entry.text));
      expect(askedAgain.map((entry) => `T${entry.turn}: ${entry.text}`), "the same Did-you-mean was asked again after T4's correction").toEqual([]);
      expect(replies.slice(3).some((entry) => entry.card === "Liesl Moreno Vargas"), `the card never became Liesl Moreno Vargas's:\n${JSON.stringify(replies, null, 1)}`).toBe(true);
    },
  },
  {
    id: "nov22-u35a-correction-to-another-name-is-no-yes",
    title: "Control: after \"Did you mean **Liesl Moreno Vargas**?\" for \"Liesl Moreno Vagras\", \"fix her last name garcia\" (a word that does not turn the typed name into the offered one) confirms nobody: no card for Liesl Moreno Vargas",
    report: `${REPORT}; QA (22 Nov 2026): an answer whose word does not turn the typed name into the offered name seats someone the manager did not name`,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
      t.directory([...LOOP_STAFF, LIESL]);
      t.as("assistant_manager", GRAND_ISLAND);
      const model = loopStandIn((view): LoopDecision => {
        const result = lastResult(view, "propose_form") as { card?: unknown; ask_exactly?: string } | null;
        if (result) return { text: result.card ? "Here's the Corrective Action Form for **Liesl**." : (result.ask_exactly ?? "ok") };
        return { tool: "propose_form", input: { template_key: "dpoa", employee_name: "Liesl Moreno Vagras", person_evidence: evidenceFrom(view, "Liesl Moreno Vagras", users(view) - 1), what_happened: "A customer complained about the experience with Liesl." } };
      });
      t.loopModel!(model);
      const thread = t.thread();
      await thread.say(U35_TURNS[1]);
      const reply = await thread.say("fix her last name garcia");
      expect((thread.proposal as { employeeName?: string } | null)?.employeeName ?? null, reply.content).not.toBe("Liesl Moreno Vargas");
    },
  },
];
