// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/brand-mark", () => ({ BuffCitySoapLogo: () => null }));

import { goalContext, type GoalRow } from "@/lib/google-reviews/goals";
import type { StoreSummary } from "@/lib/google-reviews/views";
import type { ReviewsData } from "./load";
import { ReviewsDashboard } from "./reviews-dashboard";
import { lastSyncedStamp } from "./reviews-data";

afterEach(cleanup);

/**
 * THE PAGE SAYS WHEN ITS REVIEWS WERE LAST SAVED, IN CENTRAL TIME, AND WHICH
 * DAYS "THIS WEEK" COVERS (Paulyne, 16 Nov 2026: "say the week Monday-Sun (date)
 * then also mention when it was synced in CT").
 *
 * The stamp is the newest store sync that FINISHED (complete or incomplete): a
 * failed run saved nothing, so it must not make the page look fresh. Times are
 * stored in UTC and shown in Central, "CT" for both summer and winter.
 */
const store = (code: string, lastSyncAt: string | null, lastSyncStatus: StoreSummary["lastSyncStatus"]): StoreSummary =>
  ({ storeCode: code, displayName: `Store ${code}`, reviewCount: 100, averageRating: 4.5, ratings: [1, 2, 3, 4, 90], lastSyncAt, lastSyncStatus }) as StoreSummary;

const row = (code: string): GoalRow => ({
  storeCode: code,
  displayName: `Store ${code}`,
  monthlyTarget: 10,
  baselineReviewId: "b",
  baselineReviewTime: "2026-10-01T00:00:00Z",
  countFrom: null,
  qualifyingThisWeek: 1,
  qualifyingLastWeek: 2,
  qualifyingMonthToDate: 4,
  historical: 96,
});

const data = (stores: StoreSummary[]): ReviewsData => ({
  query: { store: null, rating: null, reply: null, from: null, to: null, removed: false, page: 1 },
  stores,
  trend: [],
  period: "month",
  page: null,
  goals: { context: goalContext("2026-10-14"), rows: stores.map((s) => row(s.storeCode)) },
  rank: "month",
});

describe("lastSyncedStamp", () => {
  it("shows the newest finished sync in Central time (winter: UTC-6)", () => {
    expect(lastSyncedStamp([store("219", "2026-11-16T10:29:53Z", "complete"), store("66", "2026-11-16T12:23:27Z", "complete")])).toBe("Nov 16, 6:23 AM CT");
  });

  it("converts summer time too (UTC-5), still printing CT", () => {
    expect(lastSyncedStamp([store("219", "2026-08-10T18:23:00Z", "complete")])).toBe("Aug 10, 1:23 PM CT");
  });

  it("counts an incomplete sync, which saved part of the reviews", () => {
    expect(lastSyncedStamp([store("219", "2026-11-16T12:23:27Z", "incomplete")])).toBe("Nov 16, 6:23 AM CT");
  });

  it("ignores a failed sync: it saved nothing, so it must not look fresh", () => {
    expect(
      lastSyncedStamp([store("219", "2026-11-16T12:23:27Z", "failed"), store("66", "2026-11-16T05:23:00Z", "complete")]),
    ).toBe("Nov 15, 11:23 PM CT");
  });

  it("is null when nothing has synced, so the page never invents a time", () => {
    expect(lastSyncedStamp([store("219", null, null), store("66", "2026-11-16T12:23:27Z", "failed")])).toBeNull();
    expect(lastSyncedStamp(null)).toBeNull();
  });
});

describe("the sync time and the week on the dashboard", () => {
  const stores = [store("219", "2026-11-16T12:23:27Z", "complete"), store("66", "2026-11-16T12:23:30Z", "complete")];

  it("Overview names the week Monday–Sunday with its dates, and says when the reviews were synced in CT", () => {
    render(<ReviewsDashboard tab="overview" status="connected" data={data(stores)} />);
    // goalContext("2026-10-14"): Wednesday, so the week is Mon Oct 12 – Sun Oct 18.
    expect(document.body.textContent).toMatch(/This week is\s*Monday–Sunday,\s*Oct 12 – Oct 18\s*\(Central\)/);
    expect(screen.getByTestId("reviews-last-synced").textContent).toBe("Reviews last synced from Google Nov 16, 6:23 AM CT · refreshes every hour.");
  });

  it("the leaderboard says it too", () => {
    render(<ReviewsDashboard tab="leaderboard" status="connected" data={data(stores)} />);
    expect(screen.getByTestId("reviews-last-synced").textContent).toContain("Nov 16, 6:23 AM CT");
  });

  it("shows no sync line when no sync has finished", () => {
    render(<ReviewsDashboard tab="overview" status="connected" data={data([store("219", null, null)])} />);
    expect(screen.queryByTestId("reviews-last-synced")).toBeNull();
  });
});
