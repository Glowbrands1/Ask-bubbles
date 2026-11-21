import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * QA'S LIVE RE-TEST OF THE LOOP (21 Nov 2026, Pau's account, agent loop on, production 3e2c30dd): ITEMS 14, 15, 16, 18
 * ============================================================================
 *
 * QA's exact wording, with the people swapped for the loop cases' invented roster (`loop-roster.ts`). The stand-in plays
 * the model; the route, the tools, the Forms Register and Create are real.
 */

const REPORT = "QA's live re-test (21 Nov 2026, Pau's account, agent loop on, production 3e2c30dd)";

function start(t: ReplayContext, day = "2026-11-21T18:40:00Z") {
  vi.setSystemTime(new Date(day));
  t.directory([...LOOP_STAFF]);
  t.as("location_manager", WEST_DODGE);
}

/** A Corrective Action Form on file for this person, as the Forms Register lists one. */
function caOnFile(t: ReplayContext, id: string, employee: string, formDate: string, status = "finalized", revises: string | null = null): void {
  (t.forms() as Record<string, unknown>[]).push({
    id,
    template_id: "t",
    template_version_id: "v",
    variant_key: null,
    employee_role: null,
    location_id: WEST_DODGE.primaryAreaId,
    location_name: "Omaha, West Dodge Rd",
    created_by: "another-manager",
    created_by_role: "location_manager",
    source: "ask_sunny",
    status,
    follow_up_date: null,
    archived_at: null,
    revises_instance_id: revises,
    template_key: "dpoa",
    template_name: "Corrective Action Form",
    employee_name: employee,
    form_date: formDate,
    created_at: `${formDate}T15:00:00Z`,
    updated_at: `${formDate}T15:00:00Z`,
  });
}

export const NOV21_AGENT_LOOP_LIVE_RETEST_U_CASES: ReplayCase[] = [
  {
    id: "nov21-agent-loop-first-name-possessive-opens-forms-on-file",
    title: "\"bring up fennas corrective action\" (a first name, its possessive typed with no apostrophe, one roster person): the forms on file are listed straight away, never \"do you want to look at …'s forms on file?\"",
    report: `${REPORT}, item 15 (A12): "bring up <firstname>s corrective action" → only "do you want to look at <full name>'s corrective action forms on file?"`,
    status: "fixed",
    async run(t) {
      start(t);
      caOnFile(t, "ca-fenna-1", "Fenna Prewitt", "2026-11-14");
      caOnFile(t, "ca-fenna-2", "Fenna Prewitt", "2026-10-30");
      const model = loopStandIn((view): LoopDecision => {
        if (!lastResult(view, "find_staff")) return { tool: "find_staff", input: { name: "fenna", person_evidence: evidenceFrom(view, "fennas") } };
        const found = lastResult(view, "find_past_forms") as { forms?: { choice: string }[]; which_form_question?: string; error?: string } | null;
        if (!found) return { tool: "find_past_forms", input: { employee_name: "Fenna Prewitt", form: "corrective action", open: true, forms_on_file_evidence: evidenceFrom(view, "bring up fennas corrective action") } };
        if (found.forms?.length) return { text: `Fenna Prewitt has ${found.forms.length} Corrective Action Forms on file:\n${found.forms.map((form) => `- ${form.choice}`).join("\n")}\n\n${found.which_form_question ?? ""}` };
        return { text: "Do you want to look at Fenna Prewitt's Corrective Action Forms on file?" };
      });
      t.loopModel!(model);
      const reply = await t.thread().say("bring up fennas corrective action");
      const found = model.views.flatMap((view) => view.results.filter((result) => result.tool === "find_past_forms")).at(-1)?.output as { reason_code?: string; forms?: unknown[] } | undefined;
      expect(found?.reason_code, `the forms on file were refused:\n${JSON.stringify(found)}`).toBeUndefined();
      expect(found?.forms, "the forms on file were not listed").toHaveLength(2);
      expect(reply.content, `the reply asks for a confirmation instead of listing:\n${reply.content}`).not.toMatch(/do you want to look at/i);
      expect(reply.content).toContain("Which one should I open?");
      // Control: a first name that is ANOTHER person's never opens this person's forms.
      const other = loopStandIn((view): LoopDecision => {
        if (!lastResult(view, "find_past_forms")) return { tool: "find_past_forms", input: { employee_name: "Fenna Prewitt", open: true, forms_on_file_evidence: evidenceFrom(view, "bring up thaddeas corrective action") } };
        return { text: "ok" };
      });
      t.loopModel!(other);
      await t.thread().say("bring up thaddeas corrective action");
      const refused = other.views.flatMap((view) => view.results.filter((result) => result.tool === "find_past_forms")).at(-1)?.output as { reason_code?: string } | undefined;
      expect(refused?.reason_code, "another person's first name opened this person's forms").toBe("privacy_not_this_person");
    },
  },
];
