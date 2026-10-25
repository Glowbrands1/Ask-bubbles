import { afterEach, describe, expect, it, vi } from "vitest";

import { listIncidentDates } from "./form-date-answer";
import { statedPriorActions } from "./prior-actions";

/**
 * Ported from Ask Sunny (QA, conv_muxahcdkiiur2tu there): the manager listed
 * the coachings already done — "she completed September Promo coaching
 * 9/29/26, … product coaching form 9/30/26, …" — and no prior was read, and
 * 9/29 was offered as the form's date. In this app's words (store, team
 * member; the products are this app's), the employee's name invented.
 *
 * PRIOR_ACTIONS_PARSE_ENABLED: "completed" says the step was taken. Off, the
 * reading is unchanged.
 */
const TURN =
  "Avery Lund, she is a Team Member at Kearney, created today but for the month of September, Avery was below company average in all categories for September, this will be a written warning, she completed September Promo coaching 9/29/26, Holiday soap product coaching form 9/30/26, Shrink coaching 9/31/26, and what would you recommend coaching 9/30/26, there is no payroll deduction applicable";
const TODAY = "2026-10-06";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('conv_muxahcdkiiur2tu: "she completed … coaching 9/29/26" is a prior step', () => {
  it("PRIOR_ACTIONS_PARSE_ENABLED on: listed as a prior, and its date does not date the form", () => {
    vi.stubEnv("PRIOR_ACTIONS_PARSE_ENABLED", "true");
    expect(statedPriorActions(TURN, TODAY)).toEqual(["Coaching — 09/29/2026", "Coaching — 09/30/2026"]);
    expect(listIncidentDates(TURN, TODAY).map((date) => date.iso)).not.toContain("2026-09-29");
  });

  it("off: unchanged — no prior is read, and 9/29 is still a candidate date", () => {
    vi.stubEnv("PRIOR_ACTIONS_PARSE_ENABLED", "");
    expect(statedPriorActions(TURN, TODAY)).toEqual([]);
    expect(listIncidentDates(TURN, TODAY).map((date) => date.iso)).toContain("2026-09-29");
  });
});
