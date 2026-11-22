import { describe, expect, it } from "vitest";

import { exitReadBack, exitReadBackMismatch, withoutUnsavedExitLines } from "./exit-read-back";

/* U22 (QA's Bubbles round 2, 22 Nov 2026): an exit reply reads back only the lines Create saves. */
describe("exit read-back", () => {
  const readBack = exitReadBack({ dateLines: [], account: "Odile messaged back that she was quitting effective immediately.", termination: false });

  it("flags a stated date nobody gave and the account under another field's label", () => {
    const reply = "**Date that notice was given:** 11/14/2026\n\n**Reason for Resignation:** Odile messaged back that she was quitting effective immediately.";
    expect(exitReadBackMismatch(reply, readBack)).toHaveLength(2);
    expect(withoutUnsavedExitLines(reply, readBack)).toBe("");
  });

  it("keeps the saved lines, and a date line that states no date", () => {
    const reply = "**Additional Details:** Odile messaged back that she was quitting effective immediately.\n\n**Last Day Worked:** not set — you said TBD.";
    expect(exitReadBackMismatch(reply, readBack)).toEqual([]);
  });

  it("on a termination the account is the Reason for Resignation", () => {
    const termination = exitReadBack({ dateLines: ["**Last Day Worked:** November 20, 2026"], account: "No call no show three times.", termination: true });
    expect(exitReadBackMismatch("**Reason for Resignation:** No call no show three times.\n**Last Day Worked:** November 20, 2026", termination)).toEqual([]);
  });
});
