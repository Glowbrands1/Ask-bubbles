import { afterEach, describe, expect, it, vi } from "vitest";

import { policyNamesFromViolated, policyPhrase } from "./ca-action-plan";
import { cleaningUndonePhrase, namesCareAndCleaning } from "./ca-policy";

/* OTHER_POLICY_AGREES_ENABLED and OTHER_NOT_A_POLICY_NAME_ENABLED (ported from the sibling app, 14 Nov 2026). */
describe("OTHER_POLICY_AGREES_ENABLED: the sanitation family is a cleaning word", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("off: \"sanitaion\" / \"sanitation\" are not read (as before)", () => {
    expect(cleaningUndonePhrase("not doing th e10 minute sanitaion")).toBeNull();
    expect(cleaningUndonePhrase("she did not do the 10 minute sanitation")).toBeNull();
  });

  it("on: the reporter's typed words and the spelled word are cleaning left undone", () => {
    vi.stubEnv("OTHER_POLICY_AGREES_ENABLED", "true");
    vi.stubEnv("CLEANING_OTHER_EVERY_WORDING_ENABLED", "true");
    expect(cleaningUndonePhrase("not doing th e10 minute sanitaion")).toMatch(/sanitaion/);
    expect(cleaningUndonePhrase("she did not do the 10 minute sanitation")).toMatch(/sanitation/);
  });

  it("Care and Cleaning named is a named policy", () => {
    expect(namesCareAndCleaning("violating the care and cleaning policy")).toBe(true);
    expect(namesCareAndCleaning("she did not do the sanitation")).toBe(false);
  });
});

describe("OTHER_NOT_A_POLICY_NAME_ENABLED: Other is a box, never a policy name", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("off: \"Other\" reads as a policy name (as before)", () => {
    expect(policyPhrase(policyNamesFromViolated("Other"))).toBe("the Other policy");
  });

  it("on: \"Other\" names no policy; another named policy is kept", () => {
    vi.stubEnv("OTHER_NOT_A_POLICY_NAME_ENABLED", "true");
    expect(policyNamesFromViolated("Other")).toEqual([]);
    expect(policyPhrase(policyNamesFromViolated("Other"))).toMatch(/applicable company policy/i);
    expect(policyNamesFromViolated("Attendance Policy, Other")).toEqual(["Attendance Policy"]);
  });
});
