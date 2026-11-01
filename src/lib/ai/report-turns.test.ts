import { afterEach, describe, expect, it, vi } from "vitest";

import type { AskRequest } from "./types";

/**
 * The sibling app's live retest, 1 Nov 2026: a question about one of its
 * reports, then "create a coaching form", made a card for the report's name.
 * This app's report catalog is empty today, so the test registers an invented
 * report; the mechanism reads the registry.
 */

vi.mock("@/config/company/reports", () => ({
  COMPANY_REPORTS: [{ id: "store-scorecard", label: "Store Scorecard", summary: "", cadence: "daily", questionTerms: [], status: "live" }],
}));

const REPORT_QUESTION = "Show me the most recent Store Scorecard and what I need to focus on today.";

function request(question: string, first = REPORT_QUESTION): AskRequest {
  return {
    question,
    history: [
      { id: "m1", role: "user", content: first, createdAt: "2026-11-01T08:00:00Z" },
      { id: "a1", role: "assistant", content: "Using the most recent Store Scorecard …", createdAt: "2026-11-01T08:00:05Z" },
    ],
  } as unknown as AskRequest;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe(`"${REPORT_QUESTION}" → "create a coaching form"`, () => {
  it("off (production today): the form sees the report question", async () => {
    const { withoutReportTurnsForForm } = await import("./report-turns");
    expect(withoutReportTurnsForForm(request("create a coaching form")).history).toHaveLength(2);
  });

  it("REPORT_NAME_NOT_A_PERSON: the report question and its answer are not part of the form", async () => {
    vi.stubEnv("REPORT_NAME_NOT_A_PERSON_ENABLED", "true");
    const { withoutReportTurnsForForm } = await import("./report-turns");
    expect(withoutReportTurnsForForm(request("create a coaching form")).history).toEqual([]);
  });

  it("REPORT_NAME_NOT_A_PERSON: a report turn that names somebody is kept (invented), and a non-form turn is untouched", async () => {
    vi.stubEnv("REPORT_NAME_NOT_A_PERSON_ENABLED", "true");
    const { withoutReportTurnsForForm } = await import("./report-turns");
    expect(withoutReportTurnsForForm(request("create a coaching form", "Marnie Holloway is behind on the Store Scorecard")).history).toHaveLength(2);
    expect(withoutReportTurnsForForm(request("what should I focus on first?")).history).toHaveLength(2);
  });
});

describe("mentionsReportName", () => {
  it("finds a registered report inside a sentence, and nothing else", async () => {
    const { mentionsReportName } = await import("./report-name");
    expect(mentionsReportName(REPORT_QUESTION)).toBe(true);
    expect(mentionsReportName("she was late again today")).toBe(false);
  });
});
