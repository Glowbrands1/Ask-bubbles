import { expect } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * A SECOND CORRECTIVE ACTION FOR THE SAME EMPLOYEE IN ONE CHAT (port of the sibling app's audit, QA, 7 Nov 2026)
 * ============================================================================
 *
 * In the sibling app, DRAFT_DEDUPE's lookup read every turn of the chat as the incident and reopened the first draft,
 * and a second form carried the first request's policy. Here DRAFT_DEDUPE is off in production and replay shows no
 * carry-over (the second card cites its own policy); these cases keep it so. SECOND_REQUEST_OWN_ACCOUNT_ENABLED makes
 * the same lookup read only the request now being written (`forms/second-request-reopen.test.ts`). A realistic
 * two-request chat; the person is invented (STAFF's Remy Calder).
 */
const FIRST = "create a corrective action for Remy Calder, he was late opening the store on 11/2";
const SECONDS: Record<string, string> = {
  another: "I need another corrective action for Remy Calder, his cash drawer was short $20 on 11/3",
  separate: "now make a separate CA for Remy Calder for his cash drawer being short $20 on 11/3",
  create: "create a corrective action for Remy Calder, his cash drawer was short $20 on 11/3",
};

const line = (content: string, label: string) => new RegExp(String.raw`\*\*${label}:\*\*[^\n]*`).exec(content)?.[0] ?? "";

export const NOV7_SECOND_CA_SAME_EMPLOYEE_CASES: ReplayCase[] = Object.entries(SECONDS).map(
  ([key, second]): ReplayCase => ({
    id: `nov7-second-ca-same-employee-${key}`,
    title: `a CA for <name> (late opening), created; then "${second.slice(0, 50)}…": a second form, the first never reopened or changed, and the second card's policy is not the first request's`,
    report: "The sibling app's audit (QA, 7 Nov 2026): a second CA for the same employee in one chat may reopen the first",
    status: "fixed",
    fixFlags: ["SECOND_REQUEST_OWN_ACCOUNT_ENABLED"],
    async run(t) {
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      await thread.say(FIRST);
      const first = await thread.create();
      const firstBefore = { ...t.values(first) };
      const reply = await thread.say(second);
      expect(reply.formOpened?.instanceId ?? null, `the first form is reopened:\n${reply.content}`).not.toBe(first);
      expect(line(reply.content, "Policy"), `the Policy is the first request's:\n${reply.content}`).not.toMatch(/late opening/i);
      const secondForm = await thread.create();
      expect(secondForm, "no second form").not.toBe(first);
      expect(t.values(first), "the first form changed").toEqual(firstBefore);
    },
  }),
);
