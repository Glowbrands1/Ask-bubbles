import { expect } from "vitest";

import { STAFF, type DirectoryRow, type ReplayCase } from "./cases";

/**
 * QA, 10 Nov 2026 (Bubbles s14 path 1, found porting the sibling app's round-22 check): with the roster-name set on,
 * "ok, create a follow-up coaching form for rozline quellmar. i trained her …" is asked "Is this for **Rozlyn
 * Quellmar**?". The answer "Oops, it's Rozlyn quellmar" became the name alone — the request was looked for by the
 * chosen first name, and the manager had typed "rozline" — so the card went back to the earlier Coaching Form.
 * NEAR_MISS_ANSWER_KEEPS_REQUEST_ENABLED keeps the request the question asked about. (Its date on later turns needs
 * the person-scoping fix too — TYPO_CORRECTED_SAME_PERSON, pending Pau's lines; `nov10-r22-eval-losses-cases.ts`.)
 * Invented person.
 */
const GLOBAL = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
const ROZLYN: DirectoryRow = {
  id: "e-rozlyn-quellmar",
  firstName: "Rozlyn",
  lastName: "Quellmar",
  preferredFirstName: null,
  employmentStatus: "active",
  locationIds: ["loc-264"],
  positionName: "Team Member Part Time",
};

export const NOV10_NEAR_MISS_ANSWER_KEEPS_REQUEST_CASES: ReplayCase[] = [
  {
    id: "nov10-near-miss-answer-keeps-request",
    title: "\"Oops, it's Rozlyn quellmar\" answering the near-miss question keeps the follow-up coaching request it answered",
    report: "QA, 10 Nov 2026: Bubbles s14 path 1",
    status: { open: "with production's flags the answer is the name alone: the card goes back to the earlier Coaching Form" },
    fixFlags: ["NEAR_MISS_ANSWER_KEEPS_REQUEST_ENABLED"],
    async run(t) {
      t.directory([...STAFF, ROZLYN]);
      t.as("location_manager", GLOBAL);
      const thread = t.thread();
      await thread.say("help me create a coaching form");
      await thread.say("October 1st");
      const asked = await thread.say("ok, create a follow-up coaching form for rozline quellmar. i trained her on the new promo and we roleplayed a couple objections");
      expect(asked.content, "the near-miss question is asked").toMatch(/\*\*Rozlyn Quellmar\*\*/);
      await thread.say("Oops, it's Rozlyn quellmar");
      expect(thread.proposal?.employeeName ?? null).toBe("Rozlyn Quellmar");
      expect(thread.proposal?.templateKey ?? null, "the follow-up coaching request is kept").toBe("follow-up-coaching");
    },
  },
];
