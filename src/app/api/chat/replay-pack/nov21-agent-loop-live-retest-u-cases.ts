import { expect, vi } from "vitest";

import manual151 from "@/test/fixtures/jba-manual-production-151.json";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

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


/** The production manual's Confidential Information Policy page (p.21), as the pinned manual's rows hold it. */
const CONFIDENTIAL_CHUNK = (() => {
  const row = (manual151 as { chunks: { chunk_index: number; locator: string; page: number; section: string; content: string; metadata: { sections: unknown; printedPage: number } }[] }).chunks.find((chunk) => chunk.chunk_index === 70)!;
  return { chunkIndex: row.chunk_index, chunkId: `jba-${row.chunk_index}`, locator: row.locator, page: row.page, content: row.content, section: row.section, printedPage: row.metadata.printedPage, sections: row.metadata.sections };
})();

/** Item 18's request, word for word (the person swapped). */
const CONFIDENTIAL = "i need a verbal corrective action for thaddea kroll for leaving out confidential information in associates view";

type CardResult = { card?: { prior_actions?: string | null; observation?: string | null; policy?: string | null } | null; facts?: { stated?: Record<string, unknown>; stated_this_turn?: string[]; prior_on_file?: { line?: string; used_on_card?: boolean } } } | null;

/** The model of item 18: the Corrective Action card citing the Confidential Information heading, read back as the rules book teaches. */
function confidentialCard() {
  return loopStandIn((view: LoopView): LoopDecision => {
    const result = lastResult(view, "propose_form") as CardResult;
    if (!result) {
      return {
        tool: "propose_form",
        input: {
          template_key: "dpoa",
          employee_name: "thaddea kroll",
          person_evidence: evidenceFrom(view, "thaddea kroll"),
          what_happened: "Left out confidential information in associates view.",
          policy: headingWith(view, /confidential information/i) ?? "Confidential Information",
          warning_level: "verbal",
          level_evidence: evidenceFrom(view, "verbal"),
        },
      };
    }
    /*
     * The live model reads back each stated field "as you said", as the rules book's Card replies line showed it. It says
     * it about the prior actions when propose_form lists them as stated, or when the rules book does not say that prior
     * actions from the forms on file are never "as you said" (both were so on 3e2c30dd).
     */
    const fromFile = Boolean(result.facts?.prior_on_file?.used_on_card) && !result.facts?.stated?.prior_actions && /from the forms on file\)/.test(view.system);
    const prior = fromFile ? `**Prior actions:** ${result.card?.prior_actions ?? ""} (from the forms on file).` : `**Prior actions:** ${result.card?.prior_actions ?? ""}, as you said.`;
    return { text: `Here's the Corrective Action Form for **Thaddea**.\n\n**Type of Warning:** Verbal Warning, as you said.\n${prior}\n**Observation of Offense:** ${result.card?.observation ?? ""}\n**Policy:** ${result.card?.policy ?? ""}` };
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
  {
    id: "nov21-agent-loop-prior-actions-from-file-never-as-you-said",
    title: `"${CONFIDENTIAL}" with a Corrective Action on file: the card's prior actions come from the forms on file, so they are not "stated" and the reply never says "as you said" about them (the level the manager typed keeps it); the ticked offense box is the one the card and the saved Policy Violated name (Standards of Conduct — Confidential Information)`,
    report: `${REPORT}, item 18 (A15): Prior actions taken from forms on file end with "as you said" (the manager didn't say them), and offense_type ticked "standards_of_conduct" while the policy is Confidential Information`,
    status: "fixed",
    async run(t) {
      start(t);
      t.manualAlsoHas!([CONFIDENTIAL_CHUNK]);
      caOnFile(t, "ca-thaddea-1", "Thaddea Kroll", "2026-10-20");
      const model = confidentialCard();
      t.loopModel!(model);
      const thread = t.thread();
      const reply = await thread.say(CONFIDENTIAL);
      const card = model.views.flatMap((view) => view.results.filter((result) => result.tool === "propose_form")).at(-1)?.output as CardResult;
      expect(card?.facts?.prior_on_file?.used_on_card, `the forms on file did not fill the prior actions (the case proves nothing):\n${JSON.stringify(card)}`).toBe(true);
      expect(card?.facts?.stated?.prior_actions, "prior actions from the forms on file are listed as stated by the manager").toBeUndefined();
      expect(reply.content, `the reply says "as you said" about prior actions the manager never gave:\n${reply.content}`).not.toMatch(/\*\*Prior actions:\*\*[^\n]*as you said/i);
      expect(reply.content, "the prior actions on file are not read back").toMatch(/\*\*Prior actions:\*\*[^\n]*10\/20\/2026/);
      expect(reply.content, "the level the manager typed lost its \"as you said\"").toMatch(/Verbal Warning, as you said/);
      const id = await thread.create();
      // The offense box agrees with the cited policy: a heading with no box of its own is recorded under the box revision 7
      // gives a company policy (Standards of Conduct), and the card and the saved Policy Violated both name that box.
      expect(reply.content, `the card's policy line does not name the box the form ticks:\n${reply.content}`).toMatch(/\*\*Policy:\*\* Standards of Conduct — Confidential Information/);
      expect(t.checked(id).offense_type, "the ticked offense box is not the one the cited policy is recorded under").toEqual(["standards_of_conduct"]);
      expect(t.values(id).policy_violated ?? "", "Policy Violated does not name the ticked box with the cited policy").toMatch(/^Standards of Conduct — Confidential Information/);
    },
  },
];
