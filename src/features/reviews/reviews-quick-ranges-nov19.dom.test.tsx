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

import { lastFullMonths, quickRanges } from "@/lib/google-reviews/quick-ranges";
import { EMPTY_QUERY } from "@/lib/google-reviews/views";

import type { ReviewsData } from "./load";
import { LiveFilters } from "./reviews-data";

/**
 * MANAGER REQUEST (ported from Ask Sunny), Nov 19 2026, in their words:
 *
 *   "Are we only able to see the Google reviews in a one week period of time or
 *    month to date? I might've missed it, but that's all i see. I'd like to see
 *    an option to pull the last three full months so we can get a broader
 *    overall understanding and see progress."
 *
 * And the reply that set the scope: "we can certainly add L3, L6, or even YTD
 * reviews." (L3 / L6 = last 3 / last 6 months.)
 */
afterEach(cleanup);

// Nov 19 2026, midday Central.
const NOW = new Date("2026-11-19T18:00:00Z");

describe("L3, L6 and YTD ranges", () => {
  it("L3 and L6 are FULL months: the current, partial month is left out", () => {
    expect(lastFullMonths(3, "2026-11-19")).toEqual({ from: "2026-08-01", to: "2026-10-31" });
    expect(lastFullMonths(6, "2026-11-19")).toEqual({ from: "2026-05-01", to: "2026-10-31" });
    expect(lastFullMonths(3, "2027-02-03")).toEqual({ from: "2026-11-01", to: "2027-01-31" });
  });

  it("YTD runs from Jan 1 through today", () => {
    const ytd = quickRanges(NOW).find((r) => r.key === "ytd")!;
    expect([ytd.from, ytd.to]).toEqual(["2026-01-01", "2026-11-19"]);
  });

  it("the Reviews view offers them as links that keep the other filters", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const data = {
      query: { ...EMPTY_QUERY, rating: 5, from: "2026-08-01", to: "2026-10-31" },
      stores: [],
      trend: [],
      period: "month",
      page: null,
      goals: null,
      rank: "month",
    } as unknown as ReviewsData;
    render(<LiveFilters tab="reviews" data={data} />);

    const l3 = screen.getByRole("link", { name: /Last 3 full months \(Aug 2026 – Oct 2026\)/ });
    expect(l3.textContent).toBe("L3");
    expect(l3.getAttribute("href")).toBe("/reviews?tab=reviews&rating=5&from=2026-08-01&to=2026-10-31");
    expect(l3.getAttribute("aria-current")).toBe("true");

    const l6 = screen.getByRole("link", { name: /Last 6 full months/ });
    expect(l6.getAttribute("href")).toContain("from=2026-05-01&to=2026-10-31");
    expect(l6.getAttribute("aria-current")).toBeNull();

    expect(screen.getByRole("link", { name: /Year to date/ }).getAttribute("href")).toContain(
      "from=2026-01-01&to=2026-11-19",
    );
    vi.useRealTimers();
  });
});
