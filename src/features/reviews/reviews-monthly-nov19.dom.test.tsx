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

import type { GoalRow } from "@/lib/google-reviews/goals";
import { monthlyProgress, progressMonths } from "@/lib/google-reviews/monthly-progress";

import { MonthlyTable } from "./reviews-monthly";

/**
 * MANAGER REQUEST (ported from Ask Sunny), Nov 19 2026: "I'd like to see an
 * option to pull the last three full months so we can get a broader overall
 * understanding and see progress." Then: "yeah per month pls last 3 mos last
 * 6 mos and YTD".
 */
afterEach(cleanup);

const TODAY = "2026-11-19";

const row = (storeCode: string, displayName: string, monthToDate: number, counting = true): GoalRow => ({
  storeCode,
  displayName,
  monthlyTarget: 5,
  baselineReviewId: counting ? "baseline" : null,
  baselineReviewTime: null,
  countFrom: null,
  qualifyingThisWeek: 0,
  qualifyingLastWeek: 0,
  qualifyingMonthToDate: monthToDate,
  historical: 0,
});

/** Store A gets `n` in month index n; store B 1 a month; store C is not counting. */
function sample() {
  return progressMonths(TODAY).map((month, i) => ({
    month,
    rows: [row("A", "Maple Row", i), row("B", "Cedar Point", 1), row("C", "Birch Hill", 2, false)],
  }));
}

describe("per month, L3, L6 and YTD", () => {
  it("shows every month from January (or six back, if earlier) through this one", () => {
    expect(progressMonths(TODAY)).toEqual([
      "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06",
      "2026-07", "2026-08", "2026-09", "2026-10", "2026-11",
    ]);
    expect(progressMonths("2027-02-03")).toEqual([
      "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02",
    ]);
  });

  it("L3 and L6 are full months; YTD includes this month to date", () => {
    const progress = monthlyProgress(sample(), TODAY);
    expect(progress.l3Months).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(progress.l6Months).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    const a = progress.rows.find((r) => r.storeCode === "A")!;
    // Jan=0 … Oct=9, Nov=10.
    expect([a.l3, a.l6, a.ytd]).toEqual([7 + 8 + 9, 4 + 5 + 6 + 7 + 8 + 9, 55]);
  });

  it("draws the table with totals that open the reviews from those dates", () => {
    render(<MonthlyTable monthly={monthlyProgress(sample(), TODAY)} store={null} today={TODAY} />);
    const table = screen.getByRole("table", { name: "Qualifying reviews by month" });
    const headers = within(table).getAllByRole("columnheader").map((th) => th.textContent);
    expect(headers[1]).toBe("Jan 2026");
    expect(headers.slice(-3)).toEqual(["L3Aug – Oct 2026", "L6May – Oct 2026", "YTDJan – Nov 2026, to date"]);

    const maple = within(table).getByRole("row", { name: /Maple Row/ });
    const links = within(maple).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["24", "39", "55"]);
    expect(links[0]!.getAttribute("href")).toBe("/reviews?tab=reviews&store=A&from=2026-08-01&to=2026-10-31");
    expect(links[2]!.getAttribute("href")).toBe("/reviews?tab=reviews&store=A&from=2026-01-01&to=2026-11-19");

    // A store not counting shows the reviews posted each month (none posted here), marked as before counting.
    const birch = within(table).getByRole("row", { name: /Birch Hill/ });
    expect(within(birch).getAllByRole("link").map((l) => l.textContent)).toEqual(["0", "0", "0"]);
    expect(within(birch).getAllByTitle(/before the store started counting/)).toHaveLength(11);
    const footer = within(table).getByRole("row", { name: /All stores shown/ });
    expect(within(footer).getAllByRole("link").map((l) => l.textContent)).toEqual(["27", "45", "66"]);
  });

  it("follows the location filter", () => {
    render(<MonthlyTable monthly={monthlyProgress(sample(), TODAY)} store="B" today={TODAY} />);
    expect(screen.queryByRole("row", { name: /Maple Row/ })).toBeNull();
    expect(screen.getByRole("row", { name: /Cedar Point/ })).toBeTruthy();
  });
});

/**
 * Nov 19 2026, on the month-by-month table: "cant we fix this? its 0". Every
 * month before October read 0 because the goal rule counts nothing before a
 * store's "Counting since" day, although the reviews are held. Those months now
 * show the 3–5★ reviews posted that month.
 */
describe("months before a store started counting", () => {
  const counting = (since: string, monthToDate: number): GoalRow => ({
    ...row("A", "Maple Row", monthToDate),
    baselineReviewId: null,
    countFrom: since,
  });

  it("show reviews posted that month instead of 0, and the goal count from the first full counted month", () => {
    // Counting since Oct 1 (Central midnight): October on is the goal count.
    const perMonth = progressMonths(TODAY).map((month) => ({
      month,
      rows: [counting("2026-10-01T05:00:00Z", month >= "2026-10" ? 12 : 0)],
    }));
    const posted = new Map([["A", new Map([["2026-03", 4], ["2026-08", 6], ["2026-09", 5], ["2026-10", 99]])]]);
    const a = monthlyProgress(perMonth, TODAY, posted).rows[0]!;
    expect(a.months).toEqual([0, 0, 4, 0, 0, 0, 0, 6, 5, 12, 12]);
    expect(a.beforeCounting.filter(Boolean)).toHaveLength(9);
    expect([a.l3, a.l6, a.ytd]).toEqual([6 + 5 + 12, 6 + 5 + 12, 4 + 6 + 5 + 12 + 12]);
  });

  it("a store that started counting mid-month shows that month as posted too", () => {
    const perMonth = progressMonths(TODAY).map((month) => ({
      month,
      rows: [counting("2026-10-15T05:00:00Z", 3)],
    }));
    const posted = new Map([["A", new Map([["2026-10", 7]])]]);
    const a = monthlyProgress(perMonth, TODAY, posted).rows[0]!;
    expect(a.months.slice(-2)).toEqual([7, 3]);
    expect(a.beforeCounting.slice(-2)).toEqual([true, false]);
  });
});
