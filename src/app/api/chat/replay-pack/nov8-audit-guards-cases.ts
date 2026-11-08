import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * GUARDS FOR QA's ROUND-6 FLAG AUDIT (8 Nov 2026): A FIX THE SIBLING APP HAS BEHIND A FLAG THIS APP DOES NOT HAVE
 * ============================================================================
 *
 * The sibling app's BARE_NOT_AFTER_REQUEST (its live re-check, 6 Nov 2026): "ca for <A> not late" asked nothing,
 * because the clause starts with the request. This app holds with its production flags (DENIAL_NO_ACCOUNT takes a
 * denial off the card); these cases keep it that way (`docs/parity-log/2026-11-08-*.md` in the sibling app). The
 * sibling's words; the people are invented.
 */
const ASKS = /haven'?t told me what happened/i;

async function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-06T02:00:00Z"));
  t.directory(STAFF);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

export const NOV8_AUDIT_GUARDS_CASES: ReplayCase[] = [
  {
    id: "nov8-audit-bare-not-after-request-ca-for-not-late",
    title: "(b) \"ca for <A> not late\": no account, so the Corrective Action card asks what happened",
    report: "QA's round-6 flag audit (8 Nov 2026): the sibling app's BARE_NOT_AFTER_REQUEST (its live re-check, 6 Nov 2026); not needed here",
    status: "fixed",
    async run(t) {
      const thread = await start(t);
      const reply = await thread.say("ca for Rowan Kestrel not late");
      expect(thread.proposal, `no Corrective Action card:\n${reply.content}`).toMatchObject({ templateKey: "dpoa" });
      expect(reply.content, `drafted with no account:\n${reply.content}`).toMatch(ASKS);
    },
  },
  {
    id: "nov8-audit-bare-not-after-request-negative-late",
    title: "negative: \"ca for <A> she was late\" is an account: no ask",
    report: "QA's round-6 flag audit (8 Nov 2026): the condition of the sibling app's BARE_NOT_AFTER_REQUEST",
    status: "fixed",
    async run(t) {
      const thread = await start(t);
      const reply = await thread.say("ca for Rowan Kestrel she was late on 11/2");
      expect(reply.content, `asked although she was late:\n${reply.content}`).not.toMatch(ASKS);
    },
  },
];
