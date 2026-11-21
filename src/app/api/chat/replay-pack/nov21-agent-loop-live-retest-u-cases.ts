import { expect, vi } from "vitest";

import manual151 from "@/test/fixtures/jba-manual-production-151.json";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_FENNA, LOOP_STAFF } from "./loop-roster";
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

/** One Corrective Action card for Fenna Prewitt (late on `day`), created through the real Create route as a draft. */
async function createdCa(t: ReplayContext, day: string): Promise<{ thread: ReturnType<ReplayContext["thread"]>; id: string }> {
  t.loopModel!(loopStandIn((view): LoopDecision => {
    if (!lastResult(view, "propose_form")) return { tool: "propose_form", input: { template_key: "dpoa", employee_id: LOOP_FENNA.id, what_happened: `Fenna Prewitt was 20 minutes late on ${day}.`, incident_date: `2026-${day.replace("/", "-")}`, policy: headingWith(view, /^attendance/i), person_evidence: evidenceFrom(view, "fenna prewitt") } };
    return { text: "Here's the Corrective Action Form for **Fenna**." };
  }));
  const thread = t.thread();
  await thread.say(`ca for fenna prewitt, she was 20 minutes late on ${day}`);
  return { thread, id: await thread.create() };
}

/** Item 14's second message, word for word. */
const EDITS_NOT_A_PICK = "this is a verbal warning. previous coaching policy manual 10-15-26";
/** Item 16's message, word for word (the person swapped; QA's typo "recieved" kept). */
const INCLUDE_PRIOR = "in the previously recieved coaching include that fenna prewitt signed the jba policy manual on 10-15-26";

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
  {
    /*
     * CHANGED ON PURPOSE (QA's Bubbles live re-run, 22 Nov 2026, A11, HIGH): this case used to expect the loop to open the
     * most recent of the three forms by itself and save the level and prior coaching on it. Live, that opened a new draft
     * revising a finalized form the manager never chose and saved Prior actions they never gave. QA: "The loop must never
     * pick a form the manager didn't choose while a 'which one' question is open." Now the changes are not a pick: nothing
     * is opened or written, the question is asked again, and the changes go on the form the manager then picks.
     */
    id: "nov21-agent-loop-which-one-answered-with-edits-keeps-them",
    title: `three Corrective Action drafts for Fenna Prewitt listed with "Which one should I open?", then "${EDITS_NOT_A_PICK}": the changes are not a pick, so no form is opened or written and the question is asked again; then "the 11/14 one" opens that form and the level and the prior coaching are saved on it`,
    report: `${REPORT}, item 14 (A11), and QA's Bubbles re-run (22 Nov 2026, A11 HIGH): after the list, "${EDITS_NOT_A_PICK}" opened a revising draft of a form the manager never picked and saved Prior actions they never gave`,
    status: "fixed",
    async run(t) {
      start(t, "2026-11-14T16:00:00Z");
      const ids = [await createdCa(t, "11/12"), await createdCa(t, "11/13"), await createdCa(t, "11/14")].map((made) => made.id);
      start(t);
      const before = ids.map((id) => JSON.stringify(t.values(id)));
      const model = loopStandIn((view): LoopDecision => {
        const said = view.turns.filter((turn) => turn.role === "user").at(-1)?.text ?? "";
        const found = lastResult(view, "find_past_forms") as { forms?: { instance_id: string; choice: string }[]; which_form_question?: string } | null;
        const opened = lastResult(view, "open_form") as { opened?: boolean; reason_code?: string; error?: string } | null;
        const listed = () => ({ text: `${(found?.forms ?? []).map((form) => `- ${form.choice}`).join("\n")}\n\n${found?.which_form_question ?? ""}` });
        if (/^bring up/.test(said)) {
          if (!found) return { tool: "find_past_forms", input: { employee_name: "Fenna Prewitt", form: "corrective action", open: true, forms_on_file_evidence: evidenceFrom(view, "bring up a previously edited corrective action") } };
          return listed();
        }
        if (said.startsWith(EDITS_NOT_A_PICK)) {
          // The live model: it opens the newest form by itself, with no pick from the manager.
          if (!opened) return { tool: "open_form", input: { instance_id: ids[2]!, forms_on_file_evidence: evidenceFrom(view, "bring up a previously edited corrective action", 1) } };
          if (opened.opened) {
            if (!lastResult(view, "edit_form")) return { tool: "edit_form", input: { instance_id: ids[2]!, values: { warning_type: "verbal", prior_actions: "JBA Policy Manual — 11/05/2026" }, level_evidence: evidenceFrom(view, "this is a verbal warning") } };
            return { text: "Opened the most recent one." };
          }
          return { text: "I'll put the verbal warning and the 10/15/26 prior coaching on the form you pick. Which one should I open?" };
        }
        // "the 11/14 one": the manager's pick.
        if (!opened) return { tool: "open_form", input: { instance_id: ids[2]!, forms_on_file_evidence: evidenceFrom(view, "bring up a previously edited corrective action", 2), choice_evidence: evidenceFrom(view, "the 11/14 one") } };
        if (!lastResult(view, "edit_form")) return { tool: "edit_form", input: { instance_id: ids[2]!, values: { warning_type: "verbal", prior_actions: "Coaching — JBA Policy Manual — 10/15/2026" }, level_evidence: evidenceFrom(view, "this is a verbal warning", 1) } };
        return { text: "Opened the Corrective Action Form from 11/14/2026.\n\n**Type of Warning:** Verbal Warning, as you said.\n**Prior actions:** Coaching — JBA Policy Manual — 10/15/2026." };
      });
      t.loopModel!(model);
      const thread = t.thread();
      const listed = await thread.say("bring up a previously edited corrective action for fenna prewitt");
      expect(listed.content, "the three forms were not listed with the which-one question (the case proves nothing)").toContain("Which one should I open?");
      const reply = await thread.say(EDITS_NOT_A_PICK);
      const refused = model.views.flatMap((view) => view.results.filter((result) => result.tool === "open_form")).at(-1)?.output as { reason_code?: string } | undefined;
      expect(refused?.reason_code, "a form the manager never picked was opened").toBe("which_form_not_chosen");
      expect(reply.formOpened, "a form the manager never picked is on screen").toBeFalsy();
      expect(ids.map((id) => JSON.stringify(t.values(id))), "a form the manager never picked was written").toEqual(before);
      expect(reply.content, `the reply does not ask again:\n${reply.content}`).toMatch(/Which one should I open\?/);
      expect(reply.content, "the stock \"send the change again\" reply").not.toMatch(/send the change you still need again/i);
      const picked = await thread.say("the 11/14 one");
      expect(picked.formOpened?.instanceId, "the form the manager picked was not opened").toBe(ids[2]);
      expect(t.checked(ids[2]!).warning_type, "the warning level was dropped after the pick").toEqual(["verbal"]);
      expect(t.values(ids[2]!).prior_actions ?? "", "the prior coaching was dropped after the pick").toMatch(/10\/15\/2026/);
    },
  },
  {
    id: "nov21-agent-loop-include-in-prior-actions-adds-only-there",
    title: `a Corrective Action draft whose Prior actions list eight forms on file, then "${INCLUDE_PRIOR}": the manual signing is added to Prior actions after the eight entries (all kept), and the Observation is unchanged`,
    report: `${REPORT}, item 16 (A13): the fact landed in Prior actions but was ALSO appended to the Observation, and the 8 previously listed prior CA entries were replaced instead of kept ("include" = add)`,
    status: "fixed",
    async run(t) {
      start(t, "2026-11-20T16:00:00Z");
      const dates = ["2026-09-02", "2026-09-12", "2026-09-23", "2026-10-01", "2026-10-09", "2026-10-20", "2026-10-28", "2026-11-05"];
      dates.forEach((date, index) => caOnFile(t, `ca-fenna-prior-${index + 1}`, "Fenna Prewitt", date));
      const { thread, id } = await createdCa(t, "11/19");
      const before = t.values(id);
      expect((before.prior_actions ?? "").split(";").length, `the draft does not list the eight forms on file (the case proves nothing):\n${before.prior_actions}`).toBe(8);
      const model = loopStandIn((view): LoopDecision => {
        const read = lastResult(view, "read_form") as { values?: Record<string, { untrusted_text?: string }> } | null;
        if (!read) return { tool: "read_form", input: { instance_id: id } };
        const now = (key: string) => read.values?.[key]?.untrusted_text ?? "";
        const added = "JBA Policy Manual — signed 10/15/2026";
        if (!lastResult(view, "edit_form")) {
          // Without the rule, the live model put the fact in both fields and wrote Prior actions as the new entry alone.
          const values = /never replace the entries already there/.test(view.system)
            ? { prior_actions: `${now("prior_actions")}; ${added}` }
            : { prior_actions: added, observation: `${now("observation")}\nFenna Prewitt signed the JBA policy manual on 10/15/2026.` };
          return { tool: "edit_form", input: { instance_id: id, values } };
        }
        return { text: `Added to **Prior actions**: ${added}.` };
      });
      t.loopModel!(model);
      await thread.say(INCLUDE_PRIOR);
      const after = t.values(id);
      for (const entry of (before.prior_actions ?? "").split(";").map((part) => part.trim())) {
        expect(after.prior_actions ?? "", `an earlier prior action was dropped: ${entry}`).toContain(entry);
      }
      expect(after.prior_actions ?? "", "the manual signing is not in Prior actions").toMatch(/10\/15\/2026/);
      expect(after.observation, "the Observation changed").toBe(before.observation);
    },
  },
];
