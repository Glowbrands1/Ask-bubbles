import { expect, vi } from "vitest";

import type { DirectoryRow, ReplayCase } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, headingWith, lastResult, loopStandIn, type LoopDecision, type LoopView } from "./loop-stand-in";

/**
 * ============================================================================
 * A TOOL CALL WRITTEN AS TEXT IS NEVER THE REPLY (QA's Bubbles live round 3, 22 Nov 2026; the live regression set on PR 2)
 * ============================================================================
 *
 * nov22-a1-corrected-spelling-by-id, live: T3 "Create the coaching form with the information given. Her name is Thaddea
 * Kroll and she is at Dodge. …" got the reply `_exec:find_staff {"person_evidence": "Thaddea Kroll, she is at Dodge,
 * makery associate"}` (another run: `find_staff` and its input in a code block). The model wrote the call instead of
 * making it: nothing was looked up, no card was made and the manager saw tool syntax. Read by the loop's own tool names
 * (`written-tool-call.ts`): the reply goes back once to make the call; if it comes back, the call's lines are left out.
 */

const REPORT = "QA's Bubbles live round 3 regression set (22 Nov 2026): the reply was `_exec:find_staff {…}`, a tool call written as text";
const BRIONY: DirectoryRow = { id: "e-briony-kask", firstName: "Briony", lastName: "Kask", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const T1 = "Create the coaching form with the information given. Her name is Briony Kask and she is at Dodge. She left the makery counters unwiped on 11/14.";
const WRITTEN = '_exec:find_staff\n{"person_evidence": "Her name is Briony Kask and she is at Dodge."}';
const handedBack = (view: LoopView) => view.turns.some((turn) => /^\[app check\]/.test(turn.text) && /tool call as text/.test(turn.text));

function writtenCase(fixes: boolean): ReplayCase {
  return {
    id: fixes ? "nov22-r3-written-tool-call-handed-back" : "nov22-r3-written-tool-call-repeated-left-out",
    title: fixes
      ? `Round 3: "${T1}" answered with a tool call written as text (\`_exec:find_staff {…}\`) goes back once; the call is made and the card shown`
      : `Round 3: a tool call written as text twice is left out of the reply; the manager never sees \`_exec:find_staff\` or its JSON`,
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
      t.directory([...LOOP_STAFF, BRIONY]);
      t.as("location_manager", { level: "location", primaryAreaId: "loc-264", alsoCoversAreaIds: [] });
      t.loopModel!(loopStandIn((view): LoopDecision => {
        if (lastResult(view, "propose_form")) return { text: "Here's the Coaching Form for **Briony**." };
        if (!(fixes && handedBack(view))) return { text: WRITTEN };
        return { tool: "propose_form", input: { template_key: "coaching", employee_id: BRIONY.id, person_evidence: evidenceFrom(view, "Briony Kask"), what_happened: "Briony left the makery counters unwiped on 11/14.", policy: headingWith(view, /care and cleaning/i) } };
      }));
      const reply = await t.thread().say(T1);
      expect(reply.content, `the manager saw the written tool call:\n${reply.content}`).not.toMatch(/_exec|find_staff|person_evidence|\{/);
      if (fixes) expect(reply.formProposal?.templateKey, reply.content).toBe("coaching");
      else expect(reply.content.trim(), "the reply is empty").not.toBe("");
    },
  };
}

export const NOV22_ROUND3_WRITTEN_TOOL_CALL_CASES: ReplayCase[] = [writtenCase(true), writtenCase(false)];
