import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type DirectoryRow, type ReplayAnswer, type ReplayCase, type ReplayContext } from "./cases";

/**
 * ============================================================================
 * "MAKE IT ABOUT …" ON A PROPOSAL CARD WAS PUT ON THE CARD AS THE ACCOUNT (QA, 8 Nov 2026)
 * ============================================================================
 *
 * QA's flip-9 tester, item 9, found in the sibling app (live, Sonnet 5, reproduced there 2/2 with production's flags,
 * EDIT_MAKE_IT_ABOUT on and off): on a Coaching proposal card (no draft yet), "I need you to make it about showing
 * up late and please list the policy make the date for 10/14/26." was read as more of what happened. There, the
 * card's Observation and the drafting model's notes at Create held the instruction word for word. Here the Coaching
 * card shows no Observation line, but the drafting model's notes at Create hold the instruction (checked 8 Nov 2026). sf-s34's fix (EDIT_MAKE_IT_ABOUT) is for an open draft; a proposal card is not Step B's.
 * PROPOSAL_MAKE_IT_ABOUT_ENABLED (`ai/make-it-about.ts`). The manager's words; the employee is invented.
 */

const MERIDA: DirectoryRow = {
  id: "e-merida-ashcombe-p9",
  firstName: "Merida",
  lastName: "Ashcombe",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "Team Member Part Time",
};

const REQUEST = "create a coaching form for Merida Ashcombe, he missed the monthly meeting on 10/10/26";
const EDIT = "I need you to make it about showing up late and please list the policy make the date for 10/14/26.";
const INSTRUCTION = /make it about|I need you to|please list/i;
const FIX = ["PROPOSAL_MAKE_IT_ABOUT_ENABLED"];
const REPORT = "QA's flip-9 tester, item 9, found in the sibling app (8 Nov 2026), ported";

function start(t: ReplayContext) {
  vi.setSystemTime(new Date("2026-11-07T14:00:00Z"));
  t.directory([...STAFF, MERIDA]);
  t.as("location_manager", WEST_DODGE);
  return t.thread();
}

function observationLine(reply: ReplayAnswer): string {
  return reply.content.split("\n").find((line) => /\*\*Observation of Offense:?\*\*/i.test(line)) ?? "";
}

export const NOV8_PROPOSAL_MAKE_IT_ABOUT_CASES: ReplayCase[] = [
  {
    id: "nov8-proposal-make-it-about-card",
    title: "on a Coaching proposal card, \"I need you to make it about showing up late …\": the card never reads the instruction back as the account",
    report: REPORT,
    // This app's Coaching card has no Observation line, so it holds with production's flags; a guard for the port.
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      await thread.say(REQUEST);
      expect(thread.proposal, "a Coaching card for Merida").toMatchObject({ templateKey: "coaching", employeeName: "Merida Ashcombe" });
      const reply = await thread.say(EDIT);
      expect(thread.proposal?.templateKey, "still the Coaching card").toBe("coaching");
      expect(observationLine(reply), "the instruction is on the card as the account").not.toMatch(INSTRUCTION);
    },
  },
  {
    id: "nov8-proposal-make-it-about-create",
    title: "…then Create: the drafting model is told \"showing up late\", and the drafted Details never hold the instruction",
    report: REPORT,
    status: { open: "the drafting model's notes are both turns as typed (\"I need you to make it about …\")" },
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      await thread.say(REQUEST);
      await thread.say(EDIT);
      const id = await thread.create();
      const described = t.draftPrompts().map((prompt) => (prompt.split("WHAT THE MANAGER DESCRIBED:")[1] ?? "").split("FIELDS YOU MAY WRITE:")[0] ?? "");
      expect(described.length, "a draft was written").toBeGreaterThan(0);
      for (const text of described) {
        expect(text, "the drafting model is told the instruction as what happened").not.toMatch(INSTRUCTION);
        expect(text, "the drafting model is not told what the form is about").toMatch(/showing up late/i);
      }
      expect(t.values(id).coaching_details ?? "", "the drafted Details hold the instruction").not.toMatch(INSTRUCTION);
      // Not asserted here: this app's card leaves the Date unset and asks which of 10/10 and 10/14 (with this flag on or
      // off, checked 8 Nov 2026), so the form is dated today until the manager answers. Reported to QA separately.
    },
  },
  {
    id: "nov8-proposal-make-it-about-negative",
    title: "negative: with no \"make it about\", the drafting model is told the account as before",
    report: `${REPORT} (the condition)`,
    status: "fixed",
    fixFlags: FIX,
    async run(t) {
      const thread = start(t);
      await thread.say(REQUEST);
      await thread.say("she also left her station early that day");
      await thread.create();
      const described = t.draftPrompts().map((prompt) => prompt.split("WHAT THE MANAGER DESCRIBED:")[1] ?? "");
      expect(described.join("\n"), "the account lost words").toMatch(/monthly meeting/i);
    },
  },
];
