// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
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

const store = (code: string): StoreSummary =>
  ({ storeCode: code, displayName: `Salon ${code}`, reviewCount: 100, averageRating: 4.5, ratings: [1, 2, 3, 4, 90] }) as StoreSummary;
const goalRow = (code: string, over: Partial<GoalRow> = {}): GoalRow => ({
  storeCode: code,
  displayName: `Salon ${code}`,
  monthlyTarget: 10,
  baselineReviewId: "b",
  baselineReviewTime: "2026-10-01T00:00:00Z",
  qualifyingThisWeek: 1,
  qualifyingLastWeek: 2,
  qualifyingMonthToDate: 4,
  historical: 96,
  ...over,
});
const data = (rows: GoalRow[], rank: "month" | "week" = "month"): ReviewsData => ({
  query: { store: null, rating: null, reply: null, from: null, to: null, removed: false, page: 1 },
  stores: rows.map((r) => store(r.storeCode)),
  trend: [],
  page: null,
  goals: { context: goalContext("2026-10-14"), rows },
  rank,
});

describe("goal tracking on the dashboard", () => {
  it("shows real goal figures, per-salon rows and a ranked leaderboard once baselines exist", () => {
    const d = data([goalRow("219", { qualifyingMonthToDate: 12, qualifyingThisWeek: 3 }), goalRow("225"), goalRow("236", { baselineReviewId: null, baselineReviewTime: null })]);
    const { unmount } = render(<ReviewsDashboard tab="overview" status="not_connected" data={d} />);
    const table = screen.getByRole("table", { name: "Salon goal progress" });
    expect(within(table).getByText("Salon 219")).toBeTruthy();
    expect(within(table).getByText("Goal met")).toBeTruthy();
    expect(within(table).getByText("Not counting")).toBeTruthy();
    expect(screen.getByText("16")).toBeTruthy(); // month to date across the two counting salons
    expect(screen.getByText("1 of 2")).toBeTruthy(); // salons at goal
    expect(screen.getByText("Districts not configured yet")).toBeTruthy();
    unmount();

    render(<ReviewsDashboard tab="leaderboard" status="not_connected" data={d} />);
    const items = screen.getAllByRole("listitem").filter((li) => li.textContent?.includes("Salon 2"));
    expect(items[0]!.textContent).toContain("Salon 219");
    expect(items[0]!.textContent).toContain("1");
  });

  it("says the goal is not configured, and prints no figure, while no salon has a baseline", () => {
    render(<ReviewsDashboard tab="overview" status="not_connected" data={data([goalRow("219", { baselineReviewId: null, baselineReviewTime: null })])} />);
    expect(screen.getAllByText("Goal not configured yet").length).toBeGreaterThan(0);
    expect(screen.queryByRole("table", { name: "Salon goal progress" })?.querySelector("tbody")).toBeNull();
  });
});
