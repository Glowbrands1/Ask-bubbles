import { describe, expect, it } from "vitest";

import { EXIT_OPTION } from "./exit-library";
import { readExitFacts } from "./exit-facts";

/*
 * QA's live round-2 re-run (22 Nov 2026, U24; the tester's invented people): the manager stated the type ("Immediate Vol
 * Resignation.") and the story also holds a no call no show; the saved type was No Call No Show.
 */
const U24 = "create exit for Linnea Farrow, 123 Test St, Omaha, NE. 00000. Immediate Vol Resignation. Resignation Date 11-11-26. Employee resigned via phone call with Assistant Store Manager, Petra Quill.  Store items were returned and payroll deduct applies. On 11-11-26 Linnea was a no call no show for her shift and Store Manager, Marisol Thorne, called Linnea and left a voicemail. When Linnea returned the call she spoke with Petra and stated she was quitting effective immediately due to conflict with her other job.";

describe("the exit type the manager states by the box's label (U24)", () => {
  it("\"Immediate Vol Resignation.\" is the type, over the story's no call no show", () => {
    expect(readExitFacts(U24, "2026-11-22").typeOptions).toEqual([EXIT_OPTION.immediateVoluntary]);
  });
  it("controls: a no call no show told as the story, or stated as the label, is still the type", () => {
    expect(readExitFacts("exit for Linnea Farrow, she was a no call no show on 11/3 and never came back", "2026-11-22").typeOptions).toEqual([EXIT_OPTION.noCallNoShow]);
    expect(readExitFacts("exit for Linnea Farrow. No Call No Show. She said she was quitting effective immediately.", "2026-11-22").typeOptions).toEqual([EXIT_OPTION.noCallNoShow]);
  });
  it("control: two boxes stated is no single statement; the story's reading stands", () => {
    expect(readExitFacts("exit for Linnea Farrow. Immediate Vol Resignation. No Call No Show. She was a no call no show on 11/3.", "2026-11-22").typeOptions).toContain(EXIT_OPTION.noCallNoShow);
  });
});
