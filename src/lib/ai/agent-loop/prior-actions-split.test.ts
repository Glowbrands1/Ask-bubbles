import { describe, expect, it } from "vitest";

import { priorActionsSplit } from "./tools";

/* QA's Bubbles round 2 (22 Nov 2026, U09): "JBA Policy Manual 1-1-2026, Verbal CA 11-1-2026. On 11-1-26 <P> violated …". */
const SAID = "JBA Policy Manual 1-1-2026, Verbal CA 11-1-2026. On 11-1-26 Fenna Prewitt violated care and cleaning of facilities policy";

describe("priorActionsSplit (U09)", () => {
  /*
   * CHANGED ON PURPOSE (QA's live round-2 re-run, 22 Nov 2026, U09): "the stated prior is NOT listed". The Verbal CA's date
   * is the incident's day, but the manager typed it right after the step ("Verbal CA 11-1-2026"), so it is that step's own
   * date and both steps stay (`datedByManagerForStep`). Leaving one step off now needs a date the manager never gave that
   * step: a Written Warning on the incident's day, with no written warning in their words.
   */
  it("keeps both steps the manager dated; leaves off only a step given the incident's date it never had", () => {
    expect(priorActionsSplit("JBA Policy Manual — 01/01/2026; Verbal CA — 11/01/2026", SAID, "2026-11-01")).toMatchObject({ kept: "JBA Policy Manual — 01/01/2026; Verbal CA — 11/01/2026", dropped: [] });
    const split = priorActionsSplit("JBA Policy Manual — 01/01/2026; Written Warning — 11/01/2026", SAID, "2026-11-01");
    expect(split.kept).toBe("JBA Policy Manual — 01/01/2026");
    expect(split.dropped.map((entry) => entry.step)).toEqual(["Written Warning — 11/01/2026"]);
  });

  it("a list with no problem is kept whole; a list with no good step is refused whole", () => {
    expect(priorActionsSplit("JBA Policy Manual — 01/01/2026", SAID, "2026-11-01")).toMatchObject({ kept: "JBA Policy Manual — 01/01/2026", dropped: [] });
    expect(priorActionsSplit("Written Warning — 11/01/2026", SAID, "2026-11-01").kept).toBeNull();
  });
});
