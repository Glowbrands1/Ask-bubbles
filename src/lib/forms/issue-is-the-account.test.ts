import { afterEach, describe, expect, it, vi } from "vitest";
import { incidentSplitFixEnabled } from "@/lib/config/chat-quality-flags";

vi.mock("server-only", () => ({}));

import { correctiveActionIssue } from "./incident-issue";

/**
 * ISSUE_IS_THE_ACCOUNT_ENABLED (QA, flip-3 tester, 6 Nov 2026, D): "…<name variant>, verbal, she was
 * late on 10-20-26" put What happened = "verbal" (the lateness dropped), and with a nickname, What
 * happened = the typed name. The Issue is the first clause after the person, so the level word or a
 * name variant was taken. The account is the reason, never the level or the name. The person is
 * invented and not on either directory (roster name Tamsin Wexley; typed "tamsin wexley", "Tammy
 * Wexley", "Tamsin W").
 */
const ROSTER_NAME = "Tamsin Wexley";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("ISSUE_IS_THE_ACCOUNT_ENABLED", () => {
  it("off (main): the level word, or the typed nickname, is the Issue (the bug)", () => {
    // Changed on purpose (QA's October triage, 10 Nov 2026): INCIDENT_SPLIT_FIX_ENABLED on (#189) reads the request's account in whole sentences, which already leaves out what this pin reproduces; flag off unchanged.
    const split = incidentSplitFixEnabled();
    expect(correctiveActionIssue("create a CA for tamsin wexley, verbal, she was late on 10-20-26", ROSTER_NAME)).toBe(split ? "she was late on 10-20-26" : "verbal");
    expect(correctiveActionIssue("create a CA for Tammy Wexley, verbal, she was late on 10-20-26", ROSTER_NAME)).toBe(split ? "she was late on 10-20-26" : "Tammy Wexley");
  });

  it.each([
    "create a CA for tamsin wexley, verbal, she was late on 10-20-26",
    "create a CA for Tammy Wexley, verbal, she was late on 10-20-26",
    "create a CA for Tamsin W, verbal, she was late on 10-20-26",
    "create a CA for Tamsin Wexley, written warning, she was late on 10-20-26",
  ])("on: %s → the Issue is the account", (text) => {
    vi.stubEnv("ISSUE_IS_THE_ACCOUNT_ENABLED", "true");
    expect(correctiveActionIssue(text, ROSTER_NAME)).toBe("she was late on 10-20-26");
  });

  it("on, negative: an issue stated first is kept", () => {
    vi.stubEnv("ISSUE_IS_THE_ACCOUNT_ENABLED", "true");
    expect(correctiveActionIssue("a written warning for Tamsin Wexley for cash handling", ROSTER_NAME)).toBe("cash handling");
  });
});
