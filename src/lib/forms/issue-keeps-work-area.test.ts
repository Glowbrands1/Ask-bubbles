import { afterEach, describe, expect, it, vi } from "vitest";

import { correctiveActionIssue } from "./incident-issue";
import { workAreaPhrase } from "./work-area";
import PRODUCTION from "@/config/production-flags.json";

/* ISSUE_KEEPS_WORK_AREA (QA, 13 Nov 2026). Invented people and wording. */
afterEach(() => vi.unstubAllEnvs());

/** Production's flags (as the replay pack reads them), with ISSUE_KEEPS_WORK_AREA as given. */
function production(on: boolean) {
  for (const flag of [...PRODUCTION.on, ...(PRODUCTION.assumedOn ?? [])]) vi.stubEnv(flag, "true");
  vi.stubEnv("ISSUE_KEEPS_WORK_AREA_ENABLED", on ? "true" : "");
}

const SAID = "create a ca for remy calder at the front desk, she was rude to a guest";

describe("workAreaPhrase", () => {
  it.each([
    ["remy calder at the front desk", "at the front desk"],
    ["remy calder at the register today", "at the register"],
    ["remy calder at the back room", "at the back room"],
    ["remy calder at west dodge", null],
    ["remy calder at close", null],
  ])("%s → %s", (text, area) => expect(workAreaPhrase(text)).toBe(area));
});

describe("ISSUE_KEEPS_WORK_AREA", () => {
  it("off: the Issue does not carry the work area (as on main)", () => {
    production(false);
    expect(correctiveActionIssue(SAID, "Remy Calder")).not.toMatch(/front desk/);
  });

  it("on: the work area said with the person stays on the Issue, once", () => {
    production(true);
    expect(correctiveActionIssue(SAID, "Remy Calder")).toBe("she was rude to a guest at the front desk");
    expect(correctiveActionIssue(`${SAID} at the front desk`, "Remy Calder")).toBe("she was rude to a guest at the front desk");
  });

  it("on: an account that already names a work area gets no second one (Gate-Bubbles, #880)", () => {
    production(true);
    expect(correctiveActionIssue("create a ca for remy calder at the register, she was rude to a guest at the front desk", "Remy Calder")).toBe(
      "she was rude to a guest at the front desk",
    );
  });

  it("on: the work area is written in the account's case, not the typed capitals (Gate-Bubbles, #880)", () => {
    production(true);
    expect(correctiveActionIssue("create a ca for remy calder At The Front Desk, she was rude to a guest", "Remy Calder")).toBe(
      "she was rude to a guest at the front desk",
    );
  });

  it("on: a store said with the person is still left off", () => {
    production(true);
    expect(correctiveActionIssue("create a ca for remy calder at west dodge, she was rude to a guest", "Remy Calder")).toBe("she was rude to a guest");
  });
});
