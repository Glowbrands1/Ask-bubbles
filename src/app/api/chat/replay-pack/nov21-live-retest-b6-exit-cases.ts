import { expect, vi } from "vitest";

import { WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * QA'S LIVE RE-TEST B6 (21 Nov 2026, Pau's account, agent loop on, production 3e2c30dd): ONE EXIT CHAT, SIX TURNS
 * ============================================================================
 *
 * QA's exact wording, invented people (the repository is public): the manager first types the name the employee goes
 * by (<A>, Woven's preferred first name here), says she is in Woven under a misspelling of her legal name (<B>), then
 * settles on the legal name (<C>). The scripted model proposes the exit card for the roster person each turn, as the
 * live model did; everything else (the card's name, its ticks, the saved draft) is the app's own code.
 */
const ISOLDE: DirectoryRow = { id: "e-isolde-quennell", firstName: "Isolde", lastName: "Quennell", preferredFirstName: "Brisa", employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };

const REPORT = "QA's live re-test (21 Nov 2026, Pau's account, agent loop on, production 3e2c30dd), B6";

/** The six turns, as QA typed them (names invented). */
export const B6_TURNS = [
  "can you make me an exit form for Brisa Quennell she is in woven under Isolda Quennell. Her last day is nov 23 she is returning her key she gave 2 weeks notice and is fulfilling them. no deduction at this time",
  "yes",
  "yes it is for Isolde Quennell",
  "create the exit form for Isolde Quennell",
  "last day worked will be nov 23, notice was given last Monday, eligible for rehire, notice will be attached, leave address blank I will fill it in",
  "she is resigning due to second job I'm ready for the draft",
] as const;

/**
 * The live model: each turn, the exit card for the roster person. Its exit_evidence is the manager's latest ask for the
 * exit form (turn 1, then "create the exit form for <C>" from turn 4); its person_evidence the latest words naming her.
 */
function b6Model(view: LoopView): LoopDecision {
  if (lastResult(view, "propose_form")) return { text: "Here's the Resignation/Exit Form." };
  const turn = view.turns.filter((said) => said.role === "user").length - 1;
  const asked = turn >= 3 ? { quote: "create the exit form for Isolde Quennell", back: turn - 3 } : { quote: "can you make me an exit form for", back: turn };
  const named = turn >= 3 ? asked : turn === 2 ? { quote: "it is for Isolde Quennell", back: 0 } : { quote: "exit form for Brisa Quennell", back: turn };
  return {
    tool: "propose_form",
    input: {
      template_key: "resignation-exit", employee_id: ISOLDE.id,
      exit_evidence: { ...evidenceFrom(view, asked.quote, asked.back), kind: "asks_for_exit_form" },
      person_evidence: evidenceFrom(view, named.quote, named.back),
      what_happened: "Her last day is nov 23 she is returning her key she gave 2 weeks notice and is fulfilling them.",
    },
  };
}

/** Says every B6 turn in order; the card after each turn. */
async function sayB6(t: Parameters<ReplayCase["run"]>[0]) {
  vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
  t.directory([...LOOP_STAFF, ISOLDE]);
  t.as("location_manager", WEST_DODGE);
  const standIn = loopStandIn(b6Model);
  t.loopModel!(standIn);
  const thread = t.thread();
  const cards: (string | null | undefined)[] = [];
  const replies: string[] = [];
  for (const said of B6_TURNS) {
    const reply = await thread.say(said);
    cards.push(thread.proposal?.employeeName);
    replies.push(reply.content);
  }
  return { thread, cards, replies, standIn };
}

export const NOV21_LIVE_RETEST_B6_EXIT_CASES: ReplayCase[] = [
  {
    id: "nov21-live-retest-b6-name-settled-kept",
    title: "B6 (item 19): the name the manager settled on (\"yes it is for <C>\", \"create the exit form for <C>\") stays on the card and the saved draft; later turns never switch it back to the first name typed",
    report: `${REPORT}: "The card was <C> after turns 3–4, then turns 5–6 switched back to <A> (\\"<A> (<C> in Woven)\\") unasked; the saved draft says <A>."`,
    status: "fixed",
    async run(t) {
      const { thread, cards } = await sayB6(t);
      // Turn 4 ("create the exit form for <C>") seats the settled name; turns 5 and 6 never put the first name back.
      expect(cards.slice(3), `the card's name after the manager settled on Isolde Quennell: ${JSON.stringify(cards)}`).toEqual(["Isolde Quennell", "Isolde Quennell", "Isolde Quennell"]);
      const id = await thread.create();
      expect(t.values(id).employee_name ?? "", `the saved draft's name: ${JSON.stringify(t.values(id))}`).toBe("Isolde Quennell");
    },
  },
  {
    id: "nov21-live-retest-b6-notice-fulfilling-is-how-she-left",
    title: "B6 (item 20): \"she gave 2 weeks notice and is fulfilling them\" is a resignation with notice: the card ticks Submitted & Fulfilled Notice and never asks how she left",
    report: `${REPORT}: "\\"How did she leave?\\" was asked every turn though the manager said she gave 2 weeks' notice and is fulfilling it (= voluntary resignation with notice); the separation type was never filled."`,
    status: "fixed",
    async run(t) {
      const { thread, standIn } = await sayB6(t);
      const cards = standIn.views.map((view) => lastResult(view, "propose_form")).filter((result): result is Record<string, unknown> => Boolean(result && "card" in result));
      // Every turn makes the card, also after the manager settles on her legal name (the turn that told the notice is still her request).
      expect(cards.length, "a turn made no exit card").toBe(B6_TURNS.length);
      for (const card of cards) {
        const said = ((card.facts ?? card) as { exit_ticks?: string[]; exit_unset?: string[] });
        const facts = JSON.stringify({ exit_ticks: said.exit_ticks, exit_unset: said.exit_unset });
        expect(said.exit_unset ?? [], `the card still asks how she left: ${facts}`).not.toContain("resignation_type");
        expect(said.exit_ticks ?? [], `the card's separation: ${facts}`).toContain("Submitted & Fulfilled Notice");
      }
      const id = await thread.create();
      expect(Object.values(t.checked(id)).flat(), `the saved separation: ${JSON.stringify(t.checked(id))}`).toContain("submitted_fulfilled_notice");
    },
  },
  {
    id: "nov21-live-retest-b6-reason-without-instruction",
    title: "B6 (item 21): \"she is resigning due to second job I'm ready for the draft\" saves the reason \"Second job\"; the instruction to the app is not part of it",
    report: `${REPORT}: "The Reason field was saved as \\"Second job I'm ready for the draft.\\" — the trailing \\"I'm ready for the draft\\" is an instruction, not part of the reason."`,
    status: "fixed",
    async run(t) {
      const { thread } = await sayB6(t);
      const id = await thread.create();
      expect((t.values(id).resignation_reason ?? "").trim(), `the saved reason: ${JSON.stringify(t.values(id))}`).toMatch(/^second job\.?$/i);
    },
  },
];
