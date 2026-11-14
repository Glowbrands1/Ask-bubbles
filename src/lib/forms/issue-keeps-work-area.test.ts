import { afterEach, describe, expect, it, vi } from "vitest";

import { correctiveActionIssue } from "./incident-issue";
import { namesWorkArea, workAreaPhrase } from "./work-area";
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
    // "at" right after another "at" is still read (Gate-Bubbles, #880 p31–p33).
    ["remy calder at noon at the register", "at the register"],
  ])("%s → %s", (text, area) => expect(workAreaPhrase(text)).toBe(area));
});

describe("namesWorkArea: one place word's words never swallow the next (Gate-Bubbles, #880 p31–p33)", () => {
  it.each([
    ["she yelled at a guest in the back room", true],
    ["she cursed at guests near the register", true],
    ["she was rude on a call in the back room", true],
    ["she was rude to a guest in the back room", true],
    ["she yelled at a guest in front of everyone", false],
    // Gate-Bubbles' third #880 re-gate (p34, p37) and the other "<x> of" idioms.
    ["she was rude to a guest in front of the register", true],
    ["she was rude to a guest out front", true],
    ["she left her drink on top of the counter", true],
    ["she was on her phone in back of the stock room", true],
    ["she smoked outside of the back room", true],
    ["she was on top of her tasks", false],
    ["she argued in front of the team", false],
    ["she was out of line with a guest", false],
    ["she was on her phone in the middle of the sales floor", true],
    ["she sat in the corner of the stock room", true],
    ["she left by the end of her shift", false],
  ])("%s → %s", (text, names) => expect(namesWorkArea(text)).toBe(names));
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
