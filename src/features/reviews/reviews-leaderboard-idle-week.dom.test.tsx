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

afterEach(cleanup);

/**
 * "LEADERBOARD 1 TIED" (Paulyne, 16 Nov 2026, a Monday morning): ranked by THIS
 * WEEK, every store sat at +0, so every row read "1 TIED" while the month column
 * ran 11, 7, 7, 6, 3, 2, 0. The counts were right; the ranking said nothing.
 * Decision: keep the week ranking, and when no store has a qualifying review yet
 * this week say so and rank nobody. The month view is unchanged.
 */
const store = (code: string): StoreSummary =>
  ({ storeCode: code, displayName: `Store ${code}`, reviewCount: 100, averageRating: 4.5, ratings: [1, 2, 3, 4, 90] }) as StoreSummary;

const row = (code: string, week: number, month: number): GoalRow => ({
  storeCode: code,
  displayName: `Store ${code}`,
  monthlyTarget: 10,
  baselineReviewId: "b",
  baselineReviewTime: "2026-10-01T00:00:00Z",
  countFrom: null,
  qualifyingThisWeek: week,
  qualifyingLastWeek: 2,
  qualifyingMonthToDate: month,
  historical: 96,
});

const data = (rows: GoalRow[], rank: "month" | "week"): ReviewsData => ({
  query: { store: null, rating: null, reply: null, from: null, to: null, removed: false, page: 1 },
  stores: rows.map((r) => store(r.storeCode)),
  trend: [],
  period: "month",
  page: null,
  goals: { context: goalContext("2026-11-16"), rows },
  rank,
});

const IDLE = [row("66", 0, 11), row("67", 0, 7), row("236", 0, 7), row("264", 0, 6), row("338", 0, 3), row("219", 0, 2), row("225", 0, 0)];

describe("the leaderboard on a week with no reviews yet", () => {
  it("ranked by this week, says so and ranks nobody instead of '1 TIED' on every row", () => {
    render(<ReviewsDashboard tab="leaderboard" status="connected" data={data(IDLE, "week")} />);
    expect(screen.getByTestId("leaderboard-idle-week").textContent).toContain("No reviews yet this week");
    expect(screen.queryAllByText("Tied")).toHaveLength(0);
    // The order is still the month-to-date tie-break: Store 66 (11) comes before Store 225 (0).
    const board = document.querySelector("ol")?.textContent ?? "";
    expect(board.indexOf("Store 66")).toBeGreaterThan(-1);
    expect(board.indexOf("Store 66")).toBeLessThan(board.indexOf("Store 225"));
  });

  it("ranked by this month, the same data is ranked 1, 2 (tied), 2, 4 ... as before", () => {
    render(<ReviewsDashboard tab="leaderboard" status="connected" data={data(IDLE, "month")} />);
    expect(screen.queryByTestId("leaderboard-idle-week")).toBeNull();
    expect(screen.getAllByText("Tied")).toHaveLength(2); // Stores 67 and 236 share second place
  });

  it("ranks normally once any store has a review this week", () => {
    const some = [row("66", 1, 11), ...IDLE.slice(1)];
    render(<ReviewsDashboard tab="leaderboard" status="connected" data={data(some, "week")} />);
    expect(screen.queryByTestId("leaderboard-idle-week")).toBeNull();
  });
});
