import { expect, vi } from "vitest";

import { WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * FORMS ON FILE ARE OFFERED, NEVER ADDED ON THEIR OWN (Pau's ruling, 23 Nov 2026, via QA; a manager did not like it)
 * ============================================================================
 *
 * Prior actions hold only the steps the manager states, or a form on file they say yes to. When this person has forms on
 * file from before the incident, the card's reply offers them in one line ("<P> has a Verbal CA on file from 10/02/2026.
 * Want me to add it to Prior actions?"), and one is added only on the manager's yes or when they name it. This reverses
 * the old auto-fill (QA item 22 / f029). The person is invented (Briony Kask, one Verbal CA on file from 10/02/2026).
 */

const REPORT = "Pau's ruling (23 Nov 2026, via QA): the AI added forms on file to the card's Prior actions on its own";
const BRIONY: DirectoryRow = { id: "e-briony-kask", firstName: "Briony", lastName: "Kask", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const T1 = "create a written CA for Briony Kask. On 11-1-26 Briony violated care and cleaning of facilities policy";
const ACCOUNT = "On 11/1/26 Briony violated the care and cleaning of facilities policy.";
/* The reply shows the first name, as every reply shortens the card's person (`fullNamesShortened`). */
const OFFER = /Briony(?: Kask)? has a Verbal CA on file from 10\/02\/2026\. Want me to add it to Prior actions\?/;

function start(t: ReplayContext): void {
  vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
  t.directory([...LOOP_STAFF, BRIONY]);
  t.as("admin", { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] });
  (t.forms() as Record<string, unknown>[]).push({
    id: "ca-briony-1002", ...t.templateIds!("dpoa"), variant_key: null, employee_role: null, location_id: WEST_DODGE.primaryAreaId, location_name: "Omaha, West Dodge Rd",
    created_by: "another-manager", created_by_role: "location_manager", source: "chat", status: "finalized", follow_up_date: null, archived_at: null,
    revises_instance_id: null, template_key: "dpoa", template_name: "Corrective Action Form", employee_name: "Briony Kask", form_date: "2026-10-02",
    created_at: "2026-10-02T15:00:00Z", updated_at: "2026-10-02T15:00:00Z",
  });
  t.checkOnForm!("ca-briony-1002", { warning_type: ["verbal"] });
}

const managerSaid = (view: LoopView) => view.turns.filter((turn) => turn.role === "user" && !turn.text.includes("[app check]")).at(-1)?.text ?? "";

/** The model: the card from T1 (its account, date, policy, level), with `prior` as prior_actions; the reply ends with any offer. */
function model(prior: (view: LoopView) => string | undefined) {
  return loopStandIn((view): LoopDecision => {
    const result = lastResult(view, "propose_form") as { card?: { employee?: string; prior_actions?: string | null }; facts?: { prior_on_file?: { ask_exactly?: string } } } | null;
    if (result) return { text: [`Here's the Corrective Action Form for **${result.card?.employee ?? "Briony Kask"}**.`, ...(result.card?.prior_actions ? [`**Prior actions:** ${result.card.prior_actions}`] : []), ...(result.facts?.prior_on_file?.ask_exactly ? [result.facts.prior_on_file.ask_exactly] : [])].join("\n\n") };
    const steps = prior(view);
    return {
      tool: "propose_form",
      input: {
        template_key: "dpoa", employee_id: BRIONY.id, person_evidence: evidenceFrom(view, "Briony Kask", managerSaid(view).startsWith(T1) ? 0 : 1),
        warning_level: "written", level_evidence: evidenceFrom(view, "written", managerSaid(view).startsWith(T1) ? 0 : 1),
        what_happened: ACCOUNT, incident_date: "2026-11-01", policy: headingWith(view, /care and cleaning/i),
        ...(steps ? { prior_actions: steps } : {}),
      },
    };
  });
}

const prior = (thread: { proposal: unknown }) => (thread.proposal as { priorActions?: string | null } | null)?.priorActions ?? "";

export const NOV23_AGENT_LOOP_FORMS_ON_FILE_OFFERED_CASES: ReplayCase[] = [
  {
    id: "nov23-forms-on-file-not-added-offered",
    title: "Pau's ruling: a CA for <P> with a Verbal CA on file from 10/2 — the card's Prior actions stay empty (no auto-add), and the reply offers it in one line",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      t.loopModel!(model(() => undefined));
      const thread = t.thread();
      const reply = await thread.say(T1);
      // CHANGED ON PURPOSE (Pau, 26 Nov 2026: "Ai saw prior forms but i need them here"; PRIOR_ON_FILE_ON_CARD_ENABLED, port from the sibling app): forms on file are put on the card's Prior actions by the app, each saying what it is, and never offered.
      expect(prior(thread), "the form on file is not on the card").toMatch(/Verbal Warning, finalized — 10\/02\/2026/);
      expect(reply.content, `the form on the card was offered too:\n${reply.content}`).not.toMatch(OFFER);
    },
  },
  {
    id: "nov23-forms-on-file-model-adds-unasked-not-kept",
    title: "Pau's ruling: the model passing the form on file as a prior step before the manager said yes — it is not kept, and the offer is made",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      t.loopModel!(model(() => "Corrective Action Form, Verbal Warning — 10/02/2026"));
      const thread = t.thread();
      const reply = await thread.say(T1);
      // CHANGED ON PURPOSE (Pau, 26 Nov 2026: "Ai saw prior forms but i need them here"; PRIOR_ON_FILE_ON_CARD_ENABLED, port from the sibling app): forms on file are put on the card's Prior actions by the app, each saying what it is, and never offered. The model's copy adds no second line.
      expect(prior(thread).match(/10\/02\/2026/g) ?? [], prior(thread)).toHaveLength(1);
      expect(reply.content).not.toMatch(OFFER);
    },
  },
  {
    id: "nov23-forms-on-file-yes-adds-it",
    title: "Pau's ruling: \"yes\" to the offer adds the Verbal CA of 10/2 to Prior actions, and the offer is not made again",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      t.loopModel!(model((view) => (managerSaid(view) === "yes" ? "Corrective Action Form, Verbal Warning — 10/02/2026" : undefined)));
      const thread = t.thread();
      await thread.say(T1);
      const reply = await thread.say("yes");
      // CHANGED ON PURPOSE (Pau, 26 Nov 2026: "Ai saw prior forms but i need them here"; PRIOR_ON_FILE_ON_CARD_ENABLED, port from the sibling app): forms on file are put on the card's Prior actions by the app, each saying what it is, and never offered. A "yes" changes nothing: the form is already on the card, once.
      expect(prior(thread).match(/10\/02\/2026/g) ?? [], prior(thread)).toHaveLength(1);
      expect(reply.content, "the offer was made again").not.toMatch(/Want me to add it to Prior actions/);
    },
  },
  {
    id: "nov23-forms-on-file-manager-typed-step-lands",
    title: "Pau's ruling, control: the manager's own typed step (\"she had a verbal on 10/2\") lands on Prior actions, with no offer of the same form",
    report: REPORT,
    status: "fixed",
    async run(t) {
      start(t);
      t.loopModel!(model(() => "Verbal CA — 10/02/2026"));
      const thread = t.thread();
      const reply = await thread.say(`${T1}, she had a verbal on 10/2`);
      expect(prior(thread), "the manager's own step is not on Prior actions").toMatch(/10\/02\/2026/);
      expect(reply.content, "the form the manager named was offered").not.toMatch(/Want me to add it to Prior actions/);
    },
  },
];
