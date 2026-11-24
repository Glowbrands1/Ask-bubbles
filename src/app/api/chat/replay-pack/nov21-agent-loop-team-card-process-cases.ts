import { expect, vi } from "vitest";

import type { ChatFormProposal } from "@/types";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * THE TEAM CARD'S PROCESS AND ITS RULE REACH THE CARD, AND "ADDED" IS NEVER SAID FOR NOTHING (QA, 21 Nov 2026, item 11 / A8)
 * ============================================================================
 *
 * QA's live re-test (Pau's account, loop on): a team Coaching card, then a long process account ("coaching is on sfs
 * operations for clean organization and flow. BCS has flagged our SFS ... print the shipping label ...") got "I couldn't
 * finish that in the steps I have for one message…" after 68.8 s. "make that update" and "I need to add that the shipping
 * label must not be printed until 15 minutes has passed form the packing slip being printed." were answered "noted" /
 * "added", with no card returned; the final card had only the name. The process below is QA's account rewritten in the
 * same style (the live one is not in the report); the 15-minute turn is QA's exact wording. Invented people only.
 */

const REPORT = "QA's live re-test, 21 Nov 2026 (A8): a team coaching process ran out of steps; \"make that update\" and the 15-minute rule were said to be added but no card update came back";

const PROCESS =
  "coaching is on sfs operations for clean organization and flow. BCS has flagged our SFS orders going out late and " +
  "packed wrong, so this is the process from now on. when an order drops, pull the packing slip first and check every " +
  "item against it before anything goes in the box. pick from the back stock shelves in the order the slip lists them, " +
  "not from the sales floor. wrap each bar in tissue and put the heavy items on the bottom with the fragile ones on top. " +
  "fill the empty space so nothing moves, tape the box on both seams, then print the shipping label and put it flat on " +
  "the top of the box. put the finished box on the outgoing shelf and clean the pack station before the next order.";
const RULE = "I need to add that the shipping label must not be printed until 15 minutes has passed form the packing slip being printed.";

/** The rules book's line (item 11): what the model is told about saying "noted" / "added". */
const NEVER_CLAIM = /Never say you noted, added, included or updated something unless a tool this turn showed the card again/;

type TeamResult = { card?: unknown; facts?: Record<string, unknown>; reason_code?: string } | null;

/**
 * The model: coach_team for the team request, the process and the rule; for "make that update", "noted" with no tool
 * (as live) unless the rules book tells it otherwise. The tools, the card and Create are real.
 */
function standIn(processLost = false) {
  return loopStandIn((view: LoopView): LoopDecision => {
    const said = view.turns.filter((turn) => turn.role === "user").at(-1)?.text ?? "";
    // The live process turn: no card came back (the step limit's reply), as QA saw.
    if (processLost && said === PROCESS) return { text: "I couldn't finish that in the steps I have for one message. Please try again." };
    const team = lastResult(view, "coach_team") as TeamResult;
    if (team) return { text: team.reason_code ? "I couldn't change the card." : team.facts?.team_card_updated ? "I've updated the team Coaching card." : "Here's the team Coaching card for All team members." };
    // As live, "noted" with no tool; the rules book's never-claim line (item 11) sends it to coach_team instead.
    if (/^make that update$/i.test(said.trim()) && !NEVER_CLAIM.test(view.system)) return { text: "Noted — I've added that to the coaching details." };
    return { tool: "coach_team", input: {} };
  });
}

function start(t: ReplayContext, processLost = false) {
  vi.setSystemTime(new Date("2026-11-21T19:05:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", WEST_DODGE);
  t.loopModel!(standIn(processLost));
  return t.thread();
}

const card = (reply: { formProposal?: unknown }) => (reply.formProposal ?? null) as ChatFormProposal | null;

export const NOV21_AGENT_LOOP_TEAM_CARD_PROCESS_CASES: ReplayCase[] = [
  {
    id: "nov21-agent-loop-team-card-process-and-rule-reach-the-card",
    title: "A8: the team card, a long SFS process, \"make that update\" and the 15-minute rule: each turn returns the team card, \"added\" is never said without it, and Create drafts from the process and the rule",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const thread = start(t);
      const first = await thread.say("make a coaching form for all team members at dodge");
      expect(card(first)?.employeeName, first.content).toBe("All team members");
      const process = await thread.say(PROCESS);
      expect(process.content, "the process turn ran out of steps").not.toMatch(/couldn't finish that in the steps/i);
      expect(card(process)?.employeeName, "the process turn returned no team card").toBe("All team members");
      const update = await thread.say("make that update");
      expect(card(update)?.employeeName, `"added" with no card returned: ${update.content}`).toBe("All team members");
      const rule = await thread.say(RULE);
      expect(card(rule)?.employeeName, `the rule turn returned no team card: ${rule.content}`).toBe("All team members");
      expect(card(rule)?.proposalId, "a new card, not the same team card").toBe(card(first)?.proposalId);
      t.draftWrites({ coaching_details: "Pull the packing slip first. The shipping label is printed 15 minutes after the packing slip." });
      await thread.create();
      const drafted = t.draftPrompts().at(-1) ?? "";
      expect(drafted, "the process never reached Create's draft").toContain("print the shipping label");
      expect(drafted, "the 15-minute rule never reached Create's draft").toContain("15 minutes has passed form the packing slip being printed");
    },
  },
  {
    id: "nov21-agent-loop-team-card-noted-without-change",
    title: "A8: the process turn returned no card (as live); \"make that update\" is a coach_team call (the rules book), never \"Noted\" with no card, and the card comes back with the process for Create to draft from",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const thread = start(t, true);
      await thread.say("make a coaching form for all team members at dodge");
      await thread.say(PROCESS);
      const update = await thread.say("make that update");
      expect(update.content, "\"noted\" was said with no card change").not.toMatch(/^Noted/);
      expect(card(update)?.employeeName, update.content).toBe("All team members");
      t.draftWrites({ coaching_details: "Pull the packing slip first." });
      await thread.create();
      expect(t.draftPrompts().at(-1) ?? "", "the process never reached Create's draft").toContain("print the shipping label");
    },
  },
];
