import { expect, vi } from "vitest";

import { WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * A FORMER EMPLOYEE IS MATCHED AS AN ACTIVE ONE IS; SEVERAL ARE ASKED ABOUT (E3, owner's review, 28 Nov 2026)
 * ============================================================================
 *
 * The owner's review: a former (terminated) employee was found only when the manager typed the exact full name; active
 * employees get near-miss, first-name and accent-tolerant matching. A former employee now gets the same matching, and
 * when more than one person fits the manager is asked which, never one picked silently. The manager's words and the
 * people are invented.
 */
const REPORT = "Owner's review (28 Nov 2026): a former (terminated) employee is found only when the manager types the exact full name; active employees get near-miss, first-name and accent-tolerant matching";
const OMAHA = "loc-264";
const gone = (id: string, firstName: string, lastName: string): DirectoryRow => ({ id, firstName, lastName, preferredFirstName: null, employmentStatus: "terminated", locationIds: [OMAHA], positionName: "Team Member Part Time" });
const YSOLDE = gone("e-ysolde-kovac", "Ysolde", "Kovač");
const YSOLDE_TWO = gone("e-ysolde-brannigan", "Ysolde", "Brannigan");

const results = (views: readonly LoopView[], tool: string) => views.flatMap((view) => view.results.filter((result) => result.tool === tool)).map((result) => JSON.stringify(result.output));

function start(t: ReplayContext, former: DirectoryRow[]) {
  vi.setSystemTime(new Date("2026-11-28T16:00:00Z"));
  t.directory([...LOOP_STAFF, ...former]);
  t.as("location_manager", WEST_DODGE);
}

/** The model looks the typed name up, proposes the card when find_staff says so, else asks what find_staff gives. */
const lookUp = (name: string) =>
  loopStandIn((view: LoopView): LoopDecision => {
    const staff = lastResult(view, "find_staff") as { ask_exactly?: string; inactive_in_woven?: string } | null;
    if (!staff) return { tool: "find_staff", input: { name, person_evidence: evidenceFrom(view, name.toLowerCase()) } };
    if (staff.ask_exactly) return { text: staff.ask_exactly };
    if (!lastResult(view, "propose_form")) return { tool: "propose_form", input: { template_key: "dpoa", employee_name: name, what_happened: `${name} was late on 11/27.`, incident_date: "2026-11-27" } };
    return { text: `**${name}** shows as no longer active in Woven; I've used the name as you typed it.` };
  });

export const NOV28_FORMER_EMPLOYEE_MATCH_CASES: ReplayCase[] = [
  {
    id: "nov28-former-employee-accent-typed-another-way",
    title: "\"ca for ysolde kovac, late on 11/27\" (the accent left out): found as the former employee Ysolde Kovač, said to be no longer active",
    report: REPORT,
    status: "fixed",
    async run(t) {
      if (!t.loopOn?.() || process.env.AGENT_LOOP_LIVE === "1") return;
      start(t, [YSOLDE]);
      const model = lookUp("ysolde kovac");
      t.loopModel!(model);
      await t.thread().say("ca for ysolde kovac, late on 11/27");
      expect(results(model.views, "find_staff")[0]).toMatch(/"inactive_in_woven":"Ysolde Kovač"/);
    },
  },
  {
    id: "nov28-former-employee-near-miss-asked",
    title: "\"ca for Ysolde Kovak, late on 11/27\" (one letter off): asked \"Did you mean Ysolde Kovač?\", never \"not on the staff list\"",
    report: REPORT,
    status: "fixed",
    async run(t) {
      if (!t.loopOn?.() || process.env.AGENT_LOOP_LIVE === "1") return;
      start(t, [YSOLDE]);
      const model = lookUp("Ysolde Kovak");
      t.loopModel!(model);
      const reply = await t.thread().say("ca for Ysolde Kovak, late on 11/27");
      expect(results(model.views, "find_staff")[0]).toMatch(/"reason_code":"former_employee_to_confirm"/);
      expect(reply.content).toMatch(/Did you mean \*\*Ysolde Kovač\*\*\?/);
      expect(reply.content).not.toMatch(/staff list/);
    },
  },
  {
    id: "nov28-former-employees-same-first-name-asks-which",
    title: "\"ca for Ysolde, late on 11/27\" with two former employees named Ysolde: asks which, names both, makes no card",
    report: REPORT,
    status: "fixed",
    async run(t) {
      if (!t.loopOn?.() || process.env.AGENT_LOOP_LIVE === "1") return;
      start(t, [YSOLDE, YSOLDE_TWO]);
      const model = lookUp("Ysolde");
      t.loopModel!(model);
      const thread = t.thread();
      const reply = await thread.say("ca for Ysolde, late on 11/27");
      expect(reply.content).toMatch(/Which former employee is this for/);
      expect(reply.content).toMatch(/Ysolde Kovač/);
      expect(reply.content).toMatch(/Ysolde Brannigan/);
      expect(thread.proposal?.employeeName ?? null, "a card was made for one of them").toBeNull();
    },
  },
];
