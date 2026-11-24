import { expect, vi } from "vitest";

import { WEST_DODGE, STAFF, type ReplayCase } from "./cases";

/**
 * ============================================================================
 * THE GOOGLE REVIEWS NOW HAVE L3, L6 AND YTD, AND THE AI ANSWERS FROM THEM (MANAGER REQUEST, 19 NOV 2026)
 * ============================================================================
 *
 * The manager's words (in the sibling app, ported with the page in #965): "per month pls last 3 mos last 6 mos and
 * YTD". The Google Reviews page gained a Month by month table with L3 (last 3 full months), L6 (last 6 full months) and
 * YTD per store; the chat block knew only the month to date and this week and last, so the assistant had no figure for
 * them. The invariants are on what the answering model was given: the table's own figures (the harness's
 * `readMonthlyProgress`: 2 qualifying reviews per store in each full month this year, 1 so far in Nov), with the
 * full-month windows named.
 */

const QUESTION = "How many Google reviews did we get per month, last 3 mos, last 6 mos and YTD?";
const FLAG = "GOOGLE_REVIEWS_IN_CHAT_ENABLED";

export const NOV19_GOOGLE_REVIEWS_L3_L6_YTD_CASES: ReplayCase[] = [
  {
    id: "nov19-google-reviews-l3-l6-ytd",
    title: `"${QUESTION}": the model is given L3, L6, YTD and each month per store from the Google Reviews page`,
    report: `Manager, 19 Nov 2026 (the Google Reviews page): "per month pls last 3 mos last 6 mos and YTD"; the assistant: "${QUESTION}"`,
    status: "fixed",
    fixFlags: [FLAG],
    async run(t) {
      vi.setSystemTime(new Date("2026-11-18T18:00:00Z"));
      t.directory(STAFF);
      t.as("location_manager", WEST_DODGE);
      await t.thread().say(QUESTION);
      const data = t.lastReportData?.() ?? "";
      expect(data).toContain("GOOGLE REVIEWS — L3, L6, YTD AND MONTH BY MONTH");
      expect(data).toContain("L3 = last 3 full months (Aug – Oct 2026)");
      expect(data).toContain("L6 = last 6 full months (May – Oct 2026)");
      expect(data).toContain("All 7 stores together (qualifying): L3 42, L6 84, YTD 147.");
      expect(data).toContain("- Omaha Dodge, NE (store 264, this manager's store): L3 6, L6 12, YTD 21.");
    },
  },
];
