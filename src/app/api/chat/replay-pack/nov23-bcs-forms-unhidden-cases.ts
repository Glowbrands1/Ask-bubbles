import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * THE SIX FORMS UNHIDDEN WITH BUFF CITY SOAP'S NAMES REACH THE AI BY THOSE NAMES (Pau, 23 Nov 2026)
 * ============================================================================
 *
 * Pau approved unhiding six of the nine hidden templates under Buff City Soap's names (keys unchanged): the Team
 * Member and General Manager Performance EPPs, the Assistant General Manager Development EPP, the Team Member Interview Form and the two
 * management interviews. CLAUDE.md section 5: the AI reads the forms only through the loop's list ("Forms this
 * manager may create"), so each case asks in a manager's words and asserts the form is in that list under its new
 * name; where the manager names a person, the card opens for that form. The three in-training plans stay hidden, and
 * a case pins that too. Invented names only (STAFF's people).
 */

const REPORT = "Pau (23 Nov 2026): unhide the EPPs and interviews under Buff City Soap's names";

const listed = (view: LoopView) => (view.system.split("Forms this manager may create")[1] ?? "").split("\n\n")[0] ?? "";
const keyNamed = (view: LoopView, name: string) =>
  listed(view).split("\n").map((line) => /^- ([a-z0-9-]+): (.+)$/.exec(line.trim())).find((match) => match?.[2] === name)?.[1] ?? null;

/** The live model: proposes the form the list names as the manager asked (for the person, when one is named). */
const model = (name: string, person: string | null) =>
  loopStandIn((view): LoopDecision => {
    const key = keyNamed(view, name);
    if (!key) return { text: `I can't find a ${name} among the forms you can create.` };
    if (!person) return { text: `Who is this ${name} for?` };
    if (lastResult(view, "propose_form")) return { text: `Here's the ${name} for **${person.split(" ")[0]}**.` };
    return { tool: "propose_form", input: { template_key: key, employee_id: STAFF.find((row) => `${row.firstName} ${row.lastName}` === person)!.id, person_evidence: evidenceFrom(view, person) } };
  });

const FORMS: readonly [id: string, said: string, key: string, name: string, person: string | null][] = [
  ["team-member-epp", "create a team member EPP for Remy Calder", "fttc-epp", "Team Member Performance EPP", "Remy Calder"],
  ["agm-epp", "I need an AGM development EPP for Juno Paxton", "asd-sdit-epp", "Assistant General Manager Development EPP", "Juno Paxton"],
  ["gm-epp", "start a General Manager Performance EPP for Marnie Holloway", "tsd-epp", "General Manager Performance EPP", "Marnie Holloway"],
  ["team-member-interview", "I need a team member interview form", "tanning-consultant-interview", "Team Member Interview Form", null],
  ["management-round-1", "I need the first round management interview form", "management-interview-round-1", "First Round Management Interview Form", null],
  ["management-round-2", "can I get the second round management interview form", "management-interview-round-2", "Second Round Management Interview Form", null],
];

export const NOV23_BCS_FORMS_UNHIDDEN_CASES: ReplayCase[] = [
  ...FORMS.map(([id, said, key, name, person]): ReplayCase => ({
    id: `nov23-bcs-forms-unhidden-${id}`,
    title: `"${said}": the AI finds the ${name} by its new name${person ? " and the card opens for it" : ""}`,
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-23T16:00:00Z"));
      t.directory(STAFF);
      // A district manager holds create_epp and create_hiring_form.
      t.as("district_manager", WEST_DODGE);
      const standIn = model(name, person);
      t.loopModel!(standIn);
      const thread = t.thread();
      const reply = await thread.say(said);
      const system = standIn.views[0]?.system ?? "";
      expect(listed(standIn.views[0]!), `the loop's form list does not name the ${name}:\n${listed(standIn.views[0]!)}`).toContain(`- ${key}: ${name}`);
      expect(system, "a sibling company's title reached the model").not.toMatch(/\b(?:TSD|ASD|FTTC|Tanning Consultant)\b/);
      if (person) {
        expect(thread.proposal, `no card opened:\n${reply.content}`).not.toBeNull();
        expect((thread.proposal as { templateKey?: string }).templateKey).toBe(key);
        expect((thread.proposal as { templateName?: string }).templateName).toBe(name);
      }
    },
  })),
  {
    id: "nov23-bcs-forms-unhidden-control-in-training-plans-stay-hidden",
    title: "Control: the three in-training plans (SDIT, DMIT TSD / DMIT review) stay hidden; the loop's list names none",
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-23T16:00:00Z"));
      t.directory(STAFF);
      t.as("district_manager", WEST_DODGE);
      const standIn = model("SDIT EPP", "Remy Calder");
      t.loopModel!(standIn);
      await t.thread().say("Create an SDIT EPP for Remy Calder");
      const list = listed(standIn.views[0]!);
      expect(list, "the loop listed no forms at all (the case proves nothing)").toContain("- coaching:");
      for (const key of ["sdit-epp", "dmit-epp-tsd", "dmit-epp-dmit"]) expect(list, `${key} reached the loop's list`).not.toContain(`- ${key}:`);
    },
  },
];
