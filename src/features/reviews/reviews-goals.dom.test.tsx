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

import { closedMonthContext, goalContext, type GoalRow } from "@/lib/google-reviews/goals";
import type { StoreSummary } from "@/lib/google-reviews/views";
import type { ReviewsData } from "./load";
import { ReviewsDashboard } from "./reviews-dashboard";

afterEach(cleanup);

const store = (code: string): StoreSummary =>
  ({ storeCode: code, displayName: `Store ${code}`, reviewCount: 100, averageRating: 4.5, ratings: [1, 2, 3, 4, 90] }) as StoreSummary;
const goalRow = (code: string, over: Partial<GoalRow> = {}): GoalRow => ({
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
  ...over,
});
const data = (rows: GoalRow[], rank: "month" | "week" = "month", period: "month" | "week" = "month"): ReviewsData => ({
  query: { store: null, rating: null, reply: null, from: null, to: null, removed: false, page: 1 },
  stores: rows.map((r) => store(r.storeCode)),
  trend:
    period === "week"
      ? [
          { start: "2026-10-05", reviewCount: 7, qualifyingCount: 6, averageRating: 4.6 },
          { start: "2026-10-12", reviewCount: 3, qualifyingCount: 3, averageRating: 5 },
        ]
      : [
          { start: "2026-09-01", reviewCount: 30, qualifyingCount: 27, averageRating: 4.7 },
          { start: "2026-10-01", reviewCount: 21, qualifyingCount: 21, averageRating: 4.9 },
        ],
  period,
  page: null,
  goals: { context: goalContext("2026-10-14"), rows },
  rank,
});

describe("goal tracking on the dashboard", () => {
  it("shows real goal figures, per-store rows and a ranked leaderboard once baselines exist", () => {
    const d = data([goalRow("219", { qualifyingMonthToDate: 12, qualifyingThisWeek: 3 }), goalRow("225"), goalRow("236", { baselineReviewId: null, baselineReviewTime: null })]);
    const { unmount } = render(<ReviewsDashboard tab="overview" status="not_connected" data={d} />);
    const table = screen.getByRole("table", { name: "Store goal progress" });
    expect(within(table).getByText("Store 219")).toBeTruthy();
    expect(within(table).getByText("Goal met")).toBeTruthy();
    expect(within(table).getByText("Not counting")).toBeTruthy();
    expect(screen.getByText("16")).toBeTruthy(); // month to date across the two counting stores
    expect(screen.getByText("1 of 2")).toBeTruthy(); // stores at goal
    expect(screen.getByText("Districts not configured yet")).toBeTruthy();
    unmount();

    render(<ReviewsDashboard tab="leaderboard" status="not_connected" data={d} />);
    const items = screen.getAllByRole("listitem").filter((li) => li.textContent?.includes("Store 2"));
    expect(items[0]!.textContent).toContain("Store 219");
    expect(items[0]!.textContent).toContain("1");
  });

  it("labels a part-way baseline as a partial month, with the dates, instead of a pace verdict", () => {
    const d = data([goalRow("219", { baselineReviewTime: "2026-10-10T18:40:49Z", qualifyingMonthToDate: 2 }), goalRow("225", { baselineReviewTime: "2026-10-12T19:26:49Z", qualifyingMonthToDate: 12 })]);
    render(<ReviewsDashboard tab="overview" status="not_connected" data={d} />);
    const table = screen.getByRole("table", { name: "Store goal progress" });
    expect(within(table).getByText("Partial month")).toBeTruthy();
    expect(within(table).getByText("Goal met")).toBeTruthy();
    expect(within(table).queryByText("Behind pace")).toBeNull();
    expect(within(table).getByText(/Counting since Oct 10 · partial month/)).toBeTruthy();
    expect(screen.getByText(/Partial month: counting for 2 stores began Oct 10–Oct 12/)).toBeTruthy();
  });

  it("says the goal is not configured, and prints no figure, while no store has a baseline", () => {
    render(<ReviewsDashboard tab="overview" status="not_connected" data={data([goalRow("219", { baselineReviewId: null, baselineReviewTime: null })])} />);
    expect(screen.getAllByText("Goal not configured yet").length).toBeGreaterThan(0);
    expect(screen.queryByRole("table", { name: "Store goal progress" })?.querySelector("tbody")).toBeNull();
  });

  it("shows Monday–Sunday week and calendar-month ranges on the cards", () => {
    render(<ReviewsDashboard tab="overview" status="not_connected" data={data([goalRow("219", { baselineReviewTime: "2026-09-20T00:00:00Z" })])} />);
    expect(screen.getByText(/This week · Oct 12 – Oct 18/)).toBeTruthy();
    expect(screen.getAllByText(/Month to date · Oct 1 – Oct 31/).length).toBeGreaterThan(0);
    expect(screen.getByText(/last week \(Oct 5 – Oct 11\)/)).toBeTruthy();
    expect(screen.queryByText(/Sunday–Saturday/)).toBeNull();
  });
});

describe("the Weekly / Monthly toggle", () => {
  it("defaults to monthly aggregates, and links to weekly", () => {
    render(<ReviewsDashboard tab="overview" status="not_connected" data={data([goalRow("219")])} />);
    expect(screen.getByRole("table", { name: "Google Reviews by month" })).toBeTruthy();
    const group = screen.getByRole("group", { name: "Chart period" });
    expect(within(group).getByText("Monthly").getAttribute("aria-current")).toBe("true");
    expect(within(group).getByText("Weekly").getAttribute("href")).toBe("/reviews?period=week");
  });

  it("shows Monday–Sunday weekly aggregates when weekly is chosen, and links back to monthly", () => {
    render(<ReviewsDashboard tab="overview" status="not_connected" data={data([goalRow("219")], "month", "week")} />);
    const table = screen.getByRole("table", { name: "Google Reviews by week" });
    expect(within(table).getByText("Oct 12 – Oct 18, 2026")).toBeTruthy();
    expect(within(table).getByText("Oct 5 – Oct 11, 2026")).toBeTruthy();
    const group = screen.getByRole("group", { name: "Chart period" });
    expect(within(group).getByText("Weekly").getAttribute("aria-current")).toBe("true");
    expect(within(group).getByText("Monthly").getAttribute("href")).toBe("/reviews");
  });

  it("keeps all reviews, 3–5★ reviews and the goal-eligible marker distinct in the trend", () => {
    const cutoffRow = goalRow("219", { countFrom: "2026-10-01T05:00:00Z", baselineReviewTime: "2026-10-13T21:00:00Z" });
    const week = { ...data([cutoffRow], "month", "week"), trend: [
      { start: "2026-09-21", reviewCount: 9, qualifyingCount: 8, averageRating: 4.5 },
      { start: "2026-09-28", reviewCount: 6, qualifyingCount: 5, averageRating: 4.6 },
      { start: "2026-10-05", reviewCount: 7, qualifyingCount: 6, averageRating: 4.6 },
    ] };
    const { unmount } = render(<ReviewsDashboard tab="overview" status="not_connected" data={week} />);
    const table = screen.getByRole("table", { name: "Google Reviews by week" });
    expect(within(table).getByText("All reviews")).toBeTruthy();
    expect(within(table).getByText("3–5★ reviews")).toBeTruthy();
    expect(within(table).getByText("Before goal counting")).toBeTruthy(); // Sep 21–27
    expect(within(table).getByText("Counting from Oct 1")).toBeTruthy(); // Sep 28 – Oct 4 contains the cutoff
    expect(within(table).getByText("Goal-eligible (3–5★)")).toBeTruthy(); // Oct 5–11
    expect(screen.getByText(/is only the rating range and is not the goal count/)).toBeTruthy();
    unmount();

    const month = { ...data([cutoffRow]), trend: [
      { start: "2026-09-01", reviewCount: 30, qualifyingCount: 27, averageRating: 4.7 },
      { start: "2026-10-01", reviewCount: 21, qualifyingCount: 21, averageRating: 4.9 },
    ] };
    render(<ReviewsDashboard tab="overview" status="not_connected" data={month} />);
    const m = screen.getByRole("table", { name: "Google Reviews by month" });
    expect(within(m).getByText("Before goal counting")).toBeTruthy(); // September
    expect(within(m).getByText("Goal-eligible (3–5★)")).toBeTruthy(); // October starts on the cutoff day
  });
});

describe("progress bar colours", () => {
  const rows = [
    goalRow("1", { qualifyingMonthToDate: 10 }),
    goalRow("2", { qualifyingMonthToDate: 5 }),
    goalRow("3", { qualifyingMonthToDate: 0 }),
    goalRow("4", { baselineReviewId: null, baselineReviewTime: null }),
  ];
  const d = { ...data(rows), goals: { context: goalContext("2026-10-15"), rows } };
  const tones = () =>
    Object.fromEntries(
      screen.getAllByRole("progressbar").map((bar) => [bar.getAttribute("aria-label")!.split(":")[0], bar.getAttribute("data-tone")]),
    );

  it("draws green met, amber on pace, red behind pace; a store with no baseline gets no progress bar", () => {
    render(<ReviewsDashboard tab="overview" status="not_connected" data={d} />);
    expect(tones()).toEqual({ "Store 1 #1": "met", "Store 2 #2": "pace", "Store 3 #3": "behind" });
    const table = screen.getByRole("table", { name: "Store goal progress" });
    expect(within(table).getByText("Not tracking")).toBeTruthy();
    expect(within(table).getByText("Behind pace").getAttribute("data-tone")).toBe("behind");
  });

  it("a red bar stays red at zero progress (its track is red-tinted, not neutral)", () => {
    render(<ReviewsDashboard tab="overview" status="not_connected" data={d} />);
    const red = screen.getAllByRole("progressbar").find((b) => b.getAttribute("data-tone") === "behind")!;
    expect(red.className).toContain("bg-tone-behind-soft");
    expect(red.querySelector('[data-testid="meter-fill"]')!.className).toContain("bg-tone-behind");
  });

  it("filters the leaderboard by status and search without changing anyone's rank", () => {
    const filtered = { ...d, goalFilter: { q: "", status: "behind" as const } };
    render(<ReviewsDashboard tab="leaderboard" status="not_connected" data={filtered} />);
    const list = screen.getAllByRole("listitem").filter((li) => li.textContent?.includes("Store "));
    expect(list).toHaveLength(1);
    expect(list[0]!.textContent).toContain("Store 3");
    expect(list[0]!.textContent).toContain("3"); // still ranked 3rd of the counting stores
  });

  it("shows an empty state when nothing matches", () => {
    render(<ReviewsDashboard tab="leaderboard" status="not_connected" data={{ ...d, goalFilter: { q: "zzz", status: null } }} />);
    expect(screen.getByText("No stores match these filters")).toBeTruthy();
  });
});

describe("monthly goal eligibility per store start date", () => {
  it("marks a month partial when stores start counting on different days", () => {
    const rows = [goalRow("1", { baselineReviewTime: "2026-10-01T05:00:00Z" }), goalRow("2", { baselineReviewTime: "2026-10-09T05:00:00Z" })];
    render(<ReviewsDashboard tab="overview" status="not_connected" data={data(rows)} />);
    const m = screen.getByRole("table", { name: "Google Reviews by month" });
    expect(within(m).getByText("Before goal counting")).toBeTruthy();
    expect(within(m).getByText("Counting from Oct 1–Oct 9")).toBeTruthy();
  });
});

describe("the leaderboard month picker", () => {
  const early = { baselineReviewTime: "2026-08-01T00:00:00Z" };
  const rows = [goalRow("1", { ...early, qualifyingMonthToDate: 10 }), goalRow("2", { ...early, qualifyingMonthToDate: 4 }), goalRow("3", { baselineReviewTime: "2026-10-01T05:00:00Z", qualifyingMonthToDate: 0 })];

  it("offers the current month and twelve before it, and keeps the chosen month selected", () => {
    const d = { ...data(rows), month: "2026-09", goals: { context: closedMonthContext("2026-09"), rows } };
    render(<ReviewsDashboard tab="leaderboard" status="not_connected" data={d} />);
    const select = screen.getByRole("combobox", { name: "Month" }) as HTMLSelectElement;
    expect(select.options).toHaveLength(13);
    expect(select.options[0]!.textContent).toMatch(/\(current\)/);
    expect(select.value).toBe("2026-09");
  });

  it("shows a closed month as a final result: met / missed / not counted, with no pace mark and no weekly figures", () => {
    const d = { ...data(rows), month: "2026-09", goals: { context: closedMonthContext("2026-09"), rows } };
    render(<ReviewsDashboard tab="leaderboard" status="not_connected" data={d} />);
    expect(screen.getByText(/September 2026 · month closed/)).toBeTruthy();
    const board = within(document.querySelector("ol")!);
    expect(board.getAllByText("Goal met").length).toBeGreaterThan(0);
    expect(board.getByText("Goal missed")).toBeTruthy();
    expect(board.getByText("Before counting")).toBeTruthy();
    expect(board.queryByText("Behind pace")).toBeNull();
    expect(board.queryByText("On pace")).toBeNull();
    expect(screen.getByText("Rank by this week").getAttribute("aria-disabled")).toBe("true");
    const tones = screen.getAllByRole("progressbar").map((b) => b.getAttribute("data-tone"));
    expect(tones).toEqual(["met", "behind"]); // the not-counted store draws no bar
  });
});
