import { describe, expect, it, vi } from "vitest";

import { APPROVED_GOOGLE_STORES } from "@/config/company/google-reviews";
import { goalContext, type GoalRow } from "@/lib/google-reviews/goals";
import { monthlyProgress, progressMonths } from "@/lib/google-reviews/monthly-progress";

import { asksForMonthlyPeriods, isGoogleReviewQuestion, MONTHS_HEADING } from "./google-reviews-chat";
import { loadGoogleReviewsChatBlock } from "./google-reviews-chat-read";

/**
 * ============================================================================
 * MANAGER REQUEST (SIBLING APP), 19 NOV 2026: THE AI KNOWS THE GOOGLE REVIEWS NOW HAVE L3, L6 AND YTD
 * ============================================================================
 *
 * Their words: "per month pls last 3 mos last 6 mos and YTD". The Google Reviews page gained a Month by month table
 * with L3, L6 and YTD per store; the chat and the L10 assistant's read_reviews only knew month to date and this week
 * and last, so asking the assistant for them got "no figures". Both now read the table's own figures.
 */
const TODAY = "2026-11-19";
const QUESTION = "per month pls last 3 mos last 6 mos and YTD";
const GOOGLE_QUESTION = "How many Google reviews did Lee's Summit get last 3 mos, last 6 mos and YTD?";

vi.mock("@/lib/config/server-env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/config/server-env")>()),
  supabaseReadiness: () => ({ ready: true, missing: [] }),
}));

function row(code: string, qualifying: number): GoalRow {
  const store = APPROVED_GOOGLE_STORES.find((entry) => entry.code === code)!;
  return {
    storeCode: code,
    displayName: store.displayName,
    monthlyTarget: 10,
    baselineReviewId: `baseline-${code}`,
    baselineReviewTime: "2025-12-01T06:00:00.000Z",
    countFrom: null,
    qualifyingThisWeek: 1,
    qualifyingLastWeek: 1,
    qualifyingMonthToDate: qualifying,
    historical: 0,
  };
}

/** Lee's Summit (219): 2 qualifying in every full month, 4 so far in November. L3 = 6, L6 = 12, YTD = 24. */
const progress = monthlyProgress(
  progressMonths(TODAY).map((month) => ({
    month,
    rows: APPROVED_GOOGLE_STORES.map((store) => row(store.code, month === "2026-11" ? 4 : 2)),
  })),
  TODAY,
);

vi.mock("@/lib/google-reviews/views", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/google-reviews/views")>()),
  readGoalData: async () => ({ context: goalContext(TODAY), rows: APPROVED_GOOGLE_STORES.map((store) => row(store.code, 4)) }),
  readStoreSummaries: async () => [],
  readPeriodTrend: async () => [],
  readReviewPage: async () => ({ total: 0, page: 1, pageSize: 20, rows: [] }),
  readMonthlyProgress: async () => progress,
}));

describe("the AI knows the Google reviews have L3, L6 and YTD", () => {
  it("their wording, and L3 / L6 / YTD questions, are Google review questions asking for months", () => {
    expect(asksForMonthlyPeriods(QUESTION)).toBe(true);
    for (const q of [GOOGLE_QUESTION, "What are our Google reviews YTD?", "google reviews L3", "reviews for the last six months", "reviews year to date"]) {
      expect(isGoogleReviewQuestion(q), q).toBe(true);
      expect(asksForMonthlyPeriods(q), q).toBe(true);
    }
    expect(asksForMonthlyPeriods("How many Google reviews did we get this week?")).toBe(false);
    expect(isGoogleReviewQuestion("Write a coaching form for Jane, her reviews YTD are low")).toBe(false);
  });

  it("the chat block carries L3, L6 and YTD per store, as full months, from the table's own figures", async () => {
    const block = await loadGoogleReviewsChatBlock({ question: GOOGLE_QUESTION, role: "owner", scope: null, now: new Date(`${TODAY}T18:00:00Z`) });
    expect(block?.text).toContain(MONTHS_HEADING);
    expect(block?.text).toContain("L3 = last 3 full months (Aug – Oct 2026)");
    expect(block?.text).toContain("L6 = last 6 full months (May – Oct 2026)");
    expect(block?.text).toMatch(/\(store 219\): L3 6, L6 12, YTD 24\./);
  });

  it("a question that does not ask for those periods does not pay for the month-by-month read", async () => {
    const block = await loadGoogleReviewsChatBlock({ question: "How many Google reviews did we get this week?", role: "owner", scope: null });
    expect(block?.text).not.toContain(MONTHS_HEADING);
  });
});
