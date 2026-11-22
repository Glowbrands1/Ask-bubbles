import { expect, vi } from "vitest";

import type { ReplayCase, ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * A LATER TURN NEVER REWRITES THE OBSERVATION UNLESS THE MANAGER CHANGES IT (QA's Bubbles live re-run, A7 T5; option 2)
 * ============================================================================
 *
 * QA's Bubbles live re-run (22 Nov 2026, A7), the manager's words word for word (the person invented): T1 "do verbal for
 * team member <P> at empire, sd. …", T2 "jba manual 11-1-25", T3 "cite pets in workplace", T4 "cite animals in the
 * workplace policy", T5 "store location is empire, sd. create corrective action". Live, T5's card came back with the
 * Observation rewritten: "<P> is a team member. On 10/22/26 …" (the request's role line put into the account), and in
 * other runs with only its punctuation changed. T5 asked for no new account. Now the card keeps the account as shown
 * when the model's differs only in ways the manager's latest message does not bring (`agent-loop/account-kept.ts`).
 * Control: "she was in the store 30 min, not 45" changes the account, and the card takes it.
 */

const REPORT = "QA's Bubbles live re-run (22 Nov 2026, A7 T5): \"store location is empire, sd. create corrective action\" rewrote the card's Observation (\"Wren is a team member. On 10/22/26 …\")";
const PERSON = { id: "e-wren-halvorsen", firstName: "Wren", lastName: "Halvorsen", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-338", "loc-225"], positionName: "Team Member Part Time" };
const SD_MANAGER = { level: "location", primaryAreaId: "loc-338", alsoCoversAreaIds: ["loc-225"] };
const T1 = "do verbal for team member Wren Halvorsen at empire, sd. payroll deduct does not apply. previous coaching jba manual 11-1-26. on 10-22-26 Wren Halvorsen was not scheduled to work and came into the store to show her team her new puppy. Wren Halvorsen was in the store 45 min";
const T2 = "jba manual 11-1-25";
const T3 = "cite pets in workplace";
const T4 = "cite animals in the workplace policy";
const T5 = "store location is empire, sd. create corrective action";
/** The control's T5: the manager changes a fact of the account. */
const T5_CHANGE = "she was in the store 30 min, not 45";
const ACCOUNT = "On 10/22/26, Wren was not scheduled to work and came into the store to show the team the new puppy. Wren was in the store 45 min.";
/** Live T5 (production's, the person invented): the request's role line put into the account. */
const ROLE_LINE_REWRITE = "Wren is a team member. On 10/22/26 Wren was not scheduled to work and came into the store to show the team the new puppy. Wren was in the store 45 min.";
/** Live T5 in another run: only the punctuation changed. */
const COMMA_REWRITE = "On 10/22/26 Wren was not scheduled to work and came into the store to show the team the new puppy. Wren was in the store 45 min.";
const CHANGED = "On 10/22/26, Wren was not scheduled to work and came into the store to show the team the new puppy. Wren was in the store 30 min.";

const managerTurns = (view: LoopView) => view.turns.filter((turn) => turn.role === "user" && (turn.messageIds?.length ?? 0) > 0);
const issueOf = (proposal: unknown) => (proposal as { issue?: string | null } | null)?.issue ?? "";

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
  t.directory([...LOOP_STAFF, PERSON as never]);
  t.as("location_manager", SD_MANAGER);
}

/** The live model: T1–T4 propose the account as written; the fifth turn proposes `fifth`. */
const live = (fifth: string) =>
  loopStandIn((view): LoopDecision => {
    /* As the live replies do (the rules book's line): the Observation, as the card holds it. */
    const proposed = lastResult(view, "propose_form") as { card?: { observation?: string | null } } | null;
    if (proposed) return { text: `Here's the Corrective Action Form for **Wren**.\n\n**Observation of Offense:** ${proposed.card?.observation ?? ""}` };
    const turns = managerTurns(view);
    const back = Math.max(0, turns.length - 1);
    return {
      tool: "propose_form",
      input: {
        template_key: "dpoa", employee_id: PERSON.id, what_happened: turns.length >= 5 ? fifth : ACCOUNT, incident_date: "2026-10-22",
        warning_level: "verbal", level_evidence: evidenceFrom(view, "do verbal", back),
        policy: headingWith(view, /animals in the workplace/i) ?? headingWith(view, /standards of conduct/i), store: "empire, sd",
        person_evidence: evidenceFrom(view, "Wren Halvorsen", back),
      },
    };
  });

/**
 * `scripted`: the case's condition is the stand-in's own input (the T5 rewrite the live model gave), so the stand-in plays
 * in live runs too (#1062); the control (a change the manager asks for) runs with the live model.
 */
async function chat(t: ReplayContext, fifth: string, t5: string, scripted: boolean) {
  start(t);
  t.loopModel!(live(fifth), { scripted });
  const thread = t.thread();
  await thread.say(T1);
  const shown = issueOf(thread.proposal);
  expect(shown, "T1 made no card with the account (the case proves nothing)").toMatch(/45 min/);
  for (const turn of [T2, T3, T4]) await thread.say(turn);
  expect(issueOf(thread.proposal), "T2–T4 changed the account (the case proves nothing)").toBe(shown);
  const reply = await thread.say(t5);
  return { thread, reply, shown };
}

export const NOV22_AGENT_LOOP_ACCOUNT_KEPT_CASES: ReplayCase[] = [
  {
    id: "nov22-a7-t5-role-line-not-put-in-observation",
    title: "A7 T5 \"store location is empire, sd. create corrective action\": the model's account \"Wren is a team member. On 10/22/26 …\" is not taken; the card keeps T1's Observation",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const { thread, reply, shown } = await chat(t, ROLE_LINE_REWRITE, T5, true);
      expect(issueOf(thread.proposal), `T5 rewrote the Observation:\n${reply.content}`).toBe(shown);
      expect(issueOf(thread.proposal)).not.toMatch(/team member/i);
    },
  },
  {
    id: "nov22-a7-t5-punctuation-rewrite-not-taken",
    title: "A7 T5, another live run: the model's account differs from T1's only by a comma (\"On 10/22/26 Wren …\"); the card keeps T1's Observation as shown",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const { thread, reply, shown } = await chat(t, COMMA_REWRITE, T5, true);
      expect(issueOf(thread.proposal), `T5 rewrote the Observation:\n${reply.content}`).toBe(shown);
    },
  },
  {
    id: "nov22-a7-t5-control-manager-change-is-taken",
    title: "A7, control: T5 \"she was in the store 30 min, not 45\" changes the account; the card takes the model's new account (30 min)",
    report: REPORT,
    status: "fixed",
    async run(t) {
      const { thread, reply } = await chat(t, CHANGED, T5_CHANGE, false);
      expect(issueOf(thread.proposal), `the manager's change was not taken:\n${reply.content}`).toMatch(/30 min/);
      expect(issueOf(thread.proposal)).not.toMatch(/45 min/);
    },
  },
];
