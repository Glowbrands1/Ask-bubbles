import { expect, vi } from "vitest";

import type { ReplayCase, ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * THE COACHING TOPIC THE REQUEST OPENED WITH REACHES THE CARD (QA's Bubbles round 2, U29; board f138)
 * ============================================================================
 *
 * The manager's turns, word for word (a district manager, global scope; the person invented): T1 "create a coaching form
 * about accountability", T2 "I want the same form for multiple employees", T3 "no put the employee as Rosabel Thornquist".
 * T3's card had no topic, and the saved form had none ticked; the reply even said "the accountability topic didn't carry
 * over". The model named the topic with T1's words as its evidence.
 */

const REPORT = "QA's Bubbles round 2 (U29; board f138): \"create a coaching form about accountability\" → … → \"no put the employee as Rosabel Thornquist\": the card and the saved form dropped the topic";
const T1 = "create a coaching form about accountability";
const T2 = "I want the same form for multiple employees";
const T3 = "no put the employee as Rosabel Thornquist";
const ROSABEL = { id: "e-rosabel-thornquist", firstName: "Rosabel", lastName: "Thornquist", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Assistant General Manager" };

const said = (view: LoopView) => view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0).at(-1)?.text ?? "";
const back = (view: LoopView, text: string) => {
  const asks = view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0);
  return Math.max(0, asks.length - 1 - asks.findIndex((turn) => turn.text === text));
};

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-10T16:00:00Z"));
  t.directory([...LOOP_STAFF, ROSABEL as never]);
  t.as("district_manager", { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] });
}

/** The live model: T1 asks who; T2 asks the names; T3 proposes the coaching card with T1's topic and T1's words as its evidence. */
const live = (t1 = T1) =>
  loopStandIn((view): LoopDecision => {
    const message = said(view);
    const result = lastResult(view, "propose_form") as { card?: unknown } | null;
    if (message === t1) return { text: "Who is this Coaching Form for?" };
    if (message === T2) return { text: "Which employees should I prepare this coaching form for? Please give me their names." };
    if (result) return { text: "Here's the Coaching Form for **Rosabel**." };
    return {
      tool: "propose_form",
      input: {
        template_key: "coaching", employee_id: ROSABEL.id, person_evidence: evidenceFrom(view, "Rosabel Thornquist"),
        topic: "accountability", topic_evidence: evidenceFrom(view, "about accountability", back(view, t1)),
      },
    };
  });

export const NOV23_R2_U29_TOPIC_KEPT_CASES: ReplayCase[] = [
  {
    id: "nov23-r2-u29-topic-from-first-turn-reaches-card",
    title: "U29: T1 \"create a coaching form about accountability\", T2 \"I want the same form for multiple employees\", T3 \"no put the employee as Rosabel Thornquist\" — the card's topic is Accountability",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      t.loopModel!(live());
      const thread = t.thread();
      for (const turn of [T1, T2, T3]) await thread.say(turn);
      expect(thread.proposal?.employeeName, "the case proves nothing: no card for the person").toBe("Rosabel Thornquist");
      expect((thread.proposal as { coachingTopic?: string } | null)?.coachingTopic, "the card dropped the topic T1 named").toMatch(/^accountability$/i);
    },
  },
  {
    id: "nov23-r2-u29-control-another-persons-request-keeps-its-topic",
    title: "U29, control: T1 \"create a coaching form for Fenna Prewitt about accountability\" is another person's request (on the staff list); Rosabel's card at T3 never takes its topic",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      const first = "create a coaching form for Fenna Prewitt about accountability";
      t.loopModel!(live(first));
      const thread = t.thread();
      for (const turn of [first, T2, T3]) await thread.say(turn);
      expect(thread.proposal?.employeeName, "the case proves nothing: no card for the person").toBe("Rosabel Thornquist");
      expect((thread.proposal as { coachingTopic?: string } | null)?.coachingTopic ?? null, "another person's request gave Rosabel's card its topic").toBeNull();
    },
  },
];
