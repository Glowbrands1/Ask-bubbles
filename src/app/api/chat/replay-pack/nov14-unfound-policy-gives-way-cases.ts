import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * A NAMED POLICY THE MANUAL LACKS NEVER PUSHES OUT THE ACCOUNT (UNFOUND_POLICY_GIVES_WAY_TO_ACCOUNT_ENABLED)
 * ============================================================================
 *
 * QA's Bubbles 17y live test (14 Nov 2026, production with ACCOUNT_CHANGE + CLOSE_SENTENCE + POLICY_NOT_FOUND on): the
 * account said she was late AND named a policy that is not in the manual ("pet grooming policy"). The policy line was
 * right ("I don't see a section … for "pet grooming" …"), but the Issue was "violating the pet grooming policy": "she
 * was late" was dropped. Pre-existing (the same with those flags off). The person is the pack's invented one.
 */

const REPORT = "QA's Bubbles 17y live test (14 Nov 2026): Issue \"violating the pet grooming policy\"; the lateness she stated was dropped";
const FLAG = "UNFOUND_POLICY_GIVES_WAY_TO_ACCOUNT_ENABLED";

function issueOf(proposal: unknown): string {
  return String((proposal as Record<string, unknown> | null)?.issue ?? "");
}

export const NOV14_UNFOUND_POLICY_GIVES_WAY_CASES: ReplayCase[] = [
  {
    id: "nov14-unfound-policy-gives-way-for-clause",
    title: "\"create a CA for Marnie Holloway for violating the pet grooming policy, she was late on 11/3/26\": the Issue is the lateness",
    report: REPORT,
    status: { open: "Issue \"violating the pet grooming policy\"; \"she was late\" dropped" },
    fixFlags: [FLAG],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-13T16:00:00Z"));
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say("create a CA for Marnie Holloway for violating the pet grooming policy, she was late on 11/3/26");
      const issue = issueOf(thread.proposal);
      expect(issue, reply.content).toMatch(/she was late on 11\/3\/26/);
      expect(issue, "the un-found policy is the Issue").not.toMatch(/^violating the pet grooming policy$/i);
    },
  },
  {
    id: "nov14-unfound-policy-gives-way-account-first",
    title: "guard: \"create a CA for Marnie Holloway, she was late on 11/3/26 and violated the pet grooming policy\": the Issue keeps the lateness",
    report: `${REPORT}; QA's variant (guard)`,
    status: "fixed",
    fixFlags: [FLAG],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-13T16:00:00Z"));
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say("create a CA for Marnie Holloway, she was late on 11/3/26 and violated the pet grooming policy");
      expect(issueOf(thread.proposal), reply.content).toMatch(/she was late on 11\/3\/26/);
    },
  },
  {
    id: "nov14-unfound-policy-gives-way-policy-after",
    title: "guard: \"create a CA for Marnie Holloway, she was late on 11/3/26, pet grooming policy\": the Issue is the lateness and the policy is Attendance",
    report: `${REPORT}; QA's variant (guard)`,
    status: "fixed",
    fixFlags: [FLAG],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-13T16:00:00Z"));
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say("create a CA for Marnie Holloway, she was late on 11/3/26, pet grooming policy");
      expect(issueOf(thread.proposal), reply.content).toBe("she was late on 11/3/26");
      expect(reply.content).toMatch(/\*\*Policy:\*\* Attendance/);
    },
  },
  {
    // What this guards is the card's Policy line (Attendance, as before). The Issue gives way to the account here too:
    // QA accepted that for every named policy, found or not (14 Nov 2026, Gate-Bubbles-5's #909 probes).
    id: "nov14-unfound-policy-gives-way-known-policy-kept",
    title: "guard: \"create a CA for Marnie Holloway for violating the attendance policy, she was late on 11/3/26\": a policy the app reads is as before",
    report: `${REPORT}; negative (a known policy)`,
    status: "fixed",
    fixFlags: [FLAG],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-13T16:00:00Z"));
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      const reply = await thread.say("create a CA for Marnie Holloway for violating the attendance policy, she was late on 11/3/26");
      expect(reply.content).toMatch(/\*\*Policy:\*\* Attendance/);
    },
  },
];
