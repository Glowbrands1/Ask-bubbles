import { expect, vi } from "vitest";

import { type DirectoryRow, type ReplayCase } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * THE EXIT TYPE THE MANAGER NAMES IS THE ONE SAVED (QA's live round-2 re-run on production f9461c1, 22 Nov 2026, U24)
 * ============================================================================
 *
 * A global district manager, one message (the tester's words; two spaces after "Marisande Tremblett." as typed). "Immediate Vol
 * Resignation" saved resignation_type [no_call_no_show]: the story also says "Linnea was a no call no show for her
 * shift", and the exit form's own reader ticks that type from the story, which drops the model's exit_how (the one
 * decision of #1013's B6 rule) before quoteNamesOption can read "Immediate Vol Resignation" as its label. The T1 reply
 * also read no type back. Invented people (the tester's): Linnea Farrow (terminated in Woven), Marisande Tremblett, Marisol Thorne.
 * With AGENT_LOOP_LIVE=1 the real model plays the turn.
 */

const REPORT = "QA's live round-2 re-run (22 Nov 2026, U24): \"Immediate Vol Resignation\" saved resignation_type [no_call_no_show]; no read-back of the type";
const LINNEA: DirectoryRow = { id: "e-linnea-farrow", firstName: "Linnea", lastName: "Farrow", preferredFirstName: null, employmentStatus: "terminated", locationIds: ["loc-264"], positionName: "Seasonal Team Member Part Time" };
const MARISANDE: DirectoryRow = { id: "e-marisande-tremblett", firstName: "Marisande", lastName: "Tremblett", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Assistant General Manager" };
const MARISOL: DirectoryRow = { id: "e-marisol-thorne", firstName: "Marisol", lastName: "Thorne", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-67", "loc-264"], positionName: "General Manager" };
const SAID = "create exit for Linnea Farrow, 123 Test St, Omaha, NE. 00000. Immediate Vol Resignation. Resignation Date 11-11-26. Employee resigned via phone call with Assistant Store Manager, Marisande Tremblett.  Store items were returned and payroll deduct applies. On 11-11-26 Linnea was a no call no show for her shift and Store Manager, Marisol Thorne, called Linnea and left a voicemail. When Linnea returned the call she spoke with Marisande and stated she was quitting effective immediately due to conflict with her other job.";
const ADMIN = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };

type Out = { card?: Record<string, unknown>; facts?: { exit_ticks?: string[] } } | null;

export const NOV22_AGENT_LOOP_U24_NAMED_EXIT_TYPE_CASES: ReplayCase[] = [
  {
    id: "nov22-u24-named-exit-type-wins-over-story",
    title: "U24 verbatim: \"… Immediate Vol Resignation … Linnea was a no call no show for her shift …\" (global admin): the reply reads the type back, and the card and saved form tick Immediate Voluntary Resignation, never No Call No Show",
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
      t.directory([...LOOP_STAFF, LINNEA, MARISANDE, MARISOL]);
      t.as("admin", ADMIN);
      t.loopModel!(loopStandIn((view): LoopDecision => {
        const result = lastResult(view, "propose_form") as Out;
        if (!result) {
          return {
            tool: "propose_form",
            input: {
              template_key: "resignation-exit", employee_name: "Linnea Farrow", person_evidence: evidenceFrom(view, "Linnea Farrow"), exit_type: "resignation",
              exit_evidence: { ...evidenceFrom(view, "create exit for Linnea Farrow"), kind: "asks_for_exit_form" },
              exit_how: "immediate_voluntary_resignation", exit_how_evidence: evidenceFrom(view, "Immediate Vol Resignation"),
              what_happened: "Linnea stated she was quitting effective immediately due to conflict with her other job.",
            },
          };
        }
        /* The rules book: exit_ticks is said "Filed as: <exit_ticks>." */
        const ticks = result.facts?.exit_ticks ?? [];
        return { text: `Here's the Employee Exit Form for **Linnea Farrow**.${ticks.length > 0 ? ` Filed as: ${ticks.join(", ")}.` : ""}` };
      }));
      const thread = t.thread();
      const reply = await thread.say(SAID);
      expect(reply.formProposal?.templateKey, `no exit card (the case proves nothing):\n${reply.content}`).toBe("resignation-exit");
      expect(reply.content, `the reply reads no type back:\n${reply.content}`).toMatch(/Immediate Voluntary Resignation/i);
      /* The type read back is the stated one; the story's no call no show may still be told in Additional Details. */
      expect(reply.content, reply.content).not.toMatch(/Filed as:?[^\n]*No Call No Show/i);
      const id = await thread.create();
      const checked = t.checked(id);
      expect(checked.resignation_type ?? [], JSON.stringify(checked)).toEqual(["immediate_voluntary_resignation"]);
    },
  },
  {
    id: "nov22-u24-type-read-back-when-reply-skips-it",
    title: "U24 (QA's flaky check on main f712228): the same message; the model reads back the card's other lines but no \"Filed as\" line: the reply still says Immediate Voluntary Resignation, once",
    report: `${REPORT}; QA's flaky check (22 Nov 2026): one live reply of five read back every reads_back line but never the type`,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
      t.directory([...LOOP_STAFF, LINNEA, MARISANDE, MARISOL]);
      t.as("admin", ADMIN);
      t.loopModel!(loopStandIn((view): LoopDecision => {
        const result = lastResult(view, "propose_form") as (Out & { card?: { reads_back?: string[] } }) | null;
        if (!result) {
          return {
            tool: "propose_form",
            input: {
              template_key: "resignation-exit", employee_name: "Linnea Farrow", person_evidence: evidenceFrom(view, "Linnea Farrow"), exit_type: "resignation",
              exit_evidence: { ...evidenceFrom(view, "create exit for Linnea Farrow"), kind: "asks_for_exit_form" },
              exit_how: "immediate_voluntary_resignation", exit_how_evidence: evidenceFrom(view, "Immediate Vol Resignation"),
              what_happened: "Linnea stated she was quitting effective immediately due to conflict with her other job.",
            },
          };
        }
        /* As the live run: every reads_back line but the type, and no exit_ticks line. */
        const lines = (result.card?.reads_back ?? []).filter((line) => !/^Filed as/i.test(line));
        return { text: ["Here's the Resignation/Exit Form for **Linnea**.", ...lines.map((line) => `- ${line}`), "The card above is still open; press Create when it looks right, or tell me what to change."].join("\n\n") };
      }));
      const thread = t.thread();
      const reply = await thread.say(SAID);
      expect(reply.formProposal?.templateKey, `no exit card (the case proves nothing):\n${reply.content}`).toBe("resignation-exit");
      expect(reply.content.match(/Immediate Voluntary Resignation/gi) ?? [], `the type is not read back once:\n${reply.content}`).toHaveLength(1);
      expect(reply.content, reply.content).not.toMatch(/Filed as:?[^\n]*No Call No Show/i);
    },
  },
  {
    id: "nov22-u24-type-named-once-no-second-line",
    title: "U24 control: the same message; the model says the exit_ticks line and every reads_back line: the reply names the type once, and no second \"Filed as\" line is added",
    report: `${REPORT}; QA's flaky check (22 Nov 2026): one live reply of five read back every reads_back line but never the type`,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
      t.directory([...LOOP_STAFF, LINNEA, MARISANDE, MARISOL]);
      t.as("admin", ADMIN);
      t.loopModel!(loopStandIn((view): LoopDecision => {
        const result = lastResult(view, "propose_form") as (Out & { card?: { reads_back?: string[] } }) | null;
        if (!result) {
          return {
            tool: "propose_form",
            input: {
              template_key: "resignation-exit", employee_name: "Linnea Farrow", person_evidence: evidenceFrom(view, "Linnea Farrow"), exit_type: "resignation",
              exit_evidence: { ...evidenceFrom(view, "create exit for Linnea Farrow"), kind: "asks_for_exit_form" },
              exit_how: "immediate_voluntary_resignation", exit_how_evidence: evidenceFrom(view, "Immediate Vol Resignation"),
              what_happened: "Linnea stated she was quitting effective immediately due to conflict with her other job.",
            },
          };
        }
        /* As runs 2 and 3 live: the exit_ticks line, then every reads_back line. */
        const ticks = result.facts?.exit_ticks ?? [];
        const lines = [...(ticks.length > 0 ? [`Filed as: ${ticks.join(", ")}.`] : []), ...(result.card?.reads_back ?? [])];
        return { text: ["Here's the Resignation/Exit Form for **Linnea**.", ...lines.map((line) => `- ${line}`), "The card above is still open; press Create when it looks right, or tell me what to change."].join("\n\n") };
      }));
      const thread = t.thread();
      const reply = await thread.say(SAID);
      expect(reply.formProposal?.templateKey, `no exit card (the case proves nothing):\n${reply.content}`).toBe("resignation-exit");
      expect(reply.content.match(/Immediate Voluntary Resignation/gi) ?? [], `the type is not read back once:\n${reply.content}`).toHaveLength(1);
      expect(reply.content.match(/Filed as/gi) ?? [], `a second "Filed as" line:\n${reply.content}`).toHaveLength(1);
      expect(reply.content, reply.content).not.toMatch(/Filed as:?[^\n]*No Call No Show/i);
    },
  },
  {
    id: "nov22-u24-rehire-stays-in-reads-back-with-type",
    title: "U24 (QA's live check of #1061): \"exit form for Linnea Farrow, Immediate Vol Resignation, she is eligible for rehire\": reads_back lists the rehire answer Create saves, and never a Filed-as line (the model's input is unchanged)",
    report: `${REPORT}; QA's live check of #1061 (22 Nov 2026): nov22-b6-rehire-stated-is-read-back-as-saved lost its reads_back`,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
      t.directory([...LOOP_STAFF, LINNEA, MARISANDE, MARISOL]);
      t.as("admin", ADMIN);
      const said = "exit form for Linnea Farrow, Immediate Vol Resignation, she is eligible for rehire";
      const model = loopStandIn((view): LoopDecision => {
        const result = lastResult(view, "propose_form") as (Out & { card?: { reads_back?: string[] } }) | null;
        if (!result) {
          return {
            tool: "propose_form",
            input: {
              template_key: "resignation-exit", employee_name: "Linnea Farrow", person_evidence: evidenceFrom(view, "Linnea Farrow"), exit_type: "resignation",
              exit_evidence: { ...evidenceFrom(view, "exit form for Linnea Farrow"), kind: "asks_for_exit_form" },
              exit_how: "immediate_voluntary_resignation", exit_how_evidence: evidenceFrom(view, "Immediate Vol Resignation"),
            },
          };
        }
        return { text: ["Here's the Resignation/Exit Form for **Linnea**.", ...(result.card?.reads_back ?? [])].join("\n\n") };
      });
      t.loopModel!(model);
      const reply = await t.thread().say(said);
      const readBack = (model.views.map((view) => lastResult(view, "propose_form") as { card?: { reads_back?: string[] } } | null).filter(Boolean).at(-1)?.card?.reads_back) ?? [];
      expect(readBack, `reads_back does not list the rehire answer:\n${readBack.join("\n")}`).toContain("**Is this employee eligible for rehire?** Yes");
      expect(readBack.some((line) => /^Filed as/i.test(line)), readBack.join("\n")).toBe(false);
      expect(reply.content.match(/Immediate Voluntary Resignation/gi) ?? [], reply.content).toHaveLength(1);
    },
  },
];
