import { expect, vi } from "vitest";

import { STAFF, WEST_DODGE, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * P12, PART 2 — THE TEAM CARD (QA's live finding on the sibling app's round 17, 10 Nov 2026; port)
 * ============================================================================
 *
 * "make me a coaching form for the team at <store> on selling lotion bottles" → "the employee needs to be left blank":
 * the sibling app's team card carried the request lead and the instruction in its Observation. This app's card shows
 * no Observation; the same words reached the drafting model as the account, and with the model writing nothing the
 * never-blank fallback SAVED "Observed: The employee needs to be left blank." QA's turns are verbatim, with this app's
 * store for the sibling's salon; no person is named.
 */

const TURNS = ["make me a coaching form for the team at West Dodge on selling lotion bottles", "the employee needs to be left blank"] as const;

export const NOV10_P12_TEAM_CARD_INSTRUCTIONS_CASES: ReplayCase[] = [
  {
    id: "nov10-p12-team-card-no-request-lead-or-blank-employee",
    title: `P12 part 2 (team card): "${TURNS[0]}" → "${TURNS[1]}" → Create: the request lead and the instruction are never the account, never saved`,
    report: `QA, 10 Nov 2026 (the sibling app's round 17, live): "make me a coaching form for the team at <store> on selling lotion bottles" → "${TURNS[1]}": the team card's Observation carried both`,
    status: { open: "the drafting model is handed \"the employee needs to be left blank\" as the account, and the saved Details are \"Observed: The employee needs to be left blank.\"" },
    fixFlags: ["APP_INSTRUCTIONS_NOT_ACCOUNT_ENABLED"],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-10T06:30:00Z"));
      t.directory([...STAFF]);
      t.as("location_manager", WEST_DODGE);
      const thread = t.thread();
      for (const said of TURNS) {
        const reply = await thread.say(said);
        expect(thread.proposal, `no team Coaching card after "${said}":\n${reply.content}`).toMatchObject({ templateKey: "coaching", subject: "team" });
      }
      const id = await thread.create();
      // The draft prompt carries the notes JSON-escaped ("\\n" between turns).
      const described = /WHAT THE MANAGER DESCRIBED:(?:\\n|\n)([\s\S]*?)(?:\\n|\n)FIELDS YOU MAY WRITE/.exec(t.draftPrompts().at(-1) ?? "")?.[1] ?? "";
      expect(described, "the account handed to the drafting model lost the topic").toMatch(/selling lotion bottles/i);
      expect(described, "the request lead was handed over as the account").not.toMatch(/\bmake\s+me\b|coaching form/i);
      expect(described, "the Employee-field instruction was handed over as the account").not.toMatch(/left blank|employee needs/i);
      expect(t.values(id).coaching_details ?? "", "the Employee-field instruction was saved in Details").not.toMatch(/left blank|employee needs/i);
    },
  },
];
