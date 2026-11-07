import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";

/**
 * coding 4's finding, relayed by QA (7 Nov 2026): "create a corrective action for <name>, not late" made a card
 * with "**Issue:** not late" and no "what happened" ask. A denial is no account. This branch is the Issue half (forms/incident-issue.ts); the ask half is in the protected ai/form-proposal.ts and waits for Pau. The sibling app's
 * BARE_NOT_AFTER_REQUEST fix (and its REPLY_MATCHES_CARD follow-up) for the same shape. The person is the
 * pack's invented Rowan Kestrel.
 */
const ASKS = /haven'?t told me what happened/i;
const FIX = ["DENIAL_NO_ACCOUNT_ENABLED"];
const REPORT = "coding 4 via QA, 7 Nov 2026: \"…, not late\" became the Issue, with no ask";

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-06T15:00:00Z"));
  t.directory(STAFF);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

function issueLine(content: string): string {
  return /\*\*Issue:\*\*[^·\n]*/.exec(content)?.[0] ?? "";
}

export const NOV7_DENIAL_NO_ACCOUNT_CASES: ReplayCase[] = [
  ...(
    [
      ["comma-not-late", "create a corrective action for Rowan Kestrel, not late"],
      ["ca-for-not-late", "ca for Rowan Kestrel not late"],
    ] as const
  ).flatMap(([key, said]): ReplayCase[] => [
    {
      id: `nov7-denial-no-account-${key}`,
      title: `"${said}": the denial is no Issue on the card`,
      report: REPORT,
      status: { open: "the card shows \"**Issue:** not late\"" },
      fixFlags: FIX,
      async run(t) {
        const thread = start(t);
        const reply = await thread.say(said);
        expect(thread.proposal, `no Corrective Action card:\n${reply.content}`).toMatchObject({ templateKey: "dpoa" });
        expect(issueLine(reply.content), `a denial is the Issue:\n${reply.content}`).not.toMatch(/not late/i);
      },
    },
    {
      id: `nov7-denial-no-account-asks-${key}`,
      title: `"${said}": the card asks what happened`,
      report: REPORT,
      status: { open: "the card drafts \"from what you've described\" with no \"what happened\" ask" },
      fixFlags: FIX,
      // The ask is decided in the protected ai/form-proposal.ts (awaitingIncident); that half waits for Pau (QA, 7 Nov 2026).
      fixStatus: { open: "the ask is decided in the protected form-proposal.ts; that half waits for Pau's approval" },
      async run(t) {
        const thread = start(t);
        const reply = await thread.say(said);
        expect(reply.content, `drafted with no account:\n${reply.content}`).toMatch(ASKS);
      },
    },
  ]),
  {
    id: "nov7-denial-no-account-negative-late",
    title: "negative: \"ca for <A>, she was late on 11/2\" is an account: no ask",
    report: `${REPORT} (the condition)`,
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      const reply = await thread.say("ca for Rowan Kestrel, she was late on 11/2");
      expect(reply.content, `asked although she was late:\n${reply.content}`).not.toMatch(ASKS);
    },
  },
];
