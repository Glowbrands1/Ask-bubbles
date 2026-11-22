import { expect, vi } from "vitest";

import { type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
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

async function verbatim(t: ReplayContext, admin: boolean) {
  vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
  t.directory([...LOOP_STAFF, LIESL]);
  if (admin) t.as("admin", { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] });
  else t.as("assistant_manager", GRAND_ISLAND);
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
  const replies: { turn: number; text: string; card: string | null; issue: string | null }[] = [];
  for (const [index, said] of U35_TURNS.entries()) {
    const reply = await thread.say(said);
    replies.push({ turn: index + 1, text: reply.content, card: (thread.proposal as { employeeName?: string } | null)?.employeeName ?? null, issue: (thread.proposal as { issue?: string } | null)?.issue ?? null });
  }
  /*
   * Live (main, 22 Nov 2026), the question was asked at T2 and again at T3–T6, though T4 "fix her last name vargas" is
   * the manager's correction of the typo to the offered name; the tester's run had the card switched at T4 and asked
   * again at T5/T6. From T4 on, the question is settled either way.
   */
  const askedAgain = replies.slice(3).filter((entry) => /Did you mean \*\*Liesl Moreno Vargas\*\*\?/.test(entry.text));
  expect(askedAgain.map((entry) => `T${entry.turn}: ${entry.text}`), "the same Did-you-mean was asked again after T4's correction").toEqual([]);
  expect(replies.slice(3).some((entry) => entry.card === "Liesl Moreno Vargas"), `the card never became Liesl Moreno Vargas's:\n${JSON.stringify(replies, null, 1)}`).toBe(true);
  return replies;
}

export const NOV22_AGENT_LOOP_U35A_DID_YOU_MEAN_ONCE_CASES: ReplayCase[] = [
  {
    id: "nov22-u35a-did-you-mean-not-repeated-after-card",
    title: "U35(a) verbatim (T1–T12, Grand Island assistant manager, \"Liesl Moreno Vagras\"): from T4 \"fix her last name vargas\" (the typo corrected to the offered name) on, the card is Liesl Moreno Vargas's and no reply asks \"Did you mean **Liesl Moreno Vargas**?\" again",
    report: REPORT,
    status: "fixed",
    async run(t) {
      await verbatim(t, false);
    },
  },
  {
    id: "nov22-u35a-admin-close-spelling-of-card-person-not-asked",
    title: "U35a (coder 5's live triage on 1c71e11) with Pau's admin/global login: the same twelve turns; after the card is Liesl Moreno Vargas's, T6 \"…liesl moerno vargas\" and T8 \"Liesl Loreno Vargas\" (close spellings of the card's person) never ask \"Did you mean\" again, and the card's Observation is never lost",
    report: "Coder 5's live triage (1c71e11, 22 Nov 2026), u35a: T6 and T8 re-asked \"Did you mean **<P>**?\" for the confirmed person, and in one run T6's card lost its Observation",
    status: "fixed",
    async run(t) {
      const replies = await verbatim(t, true);
      const firstCard = replies.findIndex((entry) => entry.card === "Liesl Moreno Vargas");
      expect(firstCard, `the card never became Liesl Moreno Vargas's:\n${JSON.stringify(replies, null, 1)}`).toBeGreaterThanOrEqual(0);
      const after = replies.slice(firstCard + 1);
      expect(after.filter((entry) => /Did you mean \*\*/.test(entry.text)).map((entry) => `T${entry.turn}: ${entry.text}`), "asked again for the card's own person").toEqual([]);
      const firstIssue = replies.findIndex((entry) => (entry.issue ?? "") !== "");
      if (firstIssue >= 0) expect(replies.slice(firstIssue).filter((entry) => entry.card !== null && (entry.issue ?? "") === "").map((entry) => `T${entry.turn}`), "the card's Observation was lost").toEqual([]);
    },
  },
  {
    id: "nov22-u35a-confirmed-person-new-close-spelling-not-asked",
    title: "u35a (coder 5's live run 2 on 1c71e11, Grand Island assistant manager; T3 left out): T4 \"fix her last name vargas\" confirms Liesl Moreno Vargas with no card yet; T6 \"…liesl moerno vargas\" and T8 \"Liesl Loreno Vargas\" (new close spellings) never ask \"Did you mean\" again",
    report: "Coder 5's live run 2 (1c71e11, 22 Nov 2026), u35a: after T4's confirmation, T6 and T8 each got the full \"Did you mean **<P>**?\" again",
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
      t.directory([...LOOP_STAFF, LIESL]);
      t.as("assistant_manager", GRAND_ISLAND);
      /* As the live model did: find_staff with the name as the manager last typed it, and no card (no account yet). */
      t.loopModel!(loopStandIn((view): LoopDecision => {
        const result = lastResult(view, "find_staff") as { ask_exactly?: string } | null;
        if (result) return { text: result.ask_exactly ?? "Thanks. What happened with the customer complaint?" };
        const said = view.turns.filter((entry) => entry.role === "user").at(-1)!.text;
        const typed = /liesl [a-z]+ [a-z]+/i.exec(said)?.[0] ?? (/vargas/i.test(said) ? "Liesl Moreno Vargas" : null);
        if (!typed) return { text: "What happened with the customer complaint?" };
        return { tool: "find_staff", input: { name: typed, ...(/liesl/i.test(said) ? { person_evidence: evidenceFrom(view, typed) } : {}) } };
      }));
      const thread = t.thread();
      const replies: string[] = [];
      /*
       * Live, T3 asked T2's question again and T4 answered it. Here T3 is left out, so T4 "fix her last name vargas" answers
       * T2's question (a correction to the offered name: the person is confirmed), as it did live.
       */
      const turns = [U35_TURNS[1], ...U35_TURNS.slice(3, 8)];
      for (const said of turns) replies.push((await thread.say(said)).content);
      expect(replies[0], "T2 never asked (the case proves nothing)").toMatch(/Did you mean \*\*Liesl Moreno Vargas\*\*\?/);
      expect(replies[1], "T4 did not confirm the person (the case proves nothing)").not.toMatch(/Did you mean/);
      const again = replies.slice(2).map((text, at) => `T${at + 5}: ${text}`).filter((text) => /Did you mean \*\*/.test(text));
      expect(again, "asked again after T4 confirmed the person").toEqual([]);
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
  {
    id: "nov22-u35a-card-account-uses-settled-name",
    title: "U35(a) follow-up: once \"fix her last name vargas\" settled Liesl Moreno Vargas, the card's account never keeps the misspelling the model copied (\"Liesl Vagras\")",
    report: `${REPORT}; QA (22 Nov 2026): in an admin live run the T3 card's account read "Liesl Vagras" after the name was settled`,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
      /* An admin sees every store: another staff member elsewhere has a name close to the misspelling (invented: Liesel Varga). */
      t.directory([...LOOP_STAFF, LIESL, { id: "e-liesel-varga", firstName: "Liesel", lastName: "Varga", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-67"], positionName: "Team Member Part Time" }]);
      t.as("admin", { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] });
      t.loopModel!(loopStandIn((view): LoopDecision => {
        const result = lastResult(view, "propose_form") as { card?: unknown; ask_exactly?: string } | null;
        if (result) return { text: result.card ? "Here's the Corrective Action Form for **Liesl**." : (result.ask_exactly ?? "ok") };
        /* As the live model wrote it: the account with the manager's misspelling, first and last word. */
        return { tool: "propose_form", input: { template_key: "dpoa", employee_name: "Liesl Moreno Vagras", person_evidence: evidenceFrom(view, "Liesl Moreno Vagras", users(view) - 1), what_happened: "Liesl Vagras received a customer complaint about the experience with her.", location: "Grand Island" } };
      }));
      const thread = t.thread();
      await thread.say(U35_TURNS[1]);
      await thread.say(U35_TURNS[3]);
      /* The tester's T12: the account, so the card is made (the live model asks what happened before that). */
      const reply = await thread.say(U35_TURNS[11]);
      const card = thread.proposal as { employeeName?: string; issue?: string } | null;
      expect(card?.employeeName, `the name was not settled (the case proves nothing):\n${reply.content}`).toBe("Liesl Moreno Vargas");
      expect(String(card?.issue ?? ""), `the card's account keeps the misspelling:\n${reply.content}`).not.toMatch(/Vagras/i);
    },
  },
];
