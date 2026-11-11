import { afterEach, describe, expect, it, vi } from "vitest";

import { decideFormDate } from "./incident-dates";

/**
 * STEP_DATES_NOT_FORM_DATE_ENABLED (QA round 5, Bubbles live 7 Nov 2026; the employee invented). With
 * STEP_DATE_NOT_INCIDENT on, every date in the request is a step's, and `decideFormDate` returned nothing, so the card
 * kept the first date `extractFormDate` read: 9/15, a coaching. The replay pack covers the route
 * (`nov8-step-dates-not-form-date-cases.ts`).
 */
const SAID =
  "hi, i need a performance corrective action for tamsin vale, a team member. she is under performance for september. she already received a verbal warning and coaching on 9/8/2026, 9/15/2026 and 9/25/2026. no payroll deduction applies. today's date is fine.";
const TODAY = "2026-11-07";

function decide(text: string) {
  return decideFormDate({ text, templateKey: "dpoa", history: [], conversation: [{ role: "user", content: text }], today: TODAY });
}

describe("STEP_DATES_NOT_FORM_DATE_ENABLED", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("off (STEP_DATE_NOT_INCIDENT on): nothing is decided, so the card keeps the first date read (the reported 9/15)", () => {
    vi.stubEnv("STEP_DATE_NOT_INCIDENT_ENABLED", "true");
    expect(decide(SAID)).toEqual({});
  });

  it("on: the form is not dated by a step", () => {
    vi.stubEnv("STEP_DATE_NOT_INCIDENT_ENABLED", "true");
    vi.stubEnv("STEP_DATES_NOT_FORM_DATE_ENABLED", "true");
    expect(decide(SAID)).toEqual({ formDate: null });
  });

  it("on: the one incident date left dates the form, beside a step's date (SF4's shape)", () => {
    vi.stubEnv("STEP_DATE_NOT_INCIDENT_ENABLED", "true");
    vi.stubEnv("STEP_DATES_NOT_FORM_DATE_ENABLED", "true");
    expect(decide("create a corrective action for tamsin vale, she was late on 10/20/2026. she already received a verbal warning on 9/8/2026.")).toEqual({
      formDate: "2026-10-20",
    });
  });

  it("on: with no step told, nothing changes", () => {
    vi.stubEnv("STEP_DATE_NOT_INCIDENT_ENABLED", "true");
    vi.stubEnv("STEP_DATES_NOT_FORM_DATE_ENABLED", "true");
    expect(decide("create a corrective action for tamsin vale, she was late on 10/20/2026.")).toEqual({});
  });

  it("on, with STEP_DATE_NOT_INCIDENT off: no step is set aside, so as before (the two-date question)", () => {
    const before = decide(SAID);
    expect(before.candidates).toEqual(["2026-09-15", "2026-09-25"]);
    vi.stubEnv("STEP_DATES_NOT_FORM_DATE_ENABLED", "true");
    expect(decide(SAID)).toEqual(before);
  });
});
