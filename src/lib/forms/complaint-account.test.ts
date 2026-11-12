import { afterEach, describe, expect, it, vi } from "vitest";
import { incidentSplitFixEnabled } from "@/lib/config/chat-quality-flags";

import { correctiveActionIssue } from "./incident-issue";
import { mentionsEarlierWarning, statedWarningLevel } from "./warning-level";

/**
 * COMPLAINT_ACCOUNT_ENABLED (QA's audit, 7 Nov 2026; a real manager's chat here, 3 Nov 2026). The manager's words;
 * the people are invented (Marnie Holloway; the district manager "Ottoline Brackett", on no directory).
 */
const SAID =
  "verbal warning The date she complained was Oct 31st . The customer said she was giving her an attitude when she brought up that the register was charging for scent in her lotion refills and it has never done that before. When Marnie spoke with District manager Ottoline Brackett on the phone about how to fix this, Marnie told the customer that she was making her job really hard. The customer reached out to district manager Ottoline Brackett saying Marnie was very rude to her and Marnie told her she knows how to do her job she has worked here for two years. no payroll deduct.";
const TODAY = "2026-11-07";
const TURNS = `create a ca form for Marnie Holloway\n\n${SAID}`;

/** The flags production runs this reader with (they decide which sentences are read at all). */
const PRODUCTION = ["TYPED_NAME_ENABLED", "LEVEL_REQUEST_DATE_ENABLED", "DECIMAL_NOT_SENTENCE_END_ENABLED", "LEVEL_STEP_NOT_ACCOUNT_ENABLED", "REQUEST_LEVEL_NOT_HISTORY_ENABLED"];

function flags(on: boolean) {
  for (const flag of PRODUCTION) vi.stubEnv(flag, "true");
  vi.stubEnv("COMPLAINT_ACCOUNT_ENABLED", on ? "true" : "false");
}

afterEach(() => vi.unstubAllEnvs());

describe("COMPLAINT_ACCOUNT: the Issue", () => {
  it("off: the date line is the Issue (the report)", () => {
    flags(false);
    // Changed on purpose (QA's October triage, 10 Nov 2026): INCIDENT_SPLIT_FIX_ENABLED on (#189) reads the request's account in whole sentences, which already leaves out what this pin reproduces; flag off unchanged.
    expect(correctiveActionIssue(TURNS, "Marnie Holloway")).toMatch(
      incidentSplitFixEnabled() ? /^The customer said she was giving her an attitude/ : /^verbal warning The date she complained/,
    );
  });

  it("on: the Issue is the customer's complaint, never the level or the date line", () => {
    flags(true);
    const issue = correctiveActionIssue(TURNS, "Marnie Holloway") ?? "";
    expect(issue).toMatch(/^The customer said she was giving her an attitude/);
    expect(issue).not.toMatch(/verbal warning|The date she complained/i);
  });

  it("on: a sentence that dates the account and says more is still the account", () => {
    flags(true);
    expect(correctiveActionIssue("create a ca form for Marnie Holloway\n\nThe date she was rude to a customer at the register was Oct 31st.", "Marnie Holloway")).toMatch(/rude to a customer/);
  });
});

describe("COMPLAINT_ACCOUNT: the level", () => {
  it("off: the opening \"verbal warning\" reads as an earlier one (the report)", () => {
    flags(false);
    expect(mentionsEarlierWarning(SAID, TODAY)).toBe(true);
    expect(statedWarningLevel(SAID, TODAY)).toBeNull();
  });

  it("on: it is this form's level, and no earlier warning", () => {
    flags(true);
    expect(statedWarningLevel(SAID, TODAY)).toBe("verbal");
    expect(mentionsEarlierWarning(SAID, TODAY)).toBe(false);
  });

  it.each([
    "she had a verbal warning on 10/1. The customer said she was rude today",
    "verbal warning on 10/1 The customer said she was rude today",
    "verbal warning last week she was rude to a customer",
  ])("on, negative: %s — the dated or past warning stays history", (text) => {
    flags(true);
    expect(statedWarningLevel(text, TODAY)).toBeNull();
  });
});
