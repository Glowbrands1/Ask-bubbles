import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * A METRIC SAID TO BE LOW IS NOT THE EMPLOYEE (QA's prod-env reading, 10 Nov 2026, D4; METRIC_ALONE_NOT_A_NAME_ENABLED)
 * ============================================================================
 *
 * With production's flags (CA_SALES_POLICY on: a metric may ground a Corrective Action), "Their Club Close is low. Create
 * a corrective action." (`corrective-action-conversation.test.ts`) drafted the form for an employee named "Club Close"
 * and asked for Club Close's position. The metric guard knew only a metric written with "%", a list item or an offense
 * word. "Club Close" is a sibling-app metric inherited in that test; the mechanism is the same for any metric phrase, so
 * this case uses an invented one in the same sentence.
 */
const SAID = "Their Lather Club is low. Create a corrective action.";
const FIX = ["METRIC_ALONE_NOT_A_NAME_ENABLED"];
const REPORT = "QA's prod-env reading (10 Nov 2026, D4): a metric said to be low was read as the employee's name";

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-10T15:00:00Z"));
  t.directory(STAFF);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

export const NOV10_METRIC_ALONE_NOT_A_NAME_CASES: ReplayCase[] = [
  {
    id: "nov10-metric-alone-not-a-name",
    title: `"${SAID}": no card names "Lather Club" as the employee`,
    report: REPORT,
    // Changed on purpose (12 Nov 2026): with main 1471dab3's production flags the card no longer names "Lather Club" (the
    // roster-name set, on since Bubbles 16c, already keeps a metric off the card), so this holds without METRIC_ALONE_NOT_A_NAME.
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      const reply = await thread.say(SAID);
      expect(thread.proposal?.employeeName ?? "", `the metric is the card's person:\n${reply.content}`).not.toMatch(/lather club/i);
      expect(reply.content, "the reply names the metric as the person").not.toMatch(/for \*\*Lather Club\*\*|Lather Club's position/i);
    },
  },
];
