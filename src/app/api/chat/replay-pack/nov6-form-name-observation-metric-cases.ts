import { expect } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * THE OBSERVATION KEEPS "UNDER PERFORMANCE ON UPT" (port of the sibling app's
 * flip-3 gate, defect 3, 6 Nov 2026; FORM_NAME_FROM_ROSTER_ENABLED)
 * ============================================================================
 *
 * With the name flags on, "I need a CA for Under Performance on UPT, ATV, Average Ticket, Bundle Rate %, and Gift %."
 * lost "Under Performance on UPT" from the Observation of Offense: the "for <name>," stripper took the clause for the
 * request's name. The wording is QA's existing case's (nov5-request-slot-ca-for-under-performance). This app asks who
 * first for this message and drafts no Observation, so the replay holds before and after; the mechanism is proved in
 * forms/roster-only-names.test.ts.
 */
const NAME_SET = [
  "FORM_NAME_FROM_ROSTER_ENABLED",
  "ROSTER_NEAR_MISS_ENABLED",
  "ROSTER_NAME_IN_CANDIDATE_ENABLED",
  "ROSTER_COMPOUND_SURNAME_ENABLED",
  "ROSTER_NOT_FOUND_ANY_PHRASING_ENABLED",
  "OFF_ROSTER_CONFIRM_ENABLED",
];

export const NOV6_FORM_NAME_OBSERVATION_METRIC_CASES: ReplayCase[] = [
  {
    id: "nov6-form-name-keeps-under-performance",
    title: "\"I need a CA for Under Performance on UPT, …\" with the name set on: the Observation keeps \"Under Performance on UPT\"",
    report: "The sibling app's flip-3 gate (6 Nov 2026), defect 3: FORM_NAME_FROM_ROSTER dropped the manager's words from the Observation",
    status: "fixed",
    fixFlags: NAME_SET,
    async run(t) {
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const reply = await t.thread().say("I need a CA for Under Performance on UPT, ATV, Average Ticket, Bundle Rate %, and Gift %.");
      // This app asks who first and drafts no Observation for this message; when one is drafted, it keeps the words.
      const observation = /\*\*Observation of Offense:\*\*[^\n]*/.exec(reply.content)?.[0];
      if (observation === undefined) return;
      expect(observation, `the Observation drops the manager's words:\n${reply.content}`).toMatch(/Under Performance on UPT/);
    },
  },
];
