import { expect, vi } from "vitest";

import { type DirectoryRow, type ReplayCase } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * THE EXIT TYPE THE MANAGER NAMES IS THE ONE SAVED (QA's live round-2 re-run on production f9461c1, 22 Nov 2026, U24)
 * ============================================================================
 *
 * A global district manager, one message (the tester's words; two spaces after "Petra Quill." as typed). "Immediate Vol
 * Resignation" saved resignation_type [no_call_no_show]: the story also says "Linnea was a no call no show for her
 * shift", and the exit form's own reader ticks that type from the story, which drops the model's exit_how (the one
 * decision of #1013's B6 rule) before quoteNamesOption can read "Immediate Vol Resignation" as its label. The T1 reply
 * also read no type back. Invented people (the tester's): Linnea Farrow (terminated in Woven), Petra Quill, Marisol Thorne.
 * With AGENT_LOOP_LIVE=1 the real model plays the turn.
 */

const REPORT = "QA's live round-2 re-run (22 Nov 2026, U24): \"Immediate Vol Resignation\" saved resignation_type [no_call_no_show]; no read-back of the type";
const LINNEA: DirectoryRow = { id: "e-linnea-farrow", firstName: "Linnea", lastName: "Farrow", preferredFirstName: null, employmentStatus: "terminated", locationIds: ["loc-264"], positionName: "Seasonal Team Member Part Time" };
const PETRA: DirectoryRow = { id: "e-petra-quill", firstName: "Petra", lastName: "Quill", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Assistant General Manager" };
const MARISOL: DirectoryRow = { id: "e-marisol-thorne", firstName: "Marisol", lastName: "Thorne", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-67", "loc-264"], positionName: "General Manager" };
const SAID = "create exit for Linnea Farrow, 123 Test St, Omaha, NE. 00000. Immediate Vol Resignation. Resignation Date 11-11-26. Employee resigned via phone call with Assistant Store Manager, Petra Quill.  Store items were returned and payroll deduct applies. On 11-11-26 Linnea was a no call no show for her shift and Store Manager, Marisol Thorne, called Linnea and left a voicemail. When Linnea returned the call she spoke with Petra and stated she was quitting effective immediately due to conflict with her other job.";
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
      t.directory([...LOOP_STAFF, LINNEA, PETRA, MARISOL]);
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
      expect(reply.content, reply.content).not.toMatch(/No Call No Show/i);
      const id = await thread.create();
      const checked = t.checked(id);
      expect(checked.resignation_type ?? [], JSON.stringify(checked)).toEqual(["immediate_voluntary_resignation"]);
    },
  },
];
