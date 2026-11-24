import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * PRIOR_FORMS_UP_TO_TODAY — EVERY PAST FORM IS LISTED, THE FORM KEEPS ITS DATE (Pau, 24 Nov 2026)
 * ============================================================================
 *
 * Pau's words, the employee's name swapped for an invented one: "but this is aldy finalized so why not added by aio",
 * "it needs to add all past forms". A new Corrective Action for being late on September 11, 2026 is dated 09/11/2026;
 * her Corrective Action finalized on 09/12/2026 counted as "after" it and was left off "List previously received
 * coaching and/or corrective action with date signed". Pau chose (24 Nov 2026) to keep the form's Date the incident's
 * day (dating it today broke the same-incident check) and list every finalized form up to today. Every person is
 * invented.
 */
type T = ReplayContext;

const STORE = "loc-264";
const ODESSA: DirectoryRow = {
  id: "e-odessa-quarrie",
  firstName: "Odessa",
  lastName: "Quarrie",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: [STORE],
  positionName: "Team Member Part Time",
};
const NAME = "Odessa Quarrie";
const TODAY = "2026-11-24";
const FLAG = "PRIOR_FORMS_UP_TO_TODAY_ENABLED";
const REPORT = `Pau, 24 Nov 2026: "but this is aldy finalized so why not added by aio", "it needs to add all past forms"; invented person`;

/** The invented people of this file (a function: the registry reads exported arrays as cases). */
export function nov24PriorFormsUpToTodayPeople(): readonly DirectoryRow[] {
  return [ODESSA];
}

/** Her Corrective Action finalized on 09/12/2026, and the new one for being late on September 11, 2026. */
async function lateOnSeptember11(t: T): Promise<{ formDate: unknown; prior: string }> {
  vi.setSystemTime(new Date(`${TODAY}T17:00:00Z`));
  t.directory([...STAFF, ODESSA]);
  t.as("location_manager", WEST_DODGE);

  const earlier = t.thread();
  await earlier.say(`verbal ca for ${NAME}, she was late to work on 9/12/26. no payroll deduct`);
  expect(earlier.proposal, "no Corrective Action card to put on file").toMatchObject({ templateKey: "dpoa", employeeName: NAME });
  t.draftWrites({});
  const onFile = await earlier.create();
  Object.assign(t.forms().find((row) => row.id === onFile)!, { status: "finalized", form_date: "2026-09-12" });

  const thread = t.thread();
  await thread.say(`create a corrective action for ${NAME}, she was late to work on September 11, 2026. no payroll deduct`);
  expect(thread.proposal, `no Corrective Action card for ${NAME}`).toMatchObject({ templateKey: "dpoa", employeeName: NAME });
  t.draftWrites({ observation: `${NAME} was late to work on 09/11/2026.` });
  const id = await thread.create();
  return { formDate: t.forms().find((row) => row.id === id)?.form_date, prior: t.values(id).prior_actions ?? "" };
}

export const NOV24_PRIOR_FORMS_UP_TO_TODAY_CASES: ReplayCase[] = [
  {
    id: "nov24-prior-forms-up-to-today-late-september-11",
    title: `"create a corrective action for <name>, she was late to work on September 11, 2026" — the form keeps 09/11, and the CA finalized 09/12 is listed`,
    report: REPORT,
    status: "fixed", // PRIOR_FORMS_UP_TO_TODAY_ENABLED is on in production (Pau, 24 Nov 2026)
    fixFlags: [FLAG],
    async run(t: T) {
      const { formDate, prior } = await lateOnSeptember11(t);
      expect(formDate, "the form lost the incident's date").toBe("2026-09-11");
      expect(prior, `the Corrective Action finalized on 09/12/2026 is not on the history:\n${prior}`).toMatch(/09\/12\/2026/);
    },
  },
  {
    id: "nov24-prior-forms-up-to-today-late-september-11-agent-loop",
    title: `the same through the agent loop: the card keeps 09/11, and the CA finalized 09/12 is offered as history`,
    report: REPORT,
    status: "fixed", // PRIOR_FORMS_UP_TO_TODAY_ENABLED is on in production (Pau, 24 Nov 2026)
    fixFlags: [FLAG],
    async run(t: T) {
      vi.setSystemTime(new Date(`${TODAY}T17:00:00Z`));
      t.directory([...LOOP_STAFF, ODESSA]);
      t.as("location_manager", WEST_DODGE);
      (t.forms() as Record<string, unknown>[]).push({
        id: "ca-odessa-q-0912", ...t.templateIds!("dpoa"), variant_key: null, employee_role: null, location_id: STORE, location_name: "Omaha, West Dodge Rd",
        created_by: "another-manager", created_by_role: "location_manager", source: "chat", status: "finalized", follow_up_date: null, archived_at: null,
        revises_instance_id: null, template_key: "dpoa", template_name: "Corrective Action Form", employee_name: NAME, form_date: "2026-09-12",
        created_at: "2026-09-12T15:00:00Z", updated_at: "2026-09-12T15:00:00Z",
      });
      t.checkOnForm!("ca-odessa-q-0912", { warning_type: ["verbal"] });
      const model = loopStandIn((view): LoopDecision => {
        if (lastResult(view, "propose_form")) return { text: `Here's the Corrective Action Form for **${NAME}**.` };
        return {
          tool: "propose_form",
          input: {
            template_key: "dpoa",
            employee_id: ODESSA.id,
            person_evidence: evidenceFrom(view, NAME),
            warning_level: "verbal",
            level_evidence: evidenceFrom(view, "verbal"),
            what_happened: "Odessa was late to work on September 11, 2026.",
            policy: headingWith(view, /attendance/i),
            incident_date: "2026-09-11",
            payroll_deduct: "no",
          },
        };
      });
      t.loopModel!(model);
      const thread = t.thread();
      await thread.say(`create a verbal CA for ${NAME}, she was late to work on September 11, 2026. no payroll deduct`);
      expect(thread.proposal, `no Corrective Action card for ${NAME}`).toMatchObject({ templateKey: "dpoa", employeeName: NAME });
      expect((thread.proposal as { formDate?: string | null }).formDate ?? null, "the card lost the incident's date").toBe("2026-09-11");
      const offers = model.views.flatMap((view) => view.results.filter((result) => result.tool === "propose_form"))
        .map((result) => JSON.stringify((result.output as { facts?: { prior_on_file?: unknown } } | null)?.facts?.prior_on_file ?? ""))
        .join("\n");
      expect(offers, "the Corrective Action finalized on 09/12/2026 is not offered as history").toMatch(/09\/12\/2026|2026-09-12/);
    },
  },
];
