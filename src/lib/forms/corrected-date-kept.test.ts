import { afterEach, describe, expect, it, vi } from "vitest";

import { correctedIncidentDate } from "./incident-dates";

vi.mock("server-only", () => ({}));

/** QA's round-5 trace of corrective-action-conversation-qa Q6 (8 Nov 2026); the manager's words, an invented person. */
const T = [
  "create a CA for tess varga for not attending the monthly meeting on 10-20-26. previous coaching: jba policy manual 1-1-26, verbal ca 9-1-26",
  "actually make it verbal",
  "the meeting was actually on 10-19-26",
  "sorry, the verbal ca was on 9-2-26 not 9-1-26",
];
const TODAY = "2026-10-21";

afterEach(() => vi.unstubAllEnvs());

describe("CORRECTED_DATE_KEPT: correctedIncidentDate", () => {
  it("off: the prior step's correction is taken as the incident's (the report)", () => {
    expect(correctedIncidentDate(T, TODAY)).toBe("2026-09-02");
  });

  it("on: the incident date the manager corrected to stays", () => {
    vi.stubEnv("CORRECTED_DATE_KEPT_ENABLED", "true");
    expect(correctedIncidentDate(T, TODAY)).toBe("2026-10-19");
    expect(correctedIncidentDate(T.slice(0, 3), TODAY)).toBe("2026-10-19");
  });

  it("on: a correction of the prior step alone corrects no incident date", () => {
    vi.stubEnv("CORRECTED_DATE_KEPT_ENABLED", "true");
    expect(correctedIncidentDate([T[0]!, T[3]!], TODAY)).toBeNull();
  });
});
