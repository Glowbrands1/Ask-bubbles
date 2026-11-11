import { expect } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * NEVER REUSE ANOTHER MANAGER'S DRAFT (QA, 25 Oct 2026; rebuilt 6 Nov 2026)
 * ============================================================================
 *
 * QA: manager B's create from chat could reopen manager A's open draft for
 * the same employee, form and date (`findCrossChatOpenDraft` read
 * `form_instances` with no `created_by`). Two managers at the same store, each
 * in a chat of their own, ask for the same Corrective Action Form.
 *
 * Production today (QA's Vercel read): DRAFT_REUSE_SAME_CHAT_ONLY_ENABLED on,
 * CROSS_CHAT_DRAFT_DEDUPE_ENABLED unset, so B gets a new draft.
 *
 * - `cross-manager`, fix run (CROSS_CHAT_DRAFT_DEDUPE on as well): the pack's
 *   two chats both start at message "m1", so B's Create carries the same chat
 *   key as A's draft records, as a forged or colliding key would, and the
 *   same-chat filter lets A's draft through. Without DRAFT_REUSE_OWN_ONLY_ENABLED
 *   B was handed A's draft here (6 Nov 2026, before the fix).
 * - `one-flag-away`: the cross-chat lookup on and the same-chat filter off. B
 *   is handed A's draft: OPEN until DRAFT_REUSE_OWN_ONLY_ENABLED is on.
 *
 * Every combination of the reuse flags, with B's own and A's forged chat key,
 * is pinned in the route test (`forms/draft-reuse-own-only-nov6-route.test.ts`).
 * People are invented.
 */

const FIX = "DRAFT_REUSE_OWN_ONLY_ENABLED";
const REPORT = "QA, 25 Oct 2026: a create from chat could reopen an open draft for the same employee, template and incident date that another manager made";

/**
 * Manager B's turn as the old pull request's test had it: as reported, and the
 * real register (lowercase, abbreviated, a typo). The register's date is
 * written "10-20-26" here, not "10 20 26": the card does not read "10 20 26"
 * as a date, and with no date the cross-chat lookup never runs, so the case
 * would not reach the leak. The route test keeps "10 20 26" (its card sends
 * the date itself).
 */
const TURNS = [
  ["sentence", "create a CA for Rowan Kestrel, she opened 40 minutes late on 10-20-26"],
  ["lower", "ca for rowan kestrel she opend 40 min late 10-20-26 just do it already"],
] as const;

/** Manager A makes a draft in their chat; manager B, same store, asks the same in a new chat and presses Create. */
async function twoManagers(t: ReplayContext, said: string): Promise<void> {
  t.directory(STAFF);
  t.as("location_manager", WEST_DODGE, "manager-a");
  const chatA = t.thread();
  await chatA.say("create a CA for Rowan Kestrel, she opened 40 minutes late on 10-20-26");
  t.draftWrites({});
  const draftA = await chatA.create();

  t.as("location_manager", WEST_DODGE, "manager-b");
  const chatB = t.thread();
  await chatB.say(said);
  t.draftWrites({});
  const draftB = await chatB.create();

  expect(draftB, "manager B was handed manager A's draft").not.toBe(draftA);
  const rowB = t.forms().find((row) => row.id === draftB);
  expect(rowB?.created_by, "manager B's draft is B's").toBe("manager-b");
}

export const NOV6_DRAFT_REUSE_OWN_ONLY_CASES: ReplayCase[] = TURNS.flatMap(([register, said]): ReplayCase[] => [
  {
    id: `nov6-own-only-cross-manager-${register}`,
    title: `two managers, same store, same CA ("${said.slice(0, 40)}…"): B gets a new draft`,
    report: REPORT,
    status: "fixed",
    fixFlags: [FIX, "CROSS_CHAT_DRAFT_DEDUPE_ENABLED"],
    run: (t) => twoManagers(t, said),
  },
  {
    id: `nov6-own-only-one-flag-away-${register}`,
    title: `two managers, cross-chat dedupe on and same-chat-only off ("${said.slice(0, 40)}…"): B gets a new draft`,
    report: `${REPORT}; production is one flag away (DRAFT_REUSE_SAME_CHAT_ONLY off with CROSS_CHAT_DRAFT_DEDUPE on)`,
    status: { open: "with CROSS_CHAT_DRAFT_DEDUPE on and DRAFT_REUSE_SAME_CHAT_ONLY off, B is handed A's draft; DRAFT_REUSE_OWN_ONLY_ENABLED fixes it" },
    fixFlags: [FIX],
    run: async (t) => {
      // Restored after the case with every other chat flag (CHAT_QUALITY_FLAG_NAMES).
      process.env.CROSS_CHAT_DRAFT_DEDUPE_ENABLED = "true";
      delete process.env.DRAFT_REUSE_SAME_CHAT_ONLY_ENABLED;
      await twoManagers(t, said);
    },
  },
]);
