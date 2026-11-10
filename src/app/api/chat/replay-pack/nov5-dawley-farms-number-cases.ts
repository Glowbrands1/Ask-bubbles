import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * District Manager email to Pau, 3 Nov 2026 (relayed by QA, 5 Nov): "the Dawley
 * store has the wrong store number". The company numbers Dawley Farms 0309;
 * 338 is only its code (Google's profile, loc-338). The chat names it with the
 * company's number. The pack has no Woven store mapping, so the case asks by
 * the DM's number ("Which store is Dawley Farms?" through Woven's name is in
 * src/lib/ai/entity-facts.test.ts).
 */
const REPORT = "District Manager, 3 Nov 2026: the Dawley store has the wrong store number";

export const NOV5_DAWLEY_FARMS_NUMBER_CASES: ReplayCase[] = [
  {
    id: "nov5-dawley-farms-number",
    title: "\"What is store 309?\" is the E 18th St store, named store 309, never 338",
    report: REPORT,
    status: "fixed",
    async run(t) {
      vi.setSystemTime(new Date("2026-11-05T15:00:00Z"));
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const reply = await t.thread().say("What is store 309?");
      expect(reply.content, reply.content).toContain("Sioux Falls, SD (E 18th St) (Store 309)");
      expect(reply.content, reply.content).not.toContain("Store 338");
    },
  },
];
