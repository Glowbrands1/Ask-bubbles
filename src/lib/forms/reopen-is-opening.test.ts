import { afterEach, describe, expect, it, vi } from "vitest";

import { readCaPolicy } from "./ca-policy";
import { lateOpeningWords, lateToReopen, saysFailureToOpen } from "./late-open";

// QA's Bubbles 17n live test (12 Nov 2026), the manager's words (the employee invented).
const SAID = "create a corrective action for Remy Calder, he was late to reoepn the store on 11/9";

describe("REOPEN_IS_OPENING_ENABLED", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("off (production today): \"late to reoepn\" is no late opening (the bug)", () => {
    vi.stubEnv("REOPEN_IS_OPENING_ENABLED", "");
    expect(saysFailureToOpen(SAID)).toBe(false);
  });

  it.each([SAID, "he was late to reopen the store on 11/9", "she was late to re-open the store", "late to reopne"])("on: %s is a late opening", (text) => {
    vi.stubEnv("REOPEN_IS_OPENING_ENABLED", "true");
    expect(saysFailureToOpen(text)).toBe(true);
  });

  it("on: the card quotes the manager's own words", () => {
    vi.stubEnv("REOPEN_IS_OPENING_ENABLED", "true");
    expect(lateOpeningWords(SAID)).toBe("late to reoepn the store");
  });

  it.each(["he was late to report his hours", "she was late to return from break", "late to reply to the district manager", "late to restock the shelves"])(
    "on: %s is not a late opening",
    (text) => {
      vi.stubEnv("REOPEN_IS_OPENING_ENABLED", "true");
      expect(lateToReopen(text)).toBeNull();
    },
  );

  it("on: the reading is no longer Attendance from \"late\" alone", () => {
    vi.stubEnv("REOPEN_IS_OPENING_ENABLED", "true");
    vi.stubEnv("LATE_OPEN_DATE_ENABLED", "true");
    expect(readCaPolicy(SAID).stated).not.toBe("attendance");
  });
});
