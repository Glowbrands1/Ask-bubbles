import { afterEach, describe, expect, it, vi } from "vitest";

import { statedWarningLevel } from "./warning-level";

// The owner's retest wording (owner-retest-e2e), with RELATIVE_DATE_READER_ENABLED on as in production (10 Nov 2026).
const SAID = "need a CA for jordan testperson. she mishandled cash at close yesterday. written warning";
const TODAY = "2026-11-10";

describe("RELATIVE_DAY_NOT_HISTORY_ENABLED", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("without the relative-date reader, the trailing level is this form's", () => {
    expect(statedWarningLevel(SAID, TODAY)).toBe("written");
  });

  it("with the relative-date reader on and this flag off, the level is lost (the bug)", () => {
    vi.stubEnv("RELATIVE_DATE_READER_ENABLED", "true");
    expect(statedWarningLevel(SAID, TODAY)).toBeNull();
  });

  it("with both on, \"yesterday\" is the incident's day and the level stays Written", () => {
    vi.stubEnv("RELATIVE_DATE_READER_ENABLED", "true");
    vi.stubEnv("RELATIVE_DAY_NOT_HISTORY_ENABLED", "true");
    expect(statedWarningLevel(SAID, TODAY)).toBe("written");
  });

  it("with both on, a date written as a date before today still makes the level history", () => {
    vi.stubEnv("RELATIVE_DATE_READER_ENABLED", "true");
    vi.stubEnv("RELATIVE_DAY_NOT_HISTORY_ENABLED", "true");
    expect(statedWarningLevel("need a CA for jordan testperson. she mishandled cash at close on 10/2. written warning", TODAY)).not.toBe("written");
  });
});
