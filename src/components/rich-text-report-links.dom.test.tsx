// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { RichText } from "./rich-text";

/*
 * Buff City Soap's catalog is empty, so a report is registered here: one live
 * report the chat may link, and one placeholder it may not (its page has no
 * figures). Fixture data only — not a Buff report.
 */
vi.mock("@/config/company/reports", () => ({
  COMPANY_REPORTS: [
    {
      id: "store-sales",
      label: "Store Sales",
      summary: "Fixture: daily sales by store.",
      cadence: "daily",
      questionTerms: [],
      status: "live",
    },
    {
      id: "coming-soon",
      label: "Coming Soon",
      summary: "Fixture: not connected yet.",
      cadence: "daily",
      questionTerms: [],
      status: "placeholder",
    },
  ],
}));

afterEach(cleanup);

/**
 * Asked "where do i find kpi information", the assistant sends the manager to a
 * report in this app — and the report is a link, so the next step is a click.
 * Only the Reports root and live report paths are linkable; anything else
 * stays the text it was.
 */
describe("links to this app's reports", () => {
  it("links a live report, with the label as the link text", () => {
    render(<RichText content="Open [Store Sales](/reports/store-sales) for yesterday's numbers." />);

    const link = screen.getByRole("link", { name: "Store Sales" });
    expect(link.getAttribute("href")).toBe("/reports/store-sales");
    expect(document.body.textContent).toBe("Open Store Sales for yesterday's numbers.");
  });

  it("links the section root and a report wrapped in bold", () => {
    render(
      <RichText content="- **[Reports](/reports)** then **[Store Sales](/reports/store-sales)**" />,
    );

    expect(screen.getByRole("link", { name: "Reports" }).getAttribute("href")).toBe("/reports");
    expect(screen.getByRole("link", { name: "Store Sales" }).getAttribute("href")).toBe(
      "/reports/store-sales",
    );
    expect(document.body.textContent).not.toContain("**");
  });

  it("never links a placeholder report or anything off the allowlist", () => {
    const content = [
      "[Coming Soon](/reports/coming-soon)",
      "[Power BI](https://app.powerbi.com)",
      "[Users](/admin/users)",
      "[Sneaky](javascript:alert(1))",
      "[Close](/reports/store-sales/../../admin)",
    ].join("\n\n");
    render(<RichText content={content} />);

    expect(screen.queryByRole("link")).toBeNull();
    expect(document.body.textContent).toContain("[Power BI](https://app.powerbi.com)");
    expect(document.body.textContent).toContain("[Coming Soon](/reports/coming-soon)");
  });
});
