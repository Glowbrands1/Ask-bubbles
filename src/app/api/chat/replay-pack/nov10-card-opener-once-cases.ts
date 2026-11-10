import { expect } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * A FORM CHAT SAYS ITS LONG OPENER ONCE (QA's October triage of #200, 10 Nov 2026)
 * ============================================================================
 *
 * On main a529c29e with production's flags, every turn of a Corrective Action chain repeated "I'll draft a
 * **Corrective Action Form** for **<employee>** from what you've described, and check the applicable company policy …"
 * and the "nothing is saved to anyone's file until you do" line. Fixed with HUMAN_REPLIES_ENABLED
 * (`ai/human-replies.ts`). The person is invented.
 */
const OPENER = /from what you've described, and check the applicable company policy/;

export const NOV10_CARD_OPENER_ONCE_CASES: ReplayCase[] = [
  {
    id: "nov10-card-opener-once-ca-chain",
    title: "a CA chain: the second turn does not repeat the opener, and the card is the same employee's",
    report: "QA's October triage (10 Nov 2026) of #200, on main a529c29e with production's flags",
    status: { open: "every turn repeats the full opener; fixed with HUMAN_REPLIES_ENABLED" },
    fixFlags: ["HUMAN_REPLIES_ENABLED"],
    async run(t) {
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const first = await thread.say("create a ca for Remy Calder, she was late today");
      expect(first.content, first.content).toMatch(OPENER);
      const second = await thread.say("verbal");
      expect(thread.proposal, second.content).toMatchObject({ templateKey: "dpoa", employeeName: "Remy Calder" });
      expect(second.content, `the opener again:\n${second.content}`).not.toMatch(OPENER);
      expect(second.content, second.content).not.toMatch(/nothing is saved to anyone's file until you do/);
    },
  },
];
