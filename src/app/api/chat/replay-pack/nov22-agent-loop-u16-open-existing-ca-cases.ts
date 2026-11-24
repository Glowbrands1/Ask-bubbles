import { expect, vi } from "vitest";

import { WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * "PUT UP THE VERBAL CA FOR <P>" OPENS THE ONE ON FILE (QA's live round-2 re-run on production f9461c1, 22 Nov 2026, U16)
 * ============================================================================
 *
 * A global district manager (Pau's login is admin/global). Briony Kask (the tester's invented person) has several
 * finalized and revised Corrective Actions on file, some of them Verbal Warnings. T1 "put up the verbal CA for Briony
 * Kask" started a NEW card instead of opening the existing one (choose if several); T2 "create a verbal CA for Briony
 * Kask with all the same information given" answered "What happened?" with no Create, instead of copying it. With
 * AGENT_LOOP_LIVE=1 the real model plays both turns.
 */

const REPORT = "QA's live round-2 re-run (22 Nov 2026, U16): \"put up the verbal CA for <P>\" started a new card; \"… with all the same information given\" asked \"What happened?\" with no Create";
const BRIONY: DirectoryRow = { id: "e-briony-kask", firstName: "Briony", lastName: "Kask", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const T1 = "put up the verbal CA for Briony Kask";
const T2 = "create a verbal CA for Briony Kask with all the same information given";
const ADMIN = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
const ACCOUNT = "Briony did not complete the closing cleaning checklist on 11/14/26 and left the makery counters unwiped.";
/*
 * CHANGED ON PURPOSE (Pau's review, 24 Nov 2026 PHT, via QA: an employee had two finalized CAs for one no-show): a copy for
 * the SAME person with the SAME incident date as a form on file is that duplicate, so propose_form first asks "Briony
 * already has a Corrective Action for 11/14 (finalized …). Do you want to open that one, or is this a separate incident?"
 * (same_incident_on_file). The copy cases on 11/14 now check that question at T2, and the copy itself after T3 below.
 * A copy with another date (the 11/20 control) is never asked.
 */
const T3_SEPARATE = "it's a separate incident";
const ASKED_SAME_DAY = /Briony already has a Corrective Action for 11\/14 \(finalized[^)]*\)\. Do you want to open that one, or is this a separate incident\?/;
/** T3: the manager answered that it is separate; the same copy again, with their words and T2's quotes (one message back). */
const proposeAfterSeparate = (view: LoopView, account: string, extra: Record<string, unknown> = {}): LoopDecision => ({
  tool: "propose_form",
  input: { template_key: "dpoa", employee_name: "Briony Kask", person_evidence: evidenceFrom(view, "Briony Kask", 1), warning_level: "verbal", level_evidence: evidenceFrom(view, "verbal", 1), what_happened: account, policy: "Care and Cleaning of Equipment and Facilities", separate_incident_evidence: evidenceFrom(view, T3_SEPARATE), ...extra },
});

/**
 * Briony's Corrective Actions on file, as the Forms Register holds them: a Verbal Warning on 11/14 revised once (the
 * revision saved a day later; the original is then "revised"), and an earlier Written Warning.
 */
function onFile(t: ReplayContext): void {
  const ids = t.templateIds!("dpoa");
  const row = (id: string, formDate: string, createdAt: string, revises: string | null, status = "finalized") => ({
    id, ...ids, variant_key: null, employee_role: null,
    location_id: WEST_DODGE.primaryAreaId, location_name: "Omaha, West Dodge Rd", created_by: "another-manager", created_by_role: "location_manager",
    source: "ask_sunny", status, follow_up_date: null, archived_at: null, revises_instance_id: revises,
    template_key: "dpoa", template_name: "Corrective Action Form", employee_name: "Briony Kask", form_date: formDate,
    created_at: createdAt, updated_at: createdAt,
  });
  (t.forms() as Record<string, unknown>[]).push(
    row("ca-briony-written", "2026-10-02", "2026-10-02T15:00:00Z", null),
    /* A finalized revision moves its original to "revised" (`supersedeRevised`). */
    row("ca-briony-verbal", "2026-11-14", "2026-11-14T15:00:00Z", null, "revised"),
    row("ca-briony-verbal-r1", "2026-11-14", "2026-11-15T16:30:00Z", "ca-briony-verbal"),
  );
  for (const id of ["ca-briony-verbal", "ca-briony-verbal-r1"]) {
    t.typeOnForm(id, { observation: ACCOUNT, policy_violated: "Care and Cleaning of Equipment and Facilities" });
    t.checkOnForm!(id, { warning_type: ["verbal"] });
  }
  t.typeOnForm("ca-briony-written", { observation: "Briony was 25 minutes late to open on 10/2/26.", policy_violated: "Attendance" });
  t.checkOnForm!("ca-briony-written", { warning_type: ["written"] });
}


/*
 * QA's ruling (22 Nov 2026, Bubbles round 3): a copied form keeps the date of the form it copies, unless the manager
 * states a new one. The copy's account here carries no date of its own, so only the form on file's form_date can give it.
 */
const COPY_ACCOUNT = "Briony did not complete the closing cleaning checklist and left the makery counters unwiped.";
const T2_NEW_DATE = "create a verbal CA for Briony Kask with all the same information given, it happened again on 11/20";

function copyCase(id: string, title: string, second: string, expected: string): ReplayCase {
  return {
    id,
    title,
    report: "QA's ruling (22 Nov 2026, Bubbles round 3, U16): a copied form keeps the date of the form it copies unless the manager states a new one",
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
      t.directory([...LOOP_STAFF, BRIONY]);
      t.as("admin", ADMIN);
      onFile(t);
      for (const form of ["ca-briony-verbal", "ca-briony-verbal-r1"]) t.typeOnForm(form, { observation: COPY_ACCOUNT });
      const model = loopStandIn((view): LoopDecision => {
        const found = lastResult(view, "find_past_forms") as { forms?: { choice?: string }[]; which_form_question?: string } | null;
        if (users(view) === 1) {
          if (!found) return { tool: "find_past_forms", input: { employee_name: "Briony Kask", form: "verbal CA", open: true, forms_on_file_evidence: evidenceFrom(view, T1) } };
          return { text: `${(found.forms ?? []).map((form) => `- ${form.choice}`).join("\n")}\n\n${found.which_form_question ?? ""}` };
        }
        const proposed = lastResult(view, "propose_form") as { card?: unknown; ask_exactly?: string } | null;
        if (proposed?.card) return { text: "Here's the Corrective Action Form for **Briony**." };
        if (proposed) return { text: proposed.ask_exactly ?? `Stopped: ${JSON.stringify(proposed)}` };
        if (users(view) === 3) {
          if (!lastResult(view, "read_form")) return { tool: "read_form", input: { instance_id: "ca-briony-verbal-r1", forms_on_file_evidence: evidenceFrom(view, second, 1) } };
          return proposeAfterSeparate(view, COPY_ACCOUNT);
        }
        const read = lastResult(view, "read_form");
        if (!read) return { tool: "read_form", input: { instance_id: "ca-briony-verbal-r1", forms_on_file_evidence: evidenceFrom(view, second) } };
        /* The stand-in leaves incident_date out, as the live model did. */
        return { tool: "propose_form", input: { template_key: "dpoa", employee_name: "Briony Kask", person_evidence: evidenceFrom(view, "Briony Kask"), warning_level: "verbal", level_evidence: evidenceFrom(view, "verbal"), what_happened: COPY_ACCOUNT, policy: "Care and Cleaning of Equipment and Facilities" } };
      });
      t.loopModel!(model);
      const thread = t.thread();
      await thread.say(T1);
      let copied = await thread.say(second);
      /* CHANGED ON PURPOSE (see T3_SEPARATE): a copy on the form on file's own date asks first; the manager says it is separate. */
      if (expected === "2026-11-14") {
        expect(copied.formProposal ?? null, `a second CA for 11/14 was put up with no word of the one on file:\n${copied.content}`).toBeNull();
        expect(copied.content).toMatch(ASKED_SAME_DAY);
        copied = await thread.say(T3_SEPARATE);
      } else {
        expect(copied.content, "a copy with a new date was asked about").not.toMatch(/separate incident/);
      }
      expect(copied.formProposal?.templateKey, copied.content).toBe("dpoa");
      expect(copied.formProposal?.formDate ?? null, `the copy's date:\n${copied.content}`).toBe(expected);
    },
  };
}

const users = (view: LoopView) => view.turns.filter((turn) => turn.role === "user").length;

export const NOV22_AGENT_LOOP_U16_OPEN_EXISTING_CA_CASES: ReplayCase[] = [
  {
    id: "nov22-u16-put-up-opens-existing-ca",
    title: `U16 verbatim: "${T1}" (admin; Briony has CAs on file) looks up her forms on file and never starts a new card; "${T2}" makes a card that carries the form on file's account, never "What happened?"`,
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
      t.directory([...LOOP_STAFF, BRIONY]);
      t.as("admin", ADMIN);
      onFile(t);
      const model = loopStandIn((view): LoopDecision => {
        const found = lastResult(view, "find_past_forms") as { forms?: { choice?: string }[]; which_form_question?: string } | null;
        if (users(view) === 1) {
          if (!found) return { tool: "find_past_forms", input: { employee_name: "Briony Kask", form: "verbal CA", open: true, forms_on_file_evidence: evidenceFrom(view, T1) } };
          return { text: `${(found.forms ?? []).map((form) => `- ${form.choice}`).join("\n")}\n\n${found.which_form_question ?? ""}` };
        }
        const proposed = lastResult(view, "propose_form") as { card?: unknown; ask_exactly?: string } | null;
        if (proposed?.card) return { text: "Here's the Corrective Action Form for **Briony**." };
        if (proposed) return { text: proposed.ask_exactly ?? `Stopped: ${JSON.stringify(proposed)}` };
        if (users(view) === 3) {
          if (!lastResult(view, "read_form")) return { tool: "read_form", input: { instance_id: "ca-briony-verbal-r1", forms_on_file_evidence: evidenceFrom(view, T2, 1) } };
          return proposeAfterSeparate(view, ACCOUNT);
        }
        const read = lastResult(view, "read_form");
        if (!read) return { tool: "read_form", input: { instance_id: "ca-briony-verbal-r1", forms_on_file_evidence: evidenceFrom(view, T2) } };
        return { tool: "propose_form", input: { template_key: "dpoa", employee_name: "Briony Kask", person_evidence: evidenceFrom(view, "Briony Kask"), warning_level: "verbal", level_evidence: evidenceFrom(view, "verbal"), what_happened: ACCOUNT, policy: "Care and Cleaning of Equipment and Facilities" } };
      });
      t.loopModel!(model);
      const thread = t.thread();
      const first = await thread.say(T1);
      expect(first.formProposal ?? null, `T1 started a new card instead of opening the one on file:\n${first.content}`).toBeNull();
      const lookups = model.views.flatMap((view) => view.results.filter((result) => result.tool === "find_past_forms").map((result) => result.output as { forms?: { instance_id: string }[]; best_match?: string }));
      expect(lookups.length, `T1 never looked at the forms on file:\n${first.content}`).toBeGreaterThan(0);
      /* The verbal CA asked for is one form: its current version, never the Written Warning or the original its revision replaced. */
      const offered = lookups.flatMap((found) => [...(found.forms ?? []).map((form) => form.instance_id), ...(found.best_match ? [found.best_match] : [])]);
      expect([...new Set(offered)], JSON.stringify(lookups)).toEqual(["ca-briony-verbal-r1"]);
      const second = await thread.say(T2);
      expect(second.content, `T2 asked what happened instead of copying the form on file:\n${second.content}`).not.toMatch(/what happened\?/i);
      /* CHANGED ON PURPOSE (see T3_SEPARATE): the copy on the form on file's own date asks first; the manager says it is separate. */
      expect(second.content).toMatch(ASKED_SAME_DAY);
      const third = await thread.say(T3_SEPARATE);
      expect(third.formProposal?.templateKey, third.content).toBe("dpoa");
      expect(String((third.formProposal as { issue?: string } | undefined)?.issue ?? ""), third.content).toMatch(/closing cleaning checklist/);
    },
  },
  copyCase(
    "nov22-r3-u16-copy-keeps-the-copied-forms-date",
    `U16 (round 3): "${T2}" copies the Verbal Warning of 11/14; the copy's date is that form's date (2026-11-14), never today`,
    T2,
    "2026-11-14",
  ),
  copyCase(
    "nov22-r3-u16-control-copy-with-a-new-date-takes-it",
    `U16 control: "${T2_NEW_DATE}" states a new date; the copy takes 2026-11-20, not the copied form's 11/14`,
    T2_NEW_DATE,
    "2026-11-20",
  ),
  {
    id: "nov22-r3-u16-lookup-with-open-never-blocks-the-copy",
    title: `U16 (round 3, live on main too): "${T2}" after the form was opened; the model looks it up again with open: true, and the copy the manager's words ask for is still made (never "open it with open_form")`,
    report: "QA's Bubbles live round 3 regression set (22 Nov 2026, U16): T2 looked the form up again with open: true and propose_form refused the copy (open_requested)",
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
      t.directory([...LOOP_STAFF, BRIONY]);
      t.as("admin", ADMIN);
      onFile(t);
      const model = loopStandIn((view): LoopDecision => {
        const found = lastResult(view, "find_past_forms") as { forms?: { choice?: string }[]; which_form_question?: string } | null;
        if (users(view) === 1) {
          if (!found) return { tool: "find_past_forms", input: { employee_name: "Briony Kask", form: "verbal CA", open: true, forms_on_file_evidence: evidenceFrom(view, T1) } };
          return { text: `${(found.forms ?? []).map((form) => `- ${form.choice}`).join("\n")}\n\n${found.which_form_question ?? ""}` };
        }
        const proposed = lastResult(view, "propose_form") as { card?: unknown } | null;
        if (proposed?.card) return { text: "Here's the Corrective Action Form for **Briony**." };
        if (proposed) return { text: (proposed as { ask_exactly?: string }).ask_exactly ?? `Stopped: ${JSON.stringify(proposed)}` };
        if (users(view) === 3) {
          if (!lastResult(view, "read_form")) return { tool: "read_form", input: { instance_id: "ca-briony-verbal-r1", forms_on_file_evidence: evidenceFrom(view, T2, 1) } };
          return proposeAfterSeparate(view, ACCOUNT, { new_form_evidence: evidenceFrom(view, "create a verbal CA", 1) });
        }
        /* T2: look the form up again with open: true (as the live model did), read it, then propose the copy. */
        const lookups = view.results.filter((result) => result.tool === "find_past_forms").length;
        if (lookups < 2) return { tool: "find_past_forms", input: { employee_name: "Briony Kask", form: "verbal CA", open: true, forms_on_file_evidence: evidenceFrom(view, T2) } };
        if (!lastResult(view, "read_form")) return { tool: "read_form", input: { instance_id: "ca-briony-verbal-r1", forms_on_file_evidence: evidenceFrom(view, T2) } };
        return { tool: "propose_form", input: { template_key: "dpoa", employee_name: "Briony Kask", person_evidence: evidenceFrom(view, "Briony Kask"), new_form_evidence: evidenceFrom(view, "create a verbal CA"), warning_level: "verbal", level_evidence: evidenceFrom(view, "verbal"), what_happened: ACCOUNT, policy: "Care and Cleaning of Equipment and Facilities" } };
      });
      t.loopModel!(model);
      const thread = t.thread();
      await thread.say(T1);
      const asked = await thread.say(T2);
      expect(asked.content).not.toMatch(/open_requested|open it with open_form/i);
      /* CHANGED ON PURPOSE (see T3_SEPARATE): the copy on the form on file's own date asks first; the manager says it is separate. */
      expect(asked.content).toMatch(ASKED_SAME_DAY);
      const copied = await thread.say(T3_SEPARATE);
      expect(copied.formProposal?.templateKey, copied.content).toBe("dpoa");
      expect(copied.content).not.toMatch(/open_requested|open it with open_form/i);
    },
  },
];
