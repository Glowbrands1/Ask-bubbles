import { afterEach, describe, expect, it, vi } from "vitest";

import { noShowNotLateOpening, noShowWords } from "./late-open";

/** NO_SHOW_OPENING_IS_ATTENDANCE_ENABLED (QA's ruling on live round 17b, 10 Nov 2026). People invented. */
afterEach(() => vi.unstubAllEnvs());

describe("a no-show to an opening shift is an absence, never a Late Opening", () => {
  it.each([
    ["Can you make a CA for Corisande Pell, she did not show up for a scheduled opening shift", "did not show up for a scheduled opening shift"],
    ["she didn't show up for her opening shift", "didn't show up for her opening shift"],
    ["no call no show for the opening shift on 11/8", "no call"],
    ["she missed her scheduled opening shift", "missed her scheduled opening shift"],
  ])("on: %s", (said, words) => {
    vi.stubEnv("NO_SHOW_OPENING_IS_ATTENDANCE_ENABLED", "true");
    expect(noShowNotLateOpening(said)).toBe(true);
    expect(noShowWords(said)).toBe(words);
  });

  it.each([
    "Can you make a CA for Corisande Pell for failure to open on time?",
    "she opened the store late",
    "she was late to open and did not show up until 10",
    "the store opened late because she didn't show up",
  ])("on: the store opened late, so not this rule — %s", (said) => {
    vi.stubEnv("NO_SHOW_OPENING_IS_ATTENDANCE_ENABLED", "true");
    expect(noShowNotLateOpening(said)).toBe(false);
  });

  it("off: never", () => {
    vi.stubEnv("NO_SHOW_OPENING_IS_ATTENDANCE_ENABLED", "false");
    expect(noShowNotLateOpening("she did not show up for a scheduled opening shift")).toBe(false);
    expect(noShowWords("she did not show up for a scheduled opening shift")).toBeNull();
  });
});
