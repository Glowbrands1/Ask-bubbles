import { expect } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * A NAME ENDS AT ITS LINE (tracked, OPEN; found in the sibling app porting this app's
 * flip-3 gate fix, QA, 6 Nov 2026)
 * ============================================================================
 *
 * An exit form typed as lines, the name alone on the first: "<name>\nGave
 * notice - fulfilled notice\n…". The name reader runs across the newline and
 * reads "<name> Gave", so the card and the reply name "Thessaly Varrow Gave".
 * With a title line between them the name is read correctly. QA (6 Nov 2026):
 * tracked with this case. Holds with production's flags on main 6ce4ba95+
 * (checked 12 Nov 2026, QA's recovery item 4): later name-reading fixes cover
 * it. Kept as a guard. The name is invented and on no directory.
 */
export const NOV6_NAME_ACROSS_NEWLINE_CASES: ReplayCase[] = [
  {
    id: "nov6-name-across-newline-exit-lines",
    title: "an exit form typed as lines, \"Thessaly Varrow\\nGave notice - …\": the name is never read across the newline as \"Thessaly Varrow Gave\"",
    report: "Found 6 Nov 2026 in the sibling app, checked here: the exit card read \"Thessaly Varrow Gave\"",
    // Holds with production's flags (12 Nov 2026): a guard, not a fix of its own.
    status: "fixed",
    async run(t) {
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say("Can you create an exit form for me?");
      const reply = await thread.say(
        "Thessaly Varrow\nGave notice - fulfilled notice\nGave notice 9/25/26 - date notice fulfilled 10/9/26\nResigning to pursue other career options\neligible for rehire",
      );
      expect(reply.content, `the name is read across the newline:\n${reply.content}`).not.toMatch(/Thessaly Varrow Gave/);
      expect(thread.proposal?.employeeName ?? "", "the card's name runs across the newline").not.toMatch(/Gave/);
    },
  },
];
