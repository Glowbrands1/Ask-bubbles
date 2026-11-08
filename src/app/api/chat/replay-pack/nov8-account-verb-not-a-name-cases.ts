import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * "FOR <FIRST NAME> FAILING TO COMPLETE SHIFTS" IS NO "<FIRST> FAILING" (QA round 5, sf-s38; production, 7 Nov 2026)
 * ============================================================================
 *
 * The manager's words (the employee invented): after a CA for "<name> missing her saturday and sunday shifts …", the
 * turn "make me CA for <first name> failing to complete shifts" made the card for "<First> Failing". The verb opening
 * the account was read as a surname. ACCOUNT_VERB_NOT_A_NAME_ENABLED (`forms/not-a-name.ts`), with NOT_A_NAME_GUARD
 * (on in production): the verb is never part of the name.
 */
const RHEA: DirectoryRow = {
  id: "e-rhea-calloway-s38",
  firstName: "Rhea",
  lastName: "Calloway",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "Team Member Part Time",
};
const FIRST =
  "make me an CA for Rhea Calloway missing her saturday and sunday shifts due to wanting to go home for the weekend but failed to communicate proporley";
const FIX = ["ACCOUNT_VERB_NOT_A_NAME_ENABLED"];
const REPORT = "QA round 5, sf-s38 (the sibling app's production chat, 7 Nov 2026; ported)";

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-07T16:14:00Z"));
  t.directory([...STAFF, RHEA]);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

export const NOV8_ACCOUNT_VERB_NOT_A_NAME_CASES: ReplayCase[] = [
  {
    id: "nov8-s38-failing-is-no-surname",
    title: "\"make me CA for <first name> failing to complete shifts\": the card is for the roster person, never \"<First> Failing\"",
    report: REPORT,
    status: { open: "the card is for \"Rhea Failing\"" },
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      await thread.say(FIRST);
      await thread.say(FIRST);
      await thread.say("create it");
      const reply = await thread.say("make me CA for rhea failing to complete shifts");
      expect(thread.proposal?.employeeName ?? null, `the verb is read as a surname:\n${reply.content}`).not.toMatch(/failing/i);
      // Here the card is for "Rhea" (first name only), with and without the flag, as for "for Rhea Calloway failing …" on
      // production's flags: the reader returns "Rhea Calloway failing" (protected forms/proposal.ts). Cutting the name at the
      // verb there is a separate change for Pau (QA, 8 Nov 2026); this flag only keeps the verb out of the name.
      expect(thread.proposal?.employeeName ?? "", `no card for her:\n${reply.content}`).toMatch(/^Rhea\b/);
    },
  },
];
