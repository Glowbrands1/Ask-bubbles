import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * NOBODY "WAS TOLD" WHAT THE MANAGER NEVER SAID (f082, ported from the sibling app)
 * ============================================================================
 *
 * QA's live test (20 Nov 2026): the manager stated a rule ("we do not do extra cleaning after hours") and the saved
 * Observation said the employee "was told" it, a telling nobody described. On the real Create path, the drafting model a
 * stand-in that writes what the live one wrote. Remy Calder is this pack's invented person.
 */
const SAID = "ca for Remy Calder, we do not do extra cleaning after hours, she left early 11/18";
const DRAFT =
  "Observed:\nRemy left the shift early on 11/18. Remy was told that extra cleaning is not performed after hours.\n\nExpectation:\nRemy is expected to stay for the full scheduled shift.";

export const NOV20_NO_INVENTED_TELLING_CASES: ReplayCase[] = [
  {
    id: "nov20-f082-no-invented-telling",
    title: `f082: "${SAID}": the saved Observation keeps what happened and never says Remy "was told" anything`,
    report: "QA's live test (20 Nov 2026, the sibling app): an invented telling in a saved Observation",
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-20T18:00:00Z"));
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say(SAID);
      t.draftWrites({ observation: DRAFT });
      const id = await thread.create();
      const observation = t.values(id).observation ?? "";
      expect(observation, `no Observation was saved (the case proves nothing):\n${observation}`).toMatch(/left (?:her |the )?shift early|left early/);
      expect(observation, `the Observation invents a telling:\n${observation}`).not.toMatch(/\bwas told\b/i);
    },
  },
];
