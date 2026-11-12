import { afterEach, describe, expect, it, vi } from "vitest";

import { readCaPolicy } from "./ca-policy";
import { correctiveActionIssue } from "./incident-issue";

/**
 * TERSE_REQUEST_ACCOUNT_ENABLED — QA's #745 follow-up (12 Nov 2026), in the manager's words (U4's terse typo wording;
 * the employee is the replay pack's invented Rowan Kestrel): "writen ca rowan kestrel not atending monthly meeting
 * 12-20-26" gave a card with no Issue and no Policy line.
 */
const TERSE = "writen ca rowan kestrel not atending monthly meeting 12-20-26";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("TERSE_REQUEST_ACCOUNT_ENABLED", () => {
  it("off: as before (no Issue read from the terse request)", () => {
    expect(correctiveActionIssue(TERSE, "Rowan Kestrel")).toBeNull();
    expect(JSON.stringify(readCaPolicy(TERSE))).not.toMatch(/monthly meeting/);
  });

  it.each([TERSE, "Writen ca rowan kestrel not atending monthly meeting 12-20-26", "written c/a Rowan Kestrel - not atending monthly meeting 12-20-26."])(
    "on: %s → the account after the name is the Issue",
    (said) => {
      vi.stubEnv("TERSE_REQUEST_ACCOUNT_ENABLED", "true");
      expect(correctiveActionIssue(said, "Rowan Kestrel")).toBe("not atending monthly meeting 12-20-26");
    },
  );

  it("on: the typo 'atending' reads as the missed meeting, so the Attendance policy follows", () => {
    vi.stubEnv("TERSE_REQUEST_ACCOUNT_ENABLED", "true");
    expect(JSON.stringify(readCaPolicy(TERSE))).toMatch(/monthly meeting/);
  });

  it("on: nothing after the name, or another person's name, reads no Issue", () => {
    vi.stubEnv("TERSE_REQUEST_ACCOUNT_ENABLED", "true");
    expect(correctiveActionIssue("writen ca rowan kestrel", "Rowan Kestrel")).toBeNull();
    expect(correctiveActionIssue("write ca", null)).toBeNull();
    expect(correctiveActionIssue("writen ca brisa talmadge not atending monthly meeting", "Rowan Kestrel")).toBeNull();
  });
});
