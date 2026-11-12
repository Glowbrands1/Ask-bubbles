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

/** The 27 Oct live report's turns (`account-only-policy-query-e2e.test.ts`, invented person) and what the model wrote. */
const OPENING_TURNS = ["create a CA form for dale ferris at dodge. she was late on the 2nd", "yes payroll deduct", "$25"];
const OPENING_LINE = "An employee assigned to open the location is expected to arrive on time and ready to work at the start of the scheduled shift, and to notify the manager as soon as possible if unable to do so.";
const OPENING_DRAFT = `Observed:\nDale was late to open the location on October 2, 2026.\n\nExpectation:\n${OPENING_LINE}`;

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
  {
    // Gate-Bubbles-5 (record 2f2b8517): the flag kept every general expectation, so this saved the opening story nobody
    // wrote. It is exempt only from "scheduled to" now; the line says "open" and the manager never did.
    id: "nov12-expectation-policy-line-no-invented-opening",
    title: `"${OPENING_TURNS.join('" / "')}": no general expectation about opening is saved`,
    report: "Gate-Bubbles-5 (12 Nov 2026), R737 regression: account-only-policy-query-e2e, the 27 Oct live report",
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      vi.setSystemTime(new Date("2026-10-21T15:00:00Z"));
      t.directory([{ id: "e-9", firstName: "Dale", lastName: "Ferris", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: null }]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      for (const turn of OPENING_TURNS) await thread.say(turn);
      t.draftWrites({ observation: OPENING_DRAFT });
      const id = await thread.create();
      const observation = t.values(id).observation ?? "";
      expect(observation, `an opening nobody wrote was saved:\n${observation}`).not.toMatch(/\bopen/i);
    },
  },
];
