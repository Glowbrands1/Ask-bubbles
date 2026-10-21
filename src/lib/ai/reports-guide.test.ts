import { describe, expect, it, vi } from "vitest";

import { NAV_SECTIONS } from "@/components/shell/navigation";

import { buildSystemPrompt } from "./prompts";

/*
 * Buff City Soap's catalog is empty, so a report is registered here to drive
 * the real path: company catalog → registry → the prompt's Reports guide. One
 * live report, one placeholder. Fixture data only — not a Buff report.
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

const BASE = {
  assistantName: "Bubbles",
  brandName: "Buff City Soap",
  productName: "Ask Bubbles",
  locationNoun: "store",
  context: { userName: "Dana Reyes", locationName: "Testville Downtown", todayIso: "2026-10-20" },
  mode: "standard" as const,
  hasContext: true,
};

describe("the Reports guide, once a live report is registered", () => {
  it("points a role with view_reports at the live report only", () => {
    const prompt = buildSystemPrompt({ ...BASE, canViewReports: true });

    expect(prompt).toContain("REPORTS — WHERE THE NUMBERS LIVE IN THIS APP");
    expect(prompt).toContain("[Store Sales](/reports/store-sales)");
    // A placeholder page has no figures: never somewhere to send a manager.
    expect(prompt).not.toContain("Coming Soon");
    expect(prompt).not.toContain("/reports/coming-soon");
  });

  it("tells the model not to send a role without view_reports there", () => {
    const prompt = buildSystemPrompt({ ...BASE, canViewReports: false });

    expect(prompt).toMatch(/cannot open the Reports section/);
    expect(prompt).not.toContain("/reports/store-sales");
  });

  it("treats an absent flag as no access", () => {
    expect(buildSystemPrompt(BASE)).toMatch(/cannot open the Reports section/);
  });

  it("names the section as the sidebar does, under Insights", () => {
    const insights = NAV_SECTIONS.find((section) => section.label === "Insights");
    const entry = insights?.items.find((item) => item.href === "/reports");

    expect(entry?.label).toBe("Reports");
    expect(buildSystemPrompt({ ...BASE, canViewReports: true })).toContain(
      "open Reports in the sidebar",
    );
    expect(buildSystemPrompt({ ...BASE, canViewReports: true })).toContain(
      "in the left sidebar under Insights",
    );
  });
});
