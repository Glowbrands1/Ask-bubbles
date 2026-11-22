import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_OZREN, LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * THE REPLY STATES THE SAME DEADLINE AS THE CARD (QA's Bubbles live re-run, 22 Nov 2026, A3)
 * ============================================================================
 *
 * The manager's turn, word for word (the person invented, `loop-roster.ts`): "create corrective action for <P> for
 * violating standards of conduct policy on 10-20-26. <P> failed to acknowledge policies in woven by the 10-15-26
 * deadline." The card and the saved draft said "by the 10/15/26 deadline"; the reply said "by the 10/20/26 deadline".
 * Mechanism (`agent-loop/observation-dates.ts`): a reply sentence restating the card's Observation must carry that
 * sentence's dates; otherwise it goes back to the model once with the card's facts, and a second misdated restatement is
 * left out of the reply (the card under it shows the Observation).
 */

const REPORT = "QA's Bubbles live re-run (22 Nov 2026, A3): the reply said \"by the 10/20/26 deadline\" while the card and the saved draft said 10/15/26";
const T1 = "create corrective action for Ozren Brack for violating standards of conduct policy on 10-20-26. Ozren Brack failed to acknowledge policies in woven by the 10-15-26 deadline.";
const ACCOUNT = "Ozren Brack failed to acknowledge policies in Woven by the 10/15/26 deadline.";
const LIVE = "Ozren failed to acknowledge policies in Woven by the 10/20/26 deadline.";
const RIGHT = "Ozren failed to acknowledge policies in Woven by the 10/15/26 deadline.";

const checkedBack = (view: LoopView) => view.turns.some((turn) => /^\[app check\]/.test(turn.text) && /observation date \(10\/20\/26\)/.test(turn.text));

function reply(view: LoopView, account: string): string {
  const card = (lastResult(view, "propose_form") as { card?: { policy?: string | null } } | null)?.card;
  return [`Here's the Corrective Action Form for **Ozren Brack**.`, account, ...(card?.policy ? [`**Policy:** ${card.policy}`] : [])].join("\n\n");
}

/** The live model: the card is right; the reply restates the account with the form's date, `fixes` decides the second reply. */
const live = (fixes: boolean) =>
  loopStandIn((view): LoopDecision => {
    if (!lastResult(view, "propose_form")) {
      return { tool: "propose_form", input: { template_key: "dpoa", employee_id: LOOP_OZREN.id, what_happened: ACCOUNT, incident_date: "2026-10-20", policy: headingWith(view, /standards of conduct/i), person_evidence: evidenceFrom(view, "Ozren Brack") } };
    }
    return { text: reply(view, checkedBack(view) && fixes ? RIGHT : LIVE) };
  });

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", WEST_DODGE);
}

const issue = (proposal: unknown) => (proposal as { issue?: string | null } | null)?.issue ?? "";

export const NOV22_AGENT_LOOP_REPLY_KEEPS_OBSERVATION_DATES_CASES: ReplayCase[] = [
  {
    id: "nov22-a3-reply-deadline-matches-card",
    title: "A3: \"… on 10-20-26. <P> failed to acknowledge policies in woven by the 10-15-26 deadline.\" — the reply restating the account with 10/20/26 goes back once, and the reply says the card's 10/15/26 deadline",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      const thread = t.thread();
      const model = live(true);
      t.loopModel!(model);
      const said = await thread.say(T1);
      expect(issue(thread.proposal), "the card lost the account's deadline (the case proves nothing)").toMatch(/10\/15\/26 deadline/);
      expect(model.views.some(checkedBack), "the misdated restatement was never handed back").toBe(true);
      expect(said.content, `the reply states another deadline than the card:\n${said.content}`).not.toMatch(/10\/20\/26 deadline/);
      expect(said.content).toMatch(/10\/15\/26 deadline/);
    },
  },
  {
    id: "nov22-a3-reply-misdated-twice-left-out",
    title: "A3, the model repeats \"by the 10/20/26 deadline\" after the hand-back: that sentence is left out of the reply (the card shows the account); never offered as a change to make",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      const thread = t.thread();
      t.loopModel!(live(false));
      const said = await thread.say(T1);
      expect(said.content, `the reply still states another deadline than the card:\n${said.content}`).not.toMatch(/10\/20\/26 deadline/);
      expect(said.content, "the misdated account was offered as a change").not.toMatch(/isn't on the card yet/);
      expect(said.content, "the reply lost the card line").toMatch(/Corrective Action Form for \*\*Ozren/);
    },
  },
  {
    id: "nov22-a3-control-account-dates-kept-no-hand-back",
    title: "Control: a reply that restates the account with its own 10/15/26 deadline is not handed back",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      const thread = t.thread();
      const model = loopStandIn((view): LoopDecision => {
        if (!lastResult(view, "propose_form")) {
          return { tool: "propose_form", input: { template_key: "dpoa", employee_id: LOOP_OZREN.id, what_happened: ACCOUNT, incident_date: "2026-10-20", policy: headingWith(view, /standards of conduct/i), person_evidence: evidenceFrom(view, "Ozren Brack") } };
        }
        return { text: reply(view, RIGHT) };
      });
      t.loopModel!(model);
      const said = await thread.say(T1);
      expect(model.views.some((view) => view.turns.some((turn) => /^\[app check\]/.test(turn.text))), "a correct reply was handed back").toBe(false);
      expect(said.content).toMatch(/10\/15\/26 deadline/);
    },
  },
];
