import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * THE STORE THE MANAGER NAMED LEAVES THE ACCOUNT WHOLE, STATE AND ALL (QA's Bubbles round 2, 22 Nov 2026, R13)
 * ============================================================================
 *
 * The manager's turn, word for word (QA's test name, on no directory): "create a verbal CA for team member Testy
 * Testerson at Dodge, NE. location. On 10-16-26 Testy was not properly measuring and weighing product. payroll deduct is
 * not applicable". The card's Observation read "NE on 10/16/26 Testy was not properly measuring and weighing product.":
 * the store phrase "At Dodge" left the account (QA item 20, `withoutNamedSalon`) but its state ", NE" stayed.
 *
 * Mechanism (`withoutNamedSalon`): a store phrase followed by ", <word>" where the word is part of that store's own name
 * (its state, "NE") is that store's phrase too, and leaves the account with it.
 */

const REPORT = "QA's Bubbles round 2 (22 Nov 2026, R13): the Observation read \"NE on 10/16/26 …\", a fragment of \"at Dodge, NE\"";
const T1 = "create a verbal CA for team member Testy Testerson at Dodge, NE. location. On 10-16-26 Testy was not properly measuring and weighing product. payroll deduct is not applicable";
const T2 = "employee name is Testy Testerson";
const LIVE_ACCOUNT = "At Dodge, NE on 10/16/26 Testy was not properly measuring and weighing product.";

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", WEST_DODGE);
}

const said = (view: LoopView) => view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0).at(-1)?.text ?? "";
const issueOf = (proposal: unknown) => (proposal as { issue?: string | null } | null)?.issue ?? "";

const live = () =>
  loopStandIn((view): LoopDecision => {
    if (lastResult(view, "propose_form")) return { text: "Here's the Corrective Action Form for **Testy**." };
    return {
      tool: "propose_form",
      input: {
        template_key: "dpoa",
        employee_name: "Testy Testerson",
        what_happened: LIVE_ACCOUNT,
        incident_date: "2026-10-16",
        warning_level: "verbal",
        level_evidence: evidenceFrom(view, "create a verbal CA", said(view) === T1 ? 0 : 1),
        payroll_deduct: "no",
        payroll_evidence: evidenceFrom(view, "payroll deduct is not applicable", said(view) === T1 ? 0 : 1),
        policy: headingWith(view, /standards of conduct/i),
        person_evidence: evidenceFrom(view, "Testy Testerson"),
      },
    };
  });

export const NOV22_AGENT_LOOP_PLACE_FRAGMENT_CASES: ReplayCase[] = [
  {
    id: "nov22-r13-store-with-state-leaves-account-whole",
    title: "R13: \"… Testy Testerson at Dodge, NE. location. On 10-16-26 Testy was not properly measuring …\" — the Observation is \"On 10/16/26 Testy was not properly measuring and weighing product.\", never \"NE on …\" or \"At Dodge, NE on …\"",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      const thread = t.thread();
      t.loopModel!(live());
      await thread.say(T1);
      expect(thread.proposal?.locationId, "the case proves nothing: the card is not filed at the store the manager named").toBe("loc-264");
      expect(issueOf(thread.proposal), "a fragment of the store phrase stayed in the Observation").not.toMatch(/\bNE\b|Dodge/);
      expect(issueOf(thread.proposal)).toMatch(/^On 10\/16\/26 Testy was not properly measuring and weighing product\.$/);
      await thread.say(T2);
      expect(issueOf(thread.proposal), "T2's card brought the store phrase back").not.toMatch(/\bNE\b|Dodge/);
    },
  },
];
