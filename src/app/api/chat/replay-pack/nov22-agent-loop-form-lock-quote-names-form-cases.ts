import { expect, vi } from "vitest";

import { WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * THE FORM LOCK NEEDS WORDS THAT NAME THE OTHER FORM (port of the sibling app's board f108, QA handoff 22 Nov 2026)
 * ============================================================================
 *
 * The form lock keeps the open card's form unless this turn asks for another one. It trusted the model's quote:
 * form_change_evidence (or new_form_evidence) passed whenever the quoted words were somewhere in this turn, whatever they
 * said. In the sibling app a quote of the account ("she said she'd be late again") switched the open Corrective Action
 * card to a Coaching card nobody asked for. Same code here. Now the quote must name the form it switches to (its name,
 * short name or initials), or the turn answers the app's own offer of that form (the reply before it named it).
 * Invented person: Marten Brevik (on no fixture).
 */

const REPORT = "Sibling app's QA handoff 22 Nov 2026 (board f108): the form lock trusts the AI's quote (evidence.ts only checks the quote is in the manager's turn)";
const MARTEN: DirectoryRow = { id: "e-marten-brevik", firstName: "Marten", lastName: "Brevik", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const ACCOUNT = "Marten was late to open on 11/21.";

type Proposed = { reason_code?: string; card?: unknown } | null;

/**
 * T1 "ca for marten brevik, late to open on 11/21" makes the CA card. On later turns the stand-in proposes a Coaching card
 * quoting `quote` as form_change_evidence; told the form is locked, it re-proposes the CA. `offer` is the text the
 * stand-in replies with instead (the app's own offer of the other form).
 */
async function run(t: ReplayContext, turns: readonly { said: string; quote?: string; offer?: string }[]) {
  vi.setSystemTime(new Date("2026-11-22T15:00:00Z"));
  t.directory([...LOOP_STAFF, MARTEN]);
  t.as("location_manager", WEST_DODGE);
  let step = -1;
  const model = loopStandIn((view): LoopDecision => {
    const proposed = lastResult(view, "propose_form") as Proposed;
    const turn = turns[step];
    if (step < 0) return proposed ? { text: "Here's the card." } : { tool: "propose_form", input: { template_key: "dpoa", employee_id: MARTEN.id, what_happened: ACCOUNT, incident_date: "2026-11-21" } };
    if (turn?.offer) return { text: turn.offer };
    if (!proposed) return { tool: "propose_form", input: { template_key: "coaching", employee_id: MARTEN.id, what_happened: ACCOUNT, incident_date: "2026-11-21", form_change_evidence: evidenceFrom(view, turn!.quote!) } };
    if (proposed.reason_code === "form_locked" && view.results.filter((result) => result.tool === "propose_form").length === 1) {
      return { tool: "propose_form", input: { template_key: "dpoa", employee_id: MARTEN.id, what_happened: ACCOUNT, incident_date: "2026-11-21" } };
    }
    return { text: "Here's the card." };
  });
  t.loopModel!(model);
  const thread = t.thread();
  const first = await thread.say("ca for marten brevik, late to open on 11/21");
  expect(first.formProposal?.templateKey, first.content).toBe("dpoa");
  const replies = [];
  for (const [index, turn] of turns.entries()) {
    step = index;
    replies.push(await thread.say(turn.said));
  }
  return replies;
}

const fixed = (id: string, title: string, body: (t: ReplayContext) => Promise<void>): ReplayCase => ({ id, title, report: REPORT, status: "fixed", run: body });

export const NOV22_AGENT_LOOP_FORM_LOCK_QUOTE_NAMES_FORM_CASES: ReplayCase[] = [
  fixed("nov22-form-lock-account-quote-never-switches", "CA card open; \"he said he'd be late again tomorrow\" quoted as form_change_evidence: the card stays a Corrective Action", async (t) => {
    const [reply] = await run(t, [{ said: "he said he'd be late again tomorrow", quote: "he said he'd be late again" }]);
    expect(reply!.formProposal?.templateKey, reply!.content).not.toBe("coaching");
  }),
  fixed("nov22-form-lock-names-form-control", "Control: \"make it a coaching form instead\" (the words name the form) switches the card to Coaching", async (t) => {
    const [reply] = await run(t, [{ said: "make it a coaching form instead", quote: "make it a coaching form instead" }]);
    expect(reply!.formProposal?.templateKey, reply!.content).toBe("coaching");
  }),
  fixed("nov22-form-lock-yes-to-offer-control", "Control: the app offers \"Want me to make it a Coaching Form instead?\" and the manager's \"yes\" switches the card", async (t) => {
    const replies = await run(t, [
      { said: "he's new, maybe something lighter", offer: "Want me to make it a Coaching Form instead?" },
      { said: "yes", quote: "yes" },
    ]);
    expect(replies.at(-1)!.formProposal?.templateKey, replies.at(-1)!.content).toBe("coaching");
  }),
];
