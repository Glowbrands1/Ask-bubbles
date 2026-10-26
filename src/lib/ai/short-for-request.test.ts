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

/** QA-4, 26 Oct 2026 (names invented): a denied prior action, or one after a question, is not one the request names. */
describe("shortForRequest: a denied or questioned prior action", () => {
  it.each([
    "ca for rory vance, she has no previous coaching",
    "Ca for Rory Vance, she has no previous coaching",
    "CA FOR RORY VANCE, SHE HAS NO PREVIOUS COACHING",
    "ca for rory vance, she never had a previous verbal",
    "Ca for Rory Vance, she never had a previous verbal",
    "ca for rory vance, late today, without any previous coaching",
    "Ca for Rory Vance, late today, without any previous coaching",
    "ca for rory vance, previous coaching was not documented",
    "Ca for Rory Vance, previous coaching was not documented",
    "CA FOR RORY VANCE, PREVIOUS COACHING WAS NOT DOCUMENTED",
    "ca for rory vance? no, previous coaching verbal 6/25",
    "Ca for Rory Vance? No, previous coaching verbal 6/25",
    // QA-4 re-check, 26 Oct 2026.
    "ca for rory vance, previous coaching not given",
    "Ca for Rory Vance, previous coaching not given",
    "CA FOR RORY VANCE, PREVIOUS COACHING NOT GIVEN",
    "ca for rory vance, nothing in previous coaching",
    "Ca for Rory Vance, nothing in previous coaching",
    "CA FOR RORY VANCE, NOTHING IN PREVIOUS COACHING",
  ])("leaves '%s' as typed", (turn) => {
    expect(shortForRequest(turn)).toBe(turn);
  });

  it.each([
    ["ca for rory vance, no call no show, previous coaching verbal 6/25", "create a ca for rory vance, no call no show, previous coaching verbal 6/25"],
    ["ca for rory vance no call no show previous coaching verbal 6/25", "create a ca for rory vance no call no show previous coaching verbal 6/25"],
    ["exit for rory vance, previous written 7/28", "create an exit for rory vance, previous written 7/28"],
    ["Exit for Rory Vance, previous written 7/28", "create an Exit for Rory Vance, previous written 7/28"],
    ["EXIT FOR RORY VANCE, PREVIOUS WRITTEN 7/28", "create an EXIT FOR RORY VANCE, PREVIOUS WRITTEN 7/28"],
  ])("'%s' → '%s'", (turn, read) => {
    expect(shortForRequest(turn)).toBe(read);
  });
});
