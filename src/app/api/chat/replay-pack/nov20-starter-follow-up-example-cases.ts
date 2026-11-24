import { expect, vi } from "vitest";

import { WEST_DODGE, STAFF, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * A HOME STARTER'S FOLLOW-UP CARRIES ONE EXAMPLE ANSWER (port from the sibling app's #1127 and #1150, QA item 24)
 * ============================================================================
 *
 * The sibling app's production audit (20 Nov 2026): managers tapped the home starter "Create a coaching form." with nothing
 * else said; the app asked who it was for, and managers left. This app has the same starter (`QUICK_QUESTIONS`). With
 * STARTER_FOLLOW_UP_EXAMPLE_ENABLED the who-question carries one short example in this app's store wording. A request
 * that names the person is unchanged. Default off; QA flips it, so these cases are open on production's flags.
 */

const FIX = ["STARTER_FOLLOW_UP_EXAMPLE_ENABLED"];
const REPORT = "QA item 24 (the sibling app's production audit, 20 Nov 2026, ported): \"Create a coaching form.\" got \"who?\" with no help, and managers left";
const EXAMPLE = 'For example: "coaching for <name> on being late to open the store".';

export const NOV20_STARTER_FOLLOW_UP_EXAMPLE_CASES: ReplayCase[] = [
  {
    id: "nov20-starter-coaching-form-who-has-example",
    title: "Item 24: the home starter \"Create a coaching form.\" as the first message: the who-question carries one example answer",
    report: REPORT,
    status: { open: "STARTER_FOLLOW_UP_EXAMPLE_ENABLED is off in production until QA flips it" },
    fixFlags: FIX,
    async run(t) {
      vi.setSystemTime(new Date("2026-11-20T15:00:00Z"));
      t.directory([...STAFF]);
      t.as("location_manager", WEST_DODGE);
      const reply = await t.thread().say("Create a coaching form.");
      expect(reply.content, `the reply does not ask who:\n${reply.content}`).toMatch(/Who is this (?:\*\*Coaching Form\*\*|form) for\?/);
      expect(reply.content, `no example answer:\n${reply.content}`).toContain(EXAMPLE);
    },
  },
  {
    id: "nov20-starter-control-named-request-unchanged",
    title: "Item 24 control: \"Create a coaching form for Marlo Pennick on being late to open\" names the person: no example line",
    report: `${REPORT}; only the bare starter`,
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      vi.setSystemTime(new Date("2026-11-20T15:00:00Z"));
      t.directory([...STAFF]);
      t.as("location_manager", WEST_DODGE);
      const reply = await t.thread().say("Create a coaching form for Marlo Pennick on being late to open");
      expect(reply.content).not.toContain(EXAMPLE);
    },
  },
];
