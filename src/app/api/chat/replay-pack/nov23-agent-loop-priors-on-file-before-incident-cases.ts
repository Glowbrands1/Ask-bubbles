import { expect, vi } from "vitest";

import { WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * A FORM ON FILE IS A PRIOR ACTION ONLY WHEN IT CAME BEFORE THIS INCIDENT (QA's live re-run on 9340334, 23 Nov 2026, U09)
 * ============================================================================
 *
 * U09's turns, word for word (the person invented by the tester: Briony Kask, with forms on file): T1 "create a written CA
 * for Briony Kask." T2 "JBA Policy Manual 1-1-2026, Verbal CA 11-1-2026. On 11-1-26 Briony violated care and cleaning of
 * facilities policy". Live, the card's Prior actions listed ten forms on file dated 11/10–11/17, all after the incident of
 * 11/1. A form dated before the incident is still listed.
 */

const REPORT = "QA's live re-run (23 Nov 2026, U09 on 9340334): Prior actions listed forms on file dated after the incident (11/10–11/17 for an incident on 11/1)";
const BRIONY: DirectoryRow = { id: "e-briony-kask", firstName: "Briony", lastName: "Kask", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const T1 = "create a written CA for Briony Kask.";
const T2 = "JBA Policy Manual 1-1-2026, Verbal CA 11-1-2026. On 11-1-26 Briony violated care and cleaning of facilities policy";
const ADMIN = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };

/** Briony's finalized forms on file: one before the incident (10/2), two after it (11/10, 11/17). */
function onFile(t: ReplayContext): void {
  const row = (id: string, formDate: string) => ({
    id, ...t.templateIds!("dpoa"), variant_key: null, employee_role: null, location_id: WEST_DODGE.primaryAreaId, location_name: "Omaha, West Dodge Rd",
    created_by: "another-manager", created_by_role: "location_manager", source: "chat", status: "finalized", follow_up_date: null, archived_at: null,
    revises_instance_id: null, template_key: "dpoa", template_name: "Corrective Action Form", employee_name: "Briony Kask", form_date: formDate,
    created_at: `${formDate}T15:00:00Z`, updated_at: `${formDate}T15:00:00Z`,
  });
  (t.forms() as Record<string, unknown>[]).push(row("ca-briony-1002", "2026-10-02"), row("ca-briony-1110", "2026-11-10"), row("ca-briony-1117", "2026-11-17"));
  for (const id of ["ca-briony-1002", "ca-briony-1110", "ca-briony-1117"]) t.checkOnForm!(id, { warning_type: ["verbal"] });
}

export const NOV23_AGENT_LOOP_PRIORS_ON_FILE_BEFORE_INCIDENT_CASES: ReplayCase[] = [
  {
    id: "nov23-u09-forms-on-file-before-incident-only",
    title: "U09 (T1–T2 verbatim, incident 11/1): the forms on file offered for Prior actions (Pau's 23 Nov ruling: offered, never added unasked) name the form of 10/2 and never those of 11/10 and 11/17, which came after the incident — also when the card is proposed again with no incident date",
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
      t.directory([...LOOP_STAFF, BRIONY]);
      t.as("admin", ADMIN);
      onFile(t);
      const model = loopStandIn((view): LoopDecision => {
        /* The manager's latest turn (a hand-back's "[app check]" note is not one). */
        const said = view.turns.filter((turn) => turn.role === "user" && !turn.text.includes("[app check]")).at(-1)?.text ?? "";
        const level = { warning_level: "written", level_evidence: evidenceFrom(view, "written", said.startsWith("JBA") ? 1 : 0) };
        const proposals = view.results.filter((entry) => entry.tool === "propose_form").length;
        /* As live: at T2 the card is proposed again in the same turn, this time with no incident date. */
        if (said.startsWith("JBA") && proposals === 1) return { tool: "propose_form", input: { template_key: "dpoa", employee_id: BRIONY.id, ...level, what_happened: "On 11/1/26 Briony violated the care and cleaning of facilities policy.", policy: headingWith(view, /care and cleaning/i), person_evidence: evidenceFrom(view, "Briony", 0) } };
        if (lastResult(view, "propose_form")) return { text: "Here's the Corrective Action Form for **Briony Kask**." };
        if (!said.startsWith("JBA")) return { tool: "propose_form", input: { template_key: "dpoa", employee_id: BRIONY.id, ...level, person_evidence: evidenceFrom(view, "Briony Kask") } };
        /* The account and the incident's date; no prior steps of the model's own, so the card's are the forms on file. */
        return { tool: "propose_form", input: { template_key: "dpoa", employee_id: BRIONY.id, ...level, what_happened: "On 11/1/26 Briony violated the care and cleaning of facilities policy.", incident_date: "2026-11-01", policy: headingWith(view, /care and cleaning/i), person_evidence: evidenceFrom(view, "Briony", 0) } };
      });
      t.loopModel!(model);
      const thread = t.thread();
      await thread.say(T1);
      await thread.say(T2);
      const prior = (thread.proposal as { priorActions?: string | null } | null)?.priorActions ?? "";
      /*
       * Changed on purpose (Pau's ruling, 23 Nov 2026, reversing the old f029 behaviour): forms on file are offered, never
       * put on Prior actions by the AI. The before-incident filter (#1083) now applies to the offer: it names 10/02 and
       * never 11/10 or 11/17, and the card's Prior actions hold neither.
       */
      expect(prior, "a form on file was put on Prior actions unasked").not.toMatch(/10\/02\/2026|11\/10\/2026|11\/17\/2026/);
      const offers = model.views.flatMap((view) => view.results.filter((result) => result.tool === "propose_form"))
        .map((result) => (result.output as { facts?: { prior_on_file?: { ask_exactly?: string } } } | null)?.facts?.prior_on_file?.ask_exactly ?? "")
        .join("\n");
      expect(offers, "a form on file dated after the incident is offered").not.toMatch(/11\/10\/2026|11\/17\/2026/);
      expect(offers, "the form on file of 10/2, before the incident, was never offered").toMatch(/10\/02\/2026/);
    },
  },
];
