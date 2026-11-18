import { expect, vi } from "vitest";

import { WEST_DODGE, STAFF, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * "HOW MANY GOOGLE REVIEWS DID WE GET THIS WEEK?" IS ANSWERED FROM THE GOOGLE REVIEWS PAGE (GOOGLE_REVIEWS_IN_CHAT_ENABLED)
 * ============================================================================
 *
 * QA, 18 Nov 2026, production, the main chat: the question got "I don't have report figures like review counts",
 * while the Google Reviews page (synced hourly, Monday–Sunday weeks in Central time) has the figures and the L10
 * meeting assistant reads them. With production's flags the review block is not read, so the prompt says "You have NO
 * report figures for this question", which the reply repeats. With GOOGLE_REVIEWS_IN_CHAT_ENABLED on, the answering
 * model is given this week and last week for every store the page shows, and is told never to say it has no figures.
 *
 * The invariant is on what the answering model was given (REPORT DATA and its report-figure rule), not on its words.
 * The page's reads are the harness's fixed figures (`replay-pack-e2e.test.ts`): 7 stores, 2 reviews each this week.
 */

const QUESTION = "How many Google reviews did we get this week?";
const FLAG = "GOOGLE_REVIEWS_IN_CHAT_ENABLED";
const REPORT = `QA, 18 Nov 2026 (production, main chat): "${QUESTION}" answered "I don't have report figures like review counts"`;

export const NOV18_GOOGLE_REVIEWS_THIS_WEEK_CASES: ReplayCase[] = [
  {
    id: "nov18-google-reviews-this-week",
    title: `"${QUESTION}": the model is given this week's and last week's reviews from the Google Reviews page, and no "no report figures" rule`,
    report: REPORT,
    status: { open: `${FLAG} is not on in production: set it to 1 in Vercel, then list it in production-flags.json and mark this case fixed` },
    fixFlags: [FLAG],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-18T18:00:00Z"));
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      await t.thread().say(QUESTION);
      const system = t.lastSystem?.() ?? "";
      const data = t.lastReportData?.() ?? "";
      expect(system, "the prompt told the model it has no report figures").not.toContain("You have NO report figures for this question");
      expect(data).toContain("GOOGLE REVIEWS — THIS WEEK AND LAST WEEK");
      expect(data).toContain("This week: Mon, Nov 16 – Sun, Nov 22");
      expect(data).toContain("All 7 stores together: this week 14 reviews (14 qualifying), average 5.0 stars; last week 28 reviews (21 qualifying), average 4.5 stars.");
      expect(data).toContain("- Omaha Dodge, NE (store 264, this manager's store): this week 2 reviews");
      expect(data).toContain("Never say you have no Google review figures");
    },
  },
];
