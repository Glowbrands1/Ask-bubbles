import { expect, vi } from "vitest";

import { WEST_DODGE, type DirectoryRow, type ReplayCase } from "./cases";
import { LOOP_STAFF } from "./loop-roster";
import { evidenceFrom, lastResult, loopStandIn, type LoopDecision } from "./loop-stand-in";

/**
 * ============================================================================
 * ONE DASHED DATE WITH NO YEAR IS STATED ONCE IN THE SAVED OBSERVATION (QA's live re-run on production f9461c1, 22 Nov
 * 2026, C3)
 * ============================================================================
 *
 * QA (Pau's account, loop on): "create a CA form for <Last>, <First> at dodge. she was late on 10-16" saved the
 * Observation "<first> was late to work on October 16, 2026. <first> was late on 10-16.": the same fact twice, the
 * drafter's dated sentence and the card's short one. The keep-the-facts pass (`account-facts-kept.ts`) did not read
 * "10-16" (no year) as a date, so the card's sentence looked missing and was added. Invented person: Zelphine Harwick.
 */

const REPORT = "QA's live re-run on production f9461c1 (22 Nov 2026, C3): the saved Observation stated \"late on 10-16\" twice";
const ZELPHINE: DirectoryRow = { id: "e-zelphine-harwick", firstName: "Zelphine", lastName: "Harwick", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" };
const SAID = "create a CA form for Harwick, Zelphine at dodge. she was late on 10-16";
const ACCOUNT = "Zelphine was late on 10-16.";
const DRAFTED = "Observed:\nZelphine was late to work on October 16, 2026.\n\nExpectation:\nZelphine is expected to arrive on time for every scheduled shift.";

export const NOV22_AGENT_LOOP_SINGLE_DASHED_DATE_ONCE_CASES: ReplayCase[] = [
  {
    id: "nov22-c3-single-dashed-date-stated-once",
    title: `C3: "${SAID}", Create, and the drafter writes "October 16, 2026": the saved Observation states the lateness once, never again "late on 10-16"`,
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-22T18:40:00Z"));
      t.directory([...LOOP_STAFF, ZELPHINE]);
      t.as("location_manager", WEST_DODGE);
      t.loopModel!(loopStandIn((view): LoopDecision => lastResult(view, "propose_form")
        ? { text: "Here's the Corrective Action Form for **Zelphine**." }
        : { tool: "propose_form", input: { template_key: "dpoa", employee_name: "Zelphine Harwick", person_evidence: evidenceFrom(view, "Harwick, Zelphine"), what_happened: ACCOUNT, incident_date: "2026-10-16" } }));
      const thread = t.thread();
      await thread.say(SAID);
      expect((thread.proposal as { fromAgentLoop?: boolean } | null)?.fromAgentLoop, "no loop card was made (the case proves nothing)").toBe(true);
      t.draftWrites({ observation: DRAFTED });
      const id = await thread.create();
      const observed = (t.values(id).observation ?? "").split(/\n\s*Expectation:/)[0]!;
      expect(observed.match(/\blate\b/g) ?? [], `the lateness is stated more than once:\n${observed}`).toHaveLength(1);
      expect(observed, observed).not.toMatch(/10-16/);
    },
  },
];
