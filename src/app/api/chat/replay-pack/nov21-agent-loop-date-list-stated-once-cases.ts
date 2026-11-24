import { expect, vi } from "vitest";

import { WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * EACH LATENESS IS STATED ONCE IN THE SAVED OBSERVED (port of the sibling app's QA2 live R3, 21 Nov 2026)
 * ============================================================================
 *
 * The sibling app's saved Observed stated the lateness three times for two dates: "<First> was late to work on November
 * 17, 2026. <First> was late to work on November 18, 2026. <First> was late on the last two shifts, 11/17 and 11/18." The
 * drafter wrote one sentence per date; the keep-the-facts pass (`account-facts-kept.ts`) read the card's date-list
 * sentence as missing ("last", "shifts" are in neither) and added it. Same pass in this app. Invented person: Odell
 * Brannagh (on no fixture).
 */

const REPORT = "Sibling app's QA2 live R3 (21 Nov 2026): the saved Observed stated the lateness three times for two dates";
const ODELL: DirectoryRow = { id: "e-odell-brannagh", firstName: "Odell", lastName: "Brannagh", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const SAID = "ca for Odell Brannagh, he was late on the last two shifts, 11/17 and 11/18";
const ACCOUNT = "Odell was late on the last two shifts, 11/17 and 11/18.";
const DRAFTED = "Observed:\nOdell was late to work on November 17, 2026. Odell was late to work on November 18, 2026.\n\nExpectation:\nOdell is expected to arrive on time for every scheduled shift.";

export const NOV21_AGENT_LOOP_DATE_LIST_STATED_ONCE_CASES: ReplayCase[] = [
  {
    id: "nov21-agent-loop-date-list-lateness-stated-once",
    title: `"${SAID}", Create, and the drafter writes one sentence per date: the saved Observed states each lateness once, never again "late on the last two shifts, 11/17 and 11/18"`,
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-21T18:40:00Z"));
      t.directory([...LOOP_STAFF, ODELL]);
      t.as("location_manager", WEST_DODGE);
      t.loopModel!(loopStandIn((view): LoopDecision => lastResult(view, "propose_form")
        ? { text: "Here's the Corrective Action Form for **Odell**." }
        : { tool: "propose_form", input: { template_key: "dpoa", employee_name: "odell brannagh", person_evidence: evidenceFrom(view, "Odell Brannagh"), what_happened: ACCOUNT, incident_date: "2026-11-18" } }));
      const thread = t.thread();
      await thread.say(SAID);
      expect((thread.proposal as { fromAgentLoop?: boolean } | null)?.fromAgentLoop, "no loop card was made (the case proves nothing)").toBe(true);
      t.draftWrites({ observation: DRAFTED });
      const id = await thread.create();
      const observed = (t.values(id).observation ?? "").split(/\n\s*Expectation:/)[0]!;
      expect(observed.match(/\blate\b/g) ?? [], `the lateness is stated more than once per date:\n${observed}`).toHaveLength(2);
      expect(observed, observed).not.toMatch(/last two shifts/);
      for (const date of ["November 17, 2026", "November 18, 2026"]) expect(observed.split(date).length - 1, `${date} is not stated exactly once:\n${observed}`).toBe(1);
    },
  },
];
