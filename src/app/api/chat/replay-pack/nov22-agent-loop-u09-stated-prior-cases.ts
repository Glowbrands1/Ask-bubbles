import { expect, vi } from "vitest";

import { WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * THE PRIOR ACTIONS THE MANAGER STATES ARE THE CARD'S (QA's live round-2 re-run on production f9461c1, 22 Nov 2026, U09)
 * ============================================================================
 *
 * A global district manager. T1 "create a written CA for Briony Kask." T2 "JBA Policy Manual 1-1-2026, Verbal CA
 * 11-1-2026. On 11-1-26 Briony violated care and cleaning of facilities policy". Live (#1015 merged): the stated prior
 * actions were NOT listed (Prior actions kept the forms-on-file list), and "(JBA Policy Manual 1/1/2026)" landed in the
 * Observation. Briony (the tester's invented person) has Corrective Actions on file. With AGENT_LOOP_LIVE=1 the real
 * model plays both turns.
 */

const REPORT = "QA's live round-2 re-run (22 Nov 2026, U09): the stated prior actions were not listed (the forms-on-file list stayed) and \"(JBA Policy Manual 1/1/2026)\" was put in the Observation";
const BRIONY: DirectoryRow = { id: "e-briony-kask", firstName: "Briony", lastName: "Kask", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const T1 = "create a written CA for Briony Kask.";
const T2 = "JBA Policy Manual 1-1-2026, Verbal CA 11-1-2026. On 11-1-26 Briony violated care and cleaning of facilities policy";
const ADMIN = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };

/** Briony's Corrective Actions on file (an earlier Written Warning, and one in October), as saved. */
function onFile(t: ReplayContext): void {
  const ids = t.templateIds!("dpoa");
  const row = (id: string, formDate: string) => ({
    id, ...ids, variant_key: null, employee_role: null, location_id: WEST_DODGE.primaryAreaId, location_name: "Omaha, West Dodge Rd",
    created_by: "another-manager", created_by_role: "location_manager", source: "ask_sunny", status: "finalized", follow_up_date: null, archived_at: null,
    revises_instance_id: null, template_key: "dpoa", template_name: "Corrective Action Form", employee_name: "Briony Kask", form_date: formDate,
    created_at: `${formDate}T15:00:00Z`, updated_at: `${formDate}T15:00:00Z`,
  });
  (t.forms() as Record<string, unknown>[]).push(row("ca-briony-oct", "2026-10-02"), row("ca-briony-sep", "2026-09-12"));
  t.typeOnForm("ca-briony-oct", { observation: "Briony was 25 minutes late to open on 10/2/26." });
  t.checkOnForm!("ca-briony-oct", { warning_type: ["written"] });
  t.typeOnForm("ca-briony-sep", { observation: "Briony left the register drawer unlocked on 9/12/26." });
  t.checkOnForm!("ca-briony-sep", { warning_type: ["verbal"] });
}

const users = (view: LoopView) => view.turns.filter((turn) => turn.role === "user").length;
type Card = { card?: { prior_actions?: string | null; observation?: string | null } | null } | null;

export const NOV22_AGENT_LOOP_U09_STATED_PRIOR_CASES: ReplayCase[] = [
  {
    id: "nov22-u09-stated-prior-actions-on-the-card",
    title: `U09 verbatim: "${T1}" then "${T2}" (admin; Briony has CAs on file): Prior actions are the two the manager stated (the manual signed 1/1/2026, the Verbal CA 11/1/2026), and the Observation never holds the manual line, on the card and on the saved form after Create`,
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
      t.directory([...LOOP_STAFF, BRIONY]);
      t.as("admin", ADMIN);
      onFile(t);
      t.loopModel!(loopStandIn((view): LoopDecision => {
        const result = lastResult(view, "propose_form") as Card;
        if (result?.card) return { text: `Here's the Corrective Action Form for **Briony**.\n\n**Prior actions:** ${result.card.prior_actions ?? ""}\n**Observation of Offense:** ${result.card.observation ?? ""}` };
        if (result) return { text: "Noted." };
        const base = { template_key: "dpoa", employee_name: "Briony Kask", person_evidence: evidenceFrom(view, "Briony Kask", users(view) - 1), warning_level: "written", level_evidence: evidenceFrom(view, "written", users(view) - 1) };
        if (users(view) === 1) return { tool: "propose_form", input: base };
        return { tool: "propose_form", input: { ...base, /* As the tester's live model wrote it: the manual step in the account, in parentheses. */ what_happened: "On 11/1/26 Briony violated care and cleaning of facilities policy (JBA Policy Manual 1/1/2026).", incident_date: "2026-11-01", policy: "Care and Cleaning of Equipment and Facilities", prior_actions: "Signed JBA Policy Manual 1/1/2026; Verbal Warning 11/1/2026", prior_actions_evidence: evidenceFrom(view, "JBA Policy Manual 1-1-2026, Verbal CA 11-1-2026") } };
      }));
      const thread = t.thread();
      await thread.say(T1);
      const reply = await thread.say(T2);
      const card = (thread.proposal ?? {}) as { priorActions?: string | null; issue?: string | null };
      const prior = String(card.priorActions ?? "");
      expect(prior, `the stated prior actions are not on the card:\n${reply.content}`).toMatch(/Policy Manual[^;]*\b0?1[-/]0?1[-/](?:20)?26\b|\b0?1[-/]0?1[-/](?:20)?26\b[^;]*Policy Manual/i);
      expect(prior, `the stated Verbal CA is not on the card:\n${reply.content}`).toMatch(/Verbal[^;]*\b11[-/]0?1[-/](?:20)?26\b|\b11[-/]0?1[-/](?:20)?26\b[^;]*Verbal/i);
      expect(String(card.issue ?? ""), `the manual line is in the Observation:\n${reply.content}`).not.toMatch(/Policy Manual/i);
      /*
       * The tester's answer (QA, 22 Nov 2026): live, the SAVED form's prior_actions also held only the forms-on-file list.
       * Both stated steps reach the saved Prior actions, and the manual date never the saved Observation.
       */
      t.draftWrites({ observation: "Observed:\nOn November 1, 2026, Briony did not follow the care and cleaning of facilities policy.\n\nExpectation:\nBriony is expected to follow the care and cleaning of facilities policy." });
      const id = await thread.create();
      const saved = t.values(id);
      expect(saved.prior_actions ?? "", JSON.stringify(saved)).toMatch(/Policy Manual[^;]*\b0?1[-/]0?1[-/](?:20)?26\b/i);
      expect(saved.prior_actions ?? "", JSON.stringify(saved)).toMatch(/Verbal[^;]*\b11[-/]0?1[-/](?:20)?26\b/i);
      expect(saved.observation ?? "", JSON.stringify(saved)).not.toMatch(/Policy Manual/i);
    },
  },
];
