import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";
import { CA_CHAIN, EXPECTATION, LIVE_ROSTER } from "./nov4-live-regressions-scenarios";

/**
 * ============================================================================
 * THE POLICY'S EXPECTATION IS NOT AN INVENTED DETAIL (QA's audit, 10 Nov 2026; EXPECTATION_POLICY_LINE_KEPT_ENABLED)
 * ============================================================================
 *
 * `form-edit-noop-guard-e2e.test.ts` (two it.fails rows): with ACCOUNT_ONLY_POLICY_QUERY on (production),
 * `withoutInventedDetail` dropped "An employee scheduled to open is expected to arrive on time and have the store ready to
 * open." from the saved Observation, because "scheduled to" is on its list of details the manager never wrote. The
 * sentence states what the policy expects of every employee, which the drafting rules ask for. The wording is the live
 * chain's (`CA_CHAIN`, invented person).
 */
const FIX = ["EXPECTATION_POLICY_LINE_KEPT_ENABLED"];
const REPORT = "QA's audit (10 Nov 2026): form-edit-noop-guard it.fails, the Expectation dropped by withoutInventedDetail";
const EXPECTED = EXPECTATION.replace(/^\nExpectation:\n/, "");

async function created(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-10-21T15:00:00Z"));
  t.directory(LIVE_ROSTER);
  t.as("location_manager", WEST_DODGE);
  const thread = t.thread();
  await thread.say(CA_CHAIN[0]);
  t.draftWrites({ observation: `Observed:\nMarnie Quill was late to open on October 20, 2026.${EXPECTATION}` });
  const id = await thread.create();
  return { thread, id };
}

export const NOV10_EXPECTATION_POLICY_LINE_KEPT_CASES: ReplayCase[] = [
  {
    id: "nov10-expectation-policy-line-kept",
    title: `"${CA_CHAIN[0]}": the saved Observation keeps the policy's Expectation`,
    report: REPORT,
    status: { open: "the Expectation sentence is dropped from the saved Observation" },
    fixFlags: FIX,
    async run(t) {
      const { id } = await created(t);
      const observation = t.values(id).observation ?? "";
      expect(observation, `the Expectation was dropped:\n${observation}`).toContain(EXPECTED);
    },
  },
];
