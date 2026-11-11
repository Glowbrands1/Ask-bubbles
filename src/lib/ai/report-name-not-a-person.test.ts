import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * ============================================================================
 * A REPORT IS NOT A PERSON (REPORT_NAME_NOT_A_PERSON_ENABLED)
 * ============================================================================
 *
 * The sibling app's live QA, 1 Nov 2026: "Show me the most recent <report> and
 * what I need to focus on today." saved the report's name as the
 * conversation's EMPLOYEE, so a form asked for later in that chat would have
 * been for the report. This app's report catalog is empty today, so the test
 * registers an invented report; the guard reads the registry.
 */

vi.mock("@/config/company/reports", () => ({
  COMPANY_REPORTS: [{ id: "store-scorecard", label: "Store Scorecard", summary: "", cadence: "daily", questionTerms: [], status: "live" }],
}));

const STORES = [{ id: "loc-66", name: "Kearney, NE" }] as const;
const TEMPLATES = [
  { key: "dpoa", name: "Corrective Action Form" },
  { key: "coaching", name: "Coaching Form" },
] as const;
const ASK = "Show me the most recent Store Scorecard and what I need to focus on today.";

async function employeeAfter(employee: string) {
  const { decideIntentTurn } = await import("./intent-slots");
  return decideIntentTurn({
    question: ASK,
    history: [],
    today: "2026-10-31",
    saved: null,
    raw: { employee },
    people: [],
    stores: STORES,
    headings: [],
    templates: TEMPLATES,
    formInProgress: false,
  }).state.employeeName;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe(`"${ASK}", the reader returning the report as the employee`, () => {
  it("off (production today): the report is saved as the employee", async () => {
    expect(await employeeAfter("Store Scorecard")).toBe("Store Scorecard");
  });

  it("REPORT_NAME_NOT_A_PERSON: no employee is saved", async () => {
    vi.stubEnv("REPORT_NAME_NOT_A_PERSON_ENABLED", "true");
    expect(await employeeAfter("Store Scorecard")).toBeNull();
  });

  it("REPORT_NAME_NOT_A_PERSON: a person is still the employee (invented)", async () => {
    vi.stubEnv("REPORT_NAME_NOT_A_PERSON_ENABLED", "true");
    expect(await employeeAfter("Marnie Holloway")).toBe("Marnie Holloway");
  });
});

describe("isReportName", () => {
  it("knows the registry's report names, with or without 'report', and nothing else", async () => {
    const { isReportName } = await import("./report-name");
    expect(isReportName("Store Scorecard")).toBe(true);
    expect(isReportName("store scorecard report")).toBe(true);
    expect(isReportName("Marnie Holloway")).toBe(false);
    expect(isReportName("Scorecard")).toBe(false);
  });
});
