import { expect, vi } from "vitest";

import type { ChatFormProposal } from "@/types";

import { TWO_STORES, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * THE TEAM COACHING CARD STAYS THE TEAM CARD (QA's live re-test, 21 Nov 2026, items 13 and 17 / A10 and A14)
 * ============================================================================
 *
 * Item 13 (A10): a whole-team coaching request, answered with the store "dodge", got "a Coaching Form is one person at a
 * time" and the store's whole staff, asking for one name; the very next turn ("make a coaching form for all team members
 * at dodge") made the team card. Item 17 (A14): "Create a coaching form." / "For all team members at dodge" (the team
 * card) / "In details of coaching inlude our woven policy on finding a cover for your shift" flipped to "A Coaching Form
 * is for one person at a time, so I won't make one card for the whole staff" and the store's full staff list, with the
 * "All team members" card still on screen.
 *
 * Code: coach_team read only a NEW team request, so no tool could change the card on screen (wrong_tool, then the rules
 * book's list_staff fallback, whose whole-staff answer is the one-person line); now coach_team remakes it with the turn's
 * store or details. Instruction: the rules book sends every later turn about the card to coach_team, and says Woven's
 * policies cannot be searched. The stand-in plays the live model (list_staff for the store and the details) unless the
 * rules book's line is there to follow; the tools, the card and Create are real.
 * Invented people (`loop-roster.ts`); the stores are the pack's own (Bellevue and Omaha West Dodge, `TWO_STORES`).
 */

const REPORT_13 = "QA's live re-test, 21 Nov 2026 (A10): after \"dodge\" it said a Coaching Form is one person at a time and listed the staff; the next turn made the team card";
const REPORT_17 = "QA's live re-test, 21 Nov 2026 (A14): \"In details of coaching inlude our woven policy on finding a cover for your shift\" got \"A Coaching Form is for one person at a time\" and the full staff list with the team card on screen";

const ONE_PERSON = /one person at a time/i;
const STAFF_NAMES = /Fenna|Ozren|Thaddea/;

/** The rules book's lines the model follows here (items 13 and 17). */
const TEAM_CARD_LINE = /With the team card on screen and not created, every later turn about it/;
const WOVEN_LINE = /Woven's policies are not in what search_knowledge and read_policy read/;

type Card = { card?: { status?: string; choose_store_from?: { name: string }[] }; facts?: Record<string, unknown>; reason_code?: string; ask_exactly?: string; whole_staff_form?: string } | null;

function standIn() {
  return loopStandIn((view: LoopView): LoopDecision => {
    const said = view.turns.filter((turn) => turn.role === "user").at(-1)?.text ?? "";
    const team = lastResult(view, "coach_team") as Card;
    const staff = lastResult(view, "list_staff") as Card;
    const proposed = lastResult(view, "propose_form") as Card;
    if (team) {
      if (team.reason_code) return { tool: "list_staff", input: { store: said } };
      const facts = team.facts ?? {};
      // The rules book's Woven line, said when the manager names a Woven policy and the line is there to follow.
      const woven = /woven policy/i.test(said) && WOVEN_LINE.test(view.system) ? " I can't search Woven's policies, so I haven't added that policy's text. I've added your words as you wrote them." : "";
      const store = team.card?.status === "needs_location" ? ` Which store: ${(team.card.choose_store_from ?? []).map((row) => row.name).join(" or ")}?` : "";
      return { text: `${facts.team_card_updated ? "I've updated the team Coaching card." : "Here's the team Coaching card for All team members."}${woven}${store}` };
    }
    if (staff) {
      return { text: `${staff.whole_staff_form ? `A ${staff.whole_staff_form} is for one person at a time, so I won't make one card for the whole staff. ` : ""}${JSON.stringify(staff)}` };
    }
    if (proposed) return { text: proposed.ask_exactly ?? "Who is this Coaching Form for?" };
    if (/team members|whole team|everyone/i.test(said)) return { tool: "coach_team", input: {} };
    if (/^create a coaching form/i.test(said)) return { tool: "propose_form", input: { template_key: "coaching" } };
    // The store answer and the details: the live model went to list_staff; the rules book's team-card line sends them to coach_team.
    return TEAM_CARD_LINE.test(view.system) ? { tool: "coach_team", input: {} } : { tool: "list_staff", input: { store: said } };
  });
}

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-21T18:20:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", TWO_STORES);
  t.loopModel!(standIn());
  return t.thread();
}

const teamCard = (reply: { formProposal?: unknown }, thread: { proposal: unknown }) => (reply.formProposal ?? thread.proposal) as ChatFormProposal | null;

export const NOV21_AGENT_LOOP_TEAM_CARD_STAYS_CASES: ReplayCase[] = [
  {
    id: "nov21-agent-loop-team-card-store-answer-dodge",
    title: "A10: a whole-team coaching request, then \"dodge\": the team card at Omaha West Dodge, never \"one person at a time\" or the staff list; the next team request agrees",
    report: REPORT_13,
    status: "fixed",
    async run(t) {
      const thread = start(t);
      const first = await thread.say("I need a coaching form for all team members");
      expect(first.formProposal?.employeeName, first.content).toBe("All team members");
      const dodge = await thread.say("dodge");
      expect(dodge.content, "the team card flipped to one person at a time").not.toMatch(ONE_PERSON);
      expect(dodge.content, "the staff was listed unasked").not.toMatch(STAFF_NAMES);
      const card = teamCard(dodge, thread);
      expect(card?.employeeName).toBe("All team members");
      expect(card?.locationId, dodge.content).toBe("loc-264");
      expect(card?.status).toBe("ready");
      const again = await thread.say("make a coaching form for all team members at dodge");
      expect(again.content).not.toMatch(ONE_PERSON);
      expect(teamCard(again, thread)?.employeeName).toBe("All team members");
    },
  },
  {
    id: "nov21-agent-loop-team-card-details-woven-policy",
    title: "A14: \"Create a coaching form.\" / \"For all team members at dodge\" / \"In details of coaching inlude our woven policy on finding a cover for your shift\": the team card stays, its details carry the words, the reply says Woven's policies can't be searched",
    report: REPORT_17,
    status: "fixed",
    async run(t) {
      const thread = start(t);
      await thread.say("Create a coaching form.");
      const team = await thread.say("For all team members at dodge");
      expect(team.formProposal?.employeeName, team.content).toBe("All team members");
      const details = await thread.say("In details of coaching inlude our woven policy on finding a cover for your shift");
      expect(details.content, "the team card flipped to one person at a time").not.toMatch(ONE_PERSON);
      expect(details.content, "the staff was listed unasked").not.toMatch(STAFF_NAMES);
      expect(details.content, "the reply did not say Woven's policies can't be searched").toMatch(/can't search Woven's policies/);
      const card = teamCard(details, thread);
      expect(card?.employeeName).toBe("All team members");
      expect(card?.locationId).toBe("loc-264");
      t.draftWrites({ coaching_details: "All team members must find a cover for their shift." });
      await thread.create();
      expect(t.draftPrompts().at(-1) ?? "", "the details turn never reached Create's draft").toContain("finding a cover for your shift");
    },
  },
];
