import { afterEach, describe, expect, it, vi } from "vitest";

import { listIncidentDates } from "./form-date-answer";
import { incidentDates } from "./incident-dates";
import { statedPriorActions } from "./prior-actions";

/**
 * ============================================================================
 * "PREVIOUS COACHING. VERBAL (06/25/2026) AND WRITTEN (07/28/2026)" — PRIOR
 * ACTIONS, NEVER A DATE FOR THE FORM (ported from Ask Sunny, QA 25 Oct 2026)
 * ============================================================================
 *
 * The manager's words as QA reported them in the sibling app (salon read as
 * store; "Test Employee" is QA's placeholder, the store an invented one):
 *
 *   "create a verbal corrective action for Test Employee, soap maker at Test
 *    Store for missing the 10-15-26 woven deadline. previous coaching. verbal
 *    (06/25/2026) and written (07/28/2026). no payroll deducation"
 *
 * The label ends its sentence and each item is a level with its date in
 * brackets, so no earlier-step reader saw a step: both dates were offered by
 * "Which date goes on the form?" and neither prior was listed. This app's
 * intent read already drops a date `listFormDates` sets aside
 * (`datesInConversation`); the readers did not set these aside. With
 * PRIOR_ACTIONS_PARSE_ENABLED they do. Off, unchanged.
 */

const TODAY = "2026-10-25";
const SAID =
  "create a verbal corrective action for Test Employee, soap maker at Test Store for missing the 10-15-26 woven deadline. previous coaching. verbal (06/25/2026) and written (07/28/2026). no payroll deducation";
const PRIORS = "previous coaching. verbal (06/25/2026) and written (07/28/2026)";
const ONE_PRIOR = "create a verbal CA for Test Employee at Test Store for being late to open on 10-20-26. previous coaching. verbal (06/25/2026)";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("flag on", () => {
  it("lists both priors and offers only the incident's date", () => {
    vi.stubEnv("PRIOR_ACTIONS_PARSE_ENABLED", "1");
    expect(statedPriorActions(SAID, TODAY)).toEqual(["Verbal warning — 06/25/2026", "Written warning — 07/28/2026"]);
    expect(statedPriorActions(PRIORS, TODAY)).toEqual(["Verbal warning — 06/25/2026", "Written warning — 07/28/2026"]);
    expect(listIncidentDates(SAID, TODAY).map((found) => found.iso)).toEqual(["2026-10-15"]);
    expect(listIncidentDates(PRIORS, TODAY)).toEqual([]);
    expect(incidentDates(SAID, TODAY)).toEqual(["2026-10-15"]);
  });

  it("one incident date and one prior date is no question", () => {
    vi.stubEnv("PRIOR_ACTIONS_PARSE_ENABLED", "1");
    expect(incidentDates(ONE_PRIOR, TODAY)).toEqual(["2026-10-20"]);
    expect(statedPriorActions(ONE_PRIOR, TODAY)).toEqual(["Verbal warning — 06/25/2026"]);
  });

  it("a full stop after the label opens nothing that names no step", () => {
    vi.stubEnv("PRIOR_ACTIONS_PARSE_ENABLED", "1");
    const account = "previous coaching. she was late (10/20/2026) and left early (10/22/2026)";
    expect(statedPriorActions(account, TODAY)).toEqual([]);
    expect(listIncidentDates(account, TODAY).map((found) => found.iso)).toEqual(["2026-10-20", "2026-10-22"]);
  });
});

describe("flag off: unchanged", () => {
  it("reads no step, and every date is a candidate", () => {
    vi.stubEnv("PRIOR_ACTIONS_PARSE_ENABLED", "");
    expect(statedPriorActions(SAID, TODAY)).toEqual([]);
    expect(incidentDates(SAID, TODAY)).toEqual(["2026-06-25", "2026-07-28", "2026-10-15"]);
    expect(listIncidentDates(PRIORS, TODAY).map((found) => found.iso)).toEqual(["2026-06-25", "2026-07-28"]);
  });
});
