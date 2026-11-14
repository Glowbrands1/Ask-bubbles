import { afterEach, describe, expect, it, vi } from "vitest";

import { correctiveActionIssue } from "./incident-issue";

/* UNFOUND_POLICY_GIVES_WAY_TO_ACCOUNT (QA's Bubbles 17y live test, 14 Nov 2026); the person is invented. */
describe("an un-found named policy gives way to the account", () => {
  afterEach(() => vi.unstubAllEnvs());
  const LIVE = "create a CA for Marnie Holloway for violating the pet grooming policy, she was late on 11/3/26";

  it("off: the for-clause", () => {
    vi.stubEnv("UNFOUND_POLICY_GIVES_WAY_TO_ACCOUNT_ENABLED", "");
    expect(correctiveActionIssue(LIVE, "Marnie Holloway") ?? "").not.toMatch(/she was late/);
  });

  it("on: the lateness she stated", () => {
    vi.stubEnv("UNFOUND_POLICY_GIVES_WAY_TO_ACCOUNT_ENABLED", "true");
    expect(correctiveActionIssue(LIVE, "Marnie Holloway")).toMatch(/she was late on 11\/3\/26/);
  });

  it("on: a policy the app reads keeps the for-clause", () => {
    const said = "create a CA for Marnie Holloway for violating the attendance policy, she was late on 11/3/26";
    vi.stubEnv("UNFOUND_POLICY_GIVES_WAY_TO_ACCOUNT_ENABLED", "");
    const off = correctiveActionIssue(said, "Marnie Holloway");
    vi.stubEnv("UNFOUND_POLICY_GIVES_WAY_TO_ACCOUNT_ENABLED", "true");
    expect(correctiveActionIssue(said, "Marnie Holloway")).toBe(off);
  });

  it("on: a for-clause with nothing else said stays", () => {
    vi.stubEnv("UNFOUND_POLICY_GIVES_WAY_TO_ACCOUNT_ENABLED", "true");
    expect(correctiveActionIssue("create a CA for Marnie Holloway for violating the pet grooming policy", "Marnie Holloway")).toMatch(/pet grooming/);
  });
});
