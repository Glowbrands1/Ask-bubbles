import { expect } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * "JUST MAKE IT" IS SEARCHED WITH THE POLICY NAMED EARLIER (QA item 10; #180 rebuilt on main, 12 Nov 2026)
 * ============================================================================
 *
 * Production, 25 Oct 2026 (conv_mvofuq3l2jae1be). T2 "cite animals in the
 * workplace policy" was answered from Animals in the Workplace p.30; T4 "just make it" was searched on its own words,
 * the excerpts were unrelated pages, and the reply denied the policy. POLICY_CARRY_RETRIEVAL_ENABLED: the search
 * (`ai/server-ask.ts`, Coding-2's file) uses `carriedPolicyTopic`. The manager's turns; people invented.
 */
const TURNS = [
  "do verbl for Marnie Holloway at West Dodge. no payrol deduct. prev coachng jba manual 11-1-25. on 10-22-26 Marnie wasnt scheduled and came in to show her puppy 45 min",
  "cite animals in the workplace policy",
  "I already told you the store is West Dodge",
];
const T4 = "just make it";

export const NOV12_POLICY_CARRY_RETRIEVAL_CASES: ReplayCase[] = [
  {
    id: "nov12-180-just-make-it-searches-the-named-policy",
    title: "QA item 10: after \"cite animals in the workplace policy\", T4 \"just make it\" is searched with that policy, never on its own words",
    report: "QA item 10 (production, 25 Oct 2026; conv_mvofuq3l2jae1be): T4 \"just make it\" denied the Animals in the Workplace policy cited at T2",
    status: { open: "T4 is searched on its own words; no search names the policy" },
    fixFlags: ["POLICY_CARRY_RETRIEVAL_ENABLED"],
    // Until Coding-2 applies the search hunk in `ai/server-ask.ts` (the flag's reader is on main from this branch).
    async run(t) {
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      for (const turn of TURNS) await thread.say(turn);
      const before = t.searches?.().length ?? 0;
      await thread.say(T4);
      const searched = (t.searches?.() ?? []).slice(before);
      expect(searched.length, "T4 made no knowledge search").toBeGreaterThan(0);
      expect(searched.every((query) => /animals in the workplace/i.test(query)), `T4's searches:\n${searched.join("\n")}`).toBe(true);
    },
  },
];
