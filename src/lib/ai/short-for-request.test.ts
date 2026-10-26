import { describe, expect, it } from "vitest";

import { shortForRequest } from "./short-for-request";

/** SHORT_FOR_REQUEST_ENABLED: only a short "<form> for <name>" with a prior action is read with "create a". */
describe("shortForRequest", () => {
  it.each([
    ["ca for rory vance at kearney, late today, previous coaching verbal 6/25", "create a ca for rory vance at kearney, late today, previous coaching verbal 6/25"],
    ["Ca for rory vance at kearney, late today, previous coaching verbal 6/25", "create a Ca for rory vance at kearney, late today, previous coaching verbal 6/25"],
    ["CA FOR RORY VANCE AT KEARNEY, LATE TODAY, PRIOR VERBAL 6/25", "create a CA FOR RORY VANCE AT KEARNEY, LATE TODAY, PRIOR VERBAL 6/25"],
  ])("'%s'", (turn, read) => {
    expect(shortForRequest(turn)).toBe(read);
  });

  it.each([
    "ca for rory vance at kearney, late today",
    "create a ca for rory vance at kearney, late today, previous coaching verbal 6/25",
    "what is a ca for, and does previous coaching count?",
    "she had previous coaching for being late",
  ])("leaves '%s' as typed", (turn) => {
    expect(shortForRequest(turn)).toBe(turn);
  });
});
