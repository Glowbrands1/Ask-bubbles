import { describe, expect, it } from "vitest";

import type { CardRecord } from "./card-record";
import { earlierPriorDates, priorDateLine, priorStepDates } from "./prior-step-dates";

/* QA's Bubbles round 3 (22 Nov 2026, U21): a prior step's date is never the form date. */
describe("prior-step dates", () => {
  const today = "2026-11-22";

  it("keeps the year written: 'signed JBA policies 6/24/24' is 2024-06-24, never this year's", () => {
    expect([...priorStepDates(["Store meeting attended July 2026; signed JBA policies 6/24/24"], today).keys()]).toEqual(["2024-06-24"]);
  });

  it("reads a month/day with no year as the latest such day not after today", () => {
    expect([...priorStepDates(["Coaching — 9/22 (cleaning tasks not being completed)", null, ""], today).keys()]).toEqual(["2026-09-22"]);
  });

  it("takes only this person's earlier cards' prior dates, each once", () => {
    const record = (employeeKey: string, priorDates?: string[]) => ({ employeeKey, priorDates }) as unknown as CardRecord;
    const records = [record("a", ["2026-09-22"]), record("b", ["2026-10-01"]), record("a", ["2026-09-22", "2026-05-26"]), null];
    expect(earlierPriorDates(records, (row) => row.employeeKey === "a")).toEqual(["2026-09-22", "2026-05-26"]);
  });

  it("writes an ISO date back as a line the date reader reads with its year", () => {
    expect(priorDateLine("2024-06-24")).toBe("6/24/2024");
    expect([...priorStepDates([priorDateLine("2024-06-24")], today).keys()]).toEqual(["2024-06-24"]);
  });
});
