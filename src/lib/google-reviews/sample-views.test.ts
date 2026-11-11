import { describe, expect, it } from "vitest";

import { APPROVED_GOOGLE_STORES } from "@/config/company/google-reviews";
import { buildGoogleReviewsSample } from "@/data/demo/google-reviews";
import { buildReportsSample } from "@/data/demo/reports";
import { demoRuntime } from "@/lib/demo/runtime";
import { demoReportScope, storeTotals } from "@/lib/reporting/demo-sample";

import { goalStatus } from "./goals";
import { sampleGoalData, sampleGoalDataForMonth, samplePeriodTrend, sampleReviewPage, sampleStatus, sampleStoreSummaries } from "./sample-views";
import { EMPTY_QUERY } from "./views";

/**
 * The demo build's Google Reviews and Reports samples: computed into the same
 * shapes the live reads return, so the real screens render populated.
 */
const NOW = new Date("2026-11-11T18:00:00Z");
const sample = buildGoogleReviewsSample(NOW);

describe("the Google Reviews demo sample", () => {
  it("is what the demo runtime hands over", async () => {
    expect(await demoRuntime.loadGoogleReviewsSample(NOW)).toEqual(sample);
  });

  it("summarises all seven approved stores, every one linked and holding reviews", () => {
    const stores = sampleStoreSummaries(sample);
    expect(stores.map((s) => s.storeCode)).toEqual(APPROVED_GOOGLE_STORES.map((s) => s.code));
    expect(stores.every((s) => s.reviewCount > 20 && s.averageRating !== null && s.lastSyncStatus === "complete")).toBe(true);
    expect(stores.every((s) => s.matchStatus === "matched" || s.matchStatus === "confirmed")).toBe(true);
    expect(sampleStatus(sample).blocker).toBeNull();
  });

  it("has a goal race in progress this month: some met or on pace, some behind", () => {
    const goals = sampleGoalData(sample, NOW);
    const statuses = goals.rows.map((row) => goalStatus(row, goals.context));
    expect(goals.rows).toHaveLength(7);
    expect(statuses).toContain("met");
    expect(statuses).toContain("on_pace");
    expect(statuses).toContain("behind_pace");
  });

  it("reads a closed month as a final result", () => {
    const october = sampleGoalDataForMonth(sample, "2026-10", NOW);
    expect(october.context.closed).toBe(true);
    expect(october.rows.some((row) => row.qualifyingMonthToDate > 0)).toBe(true);
  });

  it("filters and pages the review list the way the search function does", () => {
    const all = sampleReviewPage(sample, EMPTY_QUERY);
    expect(all.rows).toHaveLength(all.pageSize);
    expect(all.rows[0]!.createdAt >= all.rows[1]!.createdAt).toBe(true);
    const oneStar = sampleReviewPage(sample, { ...EMPTY_QUERY, store: "219", rating: 1, reply: null });
    expect(oneStar.rows.every((r) => r.storeCode === "219" && r.starRating === 1)).toBe(true);
    const unanswered = sampleReviewPage(sample, { ...EMPTY_QUERY, reply: "unanswered" });
    expect(unanswered.total).toBeGreaterThan(0);
    expect(unanswered.rows.every((r) => !r.hasReply)).toBe(true);
    expect(sampleReviewPage(sample, { ...EMPTY_QUERY, removed: true }).rows.every((r) => r.removedAt !== null)).toBe(true);
  });

  it("buckets the trend by month and by Monday week", () => {
    const months = samplePeriodTrend(sample, "month");
    expect(months.length).toBeGreaterThanOrEqual(24);
    expect(months.at(-1)!.start).toBe("2026-11-01");
    expect(samplePeriodTrend(sample, "week").every((p) => new Date(`${p.start}T12:00:00Z`).getUTCDay() === 1)).toBe(true);
  });
});

describe("the Reports demo sample", () => {
  const reports = buildReportsSample(NOW);

  it("scopes each demo account to a sensible set of stores", () => {
    const area = (primaryAreaId: string, level: "region" | "district" | "location") => demoReportScope(reports, { level, primaryAreaId, alsoCoversAreaIds: [] });
    expect(demoReportScope(reports, { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] }).locationIds).toHaveLength(7);
    expect(area("reg-demo", "region").locationIds).toHaveLength(7);
    expect(area("dist-demo", "district").locationIds).toHaveLength(4);
    expect(area("loc-demo-1", "location").locationIds).toEqual(["loc-264"]);
    expect(area("loc-unknown", "location").locationIds).toEqual([]);
  });

  it("ends on the week that closed last Sunday", () => {
    expect(reports.periodEnd).toBe("2026-11-08");
    const totals = storeTotals(reports, ["loc-264"], 4);
    expect(totals).toHaveLength(1);
    expect(totals[0]!.netSales).toBeGreaterThan(0);
  });
});
