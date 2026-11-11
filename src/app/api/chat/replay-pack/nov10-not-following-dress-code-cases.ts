import { expect, vi } from "vitest";

import { WEST_DODGE, type ReplayCase } from "./cases";
import { REFUSAL_ROSTER } from "./nov7-step-b-refusals-scenarios";

/**
 * ============================================================================
 * "MAKE IT ABOUT NOT FOLLOWING THE DRESS CODE" NAMES THE DRESS CODE (QA's live Bubbles report, 10 Nov 2026;
 * NOT_FOLLOWING_IS_VIOLATION_ENABLED)
 * ============================================================================
 *
 * Pau's wording, "make it about not following the dress code", read as no policy named: "not" + up to two words before
 * the policy topic set it aside (`forms/ca-policy.ts`, NEGATED_BEFORE). Ported from coding 4's Ask Sunny case
 * (ask-sunny 4e268731). That case checks the saved Coaching draft's "Policy reference:" line after an earlier
 * made-about; this app has no made-about policy line (MADE_ABOUT_POLICY_LINE is Ask Sunny's), so here the same words
 * are checked where this app cites the manual from them: the Coaching card's citation and the Corrective Action card's
 * Policy line. Off (production's flags), neither names the Dress Code. The pack's invented person.
 */
/** The manual's Dress Code section, as the production manual rows hold it (`test/fixtures/jba-manual-production-151.json`). */
const DRESS_CODE_CHUNK = {
  chunkIndex: 44,
  chunkId: "jba-44",
  locator: "Page 15 — Dress Code for The Company",
  page: 16,
  content:
    "Dress Code for The Company\nThe Company Employees are to keep a neat, clean, professional appearance at all times. Anyone\nviolating their Brand’s Dress code policy will be sent home to change into proper work attire.",
  section: "Dress Code for The Company",
  printedPage: 15,
  sections: [
    { heading: "Dress Code for The Company", page: 15 },
    { heading: "All Locations Dress Code", page: 15 },
  ],
};

const REPORT = "QA's live Bubbles report (10 Nov 2026): \"make it about not following the dress code\" named no Dress Code";

export const NOV10_NOT_FOLLOWING_DRESS_CODE_CASES: ReplayCase[] = [
  {
    id: "nov10-not-following-dress-code-coaching-cites",
    title: "\"create a coaching form for Marnie Holloway, make it about not following the dress code\": the card cites the Dress Code",
    report: REPORT,
    status: { open: "\"not following the dress code\" is read as no policy named: the card cites nothing" },
    fixFlags: ["NOT_FOLLOWING_IS_VIOLATION_ENABLED"],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-10T14:00:00Z"));
      t.directory(REFUSAL_ROSTER);
      t.as("location_manager", WEST_DODGE);
      t.manualAlsoHas?.([DRESS_CODE_CHUNK]);
      const reply = await t.thread().say("create a coaching form for Marnie Holloway, make it about not following the dress code");
      expect(reply.content, reply.content).toMatch(/Dress Code for The Company Policy, JBA Policy Manual p\.15/);
    },
  },
  {
    id: "nov10-not-following-dress-code-ca-policy",
    title: "\"create a CA for Marnie Holloway for not following the dress code on 10/14/26\": the card's Policy is the Dress Code",
    report: REPORT,
    status: { open: "the card names no policy (\"the applicable company policy\")" },
    fixFlags: ["NOT_FOLLOWING_IS_VIOLATION_ENABLED"],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-10T14:00:00Z"));
      t.directory(REFUSAL_ROSTER);
      t.as("location_manager", WEST_DODGE);
      t.manualAlsoHas?.([DRESS_CODE_CHUNK]);
      const reply = await t.thread().say("create a CA for Marnie Holloway for not following the dress code on 10/14/26");
      expect(reply.content, reply.content).toMatch(/\*\*Policy:\*\* Dress Code/);
    },
  },
];
