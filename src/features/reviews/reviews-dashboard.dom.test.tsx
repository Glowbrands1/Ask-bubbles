// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/brand-mark", () => ({ BuffCitySoapLogo: () => null }));

import { resolveReviewsIntegrationStatus } from "./integration-status";
import { ReviewsDashboard } from "./reviews-dashboard";
import { REVIEW_TABS, parseReviewsTab, type ReviewsTab } from "./reviews-tabs";

/**
 * AN UNCONNECTED INTEGRATION IS NOT A CONNECTED ONE WITH ZERO REVIEWS.
 * Every view must keep its layout, say "Not connected yet" where data belongs,
 * and print no figure, name or rank.
 */
afterEach(cleanup);

const TABS = REVIEW_TABS.map((tab) => tab.key);

function view(tab: ReviewsTab) {
  return render(
    <ReviewsDashboard tab={tab} status={resolveReviewsIntegrationStatus()} />,
  );
}

describe("the Google Reviews dashboard with nothing connected", () => {
  it("resolves to not_connected and reads nothing", () => {
    expect(resolveReviewsIntegrationStatus()).toBe("not_connected");
  });

  it("offers the three views in order", () => {
    view("overview");
    const nav = screen.getByRole("navigation", {
      name: "Google Reviews views",
    });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Overview", "Google Reviews", "Salon Leaderboard"]);
    expect(within(nav).getByRole("link", { name: "Overview" })).toHaveProperty(
      "href",
    );
  });

  it("an unknown tab lands on the Overview", () => {
    expect(parseReviewsTab("nope")).toBe("overview");
    expect(parseReviewsTab(undefined)).toBe("overview");
    expect(parseReviewsTab(["needs"])).toBe("overview");
  });

  it.each(TABS)("%s says Not connected yet and shows no figures", (tab) => {
    const { container } = view(tab);
    expect(screen.getAllByText("Not connected yet").length).toBeGreaterThan(0);
    const text = container.textContent ?? "";
    // No percentages, ratios or digits standing in for a measurement.
    expect(text).not.toMatch(/\d+\s*%/);
    expect(text).not.toMatch(/\d+\s*\/\s*\d+/);
    expect(text).not.toMatch(/Sun Tan|Madeline/i);
  });

  it("the overview keeps every tile, table and section", () => {
    const { container } = view("overview");
    for (const label of [
      "Qualifying reviews",
      "Salons at goal",
      "Reviews still needed",
      "Salon goal progress",
      "District goal progress",
      "Monthly target",
      "Progress toward target",
    ]) {
      expect(container.textContent).toContain(label);
    }
    expect(
      screen.getAllByTestId("not-connected").length,
    ).toBeGreaterThanOrEqual(10);
  });
});
