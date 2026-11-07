import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * GUARDS: THE SIBLING APP'S ROUND-4 ITEMS, ALREADY RIGHT HERE (QA, 8 Nov 2026)
 * ============================================================================
 *
 * Ask Sunny's flip-9 live tester found (1) "ca for <A> not late" asking what happened beside "**Policy:**
 * Attendance — read from this request", and (2) "… $20 payroll deduct applies" reading Yes but asking the amount
 * again. Checked on this app's main with production's flags plus its flips 6 and 8 (not yet in production-flags.json): (1) asks what happened with no
 * policy read from the request, and (2) reads the $20. These cases keep it so. See `docs/parity-log/2026-11-08-*`.
 * The person is invented.
 */
const ASKS = /haven'?t told me what happened/i;

async function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-07T02:00:00Z"));
  t.directory(STAFF);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

export const NOV8_SUNNY_ROUND4_GUARDS_CASES: ReplayCase[] = [
  {
    id: "nov8-guard-ca-for-not-late-no-app-policy",
    title: "\"ca for <A> not late\": the card asks what happened, and reads no policy from the request",
    report: "QA, 8 Nov 2026: the sibling app's flip-9 live tester (1); a guard here",
    // production-flags.json does not list flip 8 yet: without DENIAL_NO_ACCOUNT (live since flip 8) the card drafts
    // with no account and does not ask. With the live flags named here it holds.
    status: { open: "the flags file's production (flip 8 not listed): no ask, drafted with no account" },
    fixFlags: ["DENIAL_NO_ACCOUNT_ENABLED", "AS_YOU_SAID_APP_READ_ENABLED"],
    async run(t) {
      const thread = await start(t);
      const reply = await thread.say("ca for Rowan Kestrel not late");
      expect(thread.proposal, `no Corrective Action card:\n${reply.content}`).toMatchObject({ templateKey: "dpoa", employeeName: "Rowan Kestrel" });
      expect(reply.content, `drafted with no account:\n${reply.content}`).toMatch(ASKS);
      expect(reply.content, `a policy read from a denied fault:\n${reply.content}`).not.toMatch(/read from this request/i);
    },
  },
  {
    id: "nov8-guard-amount-before-payroll-deduct",
    title: "\"… $20 payroll deduct applies\": the $20 is the amount, never asked again",
    report: "QA, 8 Nov 2026: the sibling app's flip-9 live tester (2); a guard here",
    status: "fixed",
    async run(t) {
      const thread = await start(t);
      const reply = await thread.say("create a verbal ca for Rowan Kestrel. on 11-1-26 the register was off $20. $20 payroll deduct applies");
      expect(thread.proposal, `no CA card for Rowan Kestrel:\n${reply.content}`).toMatchObject({ templateKey: "dpoa", employeeName: "Rowan Kestrel" });
      expect(reply.content, `the amount was asked again:\n${reply.content}`).not.toMatch(/Payroll deduction amount\**\?/);
      expect(reply.content, `the $20 is not on the card:\n${reply.content}`).toMatch(/Payroll deduction amount:?\**:?\s*\**\$20\b/);
    },
  },
];
