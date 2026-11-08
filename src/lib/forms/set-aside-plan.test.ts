import { afterEach, describe, expect, it, vi } from "vitest";

import type { CaPolicyName } from "./ca-policy";
import { NOTHING_SET_ASIDE, withPolicySetAside, type PolicySetAside } from "./policy-set-aside";

/** POLICY_SET_ASIDE_PLAN_ENABLED (the Bubbles live tester, QA, 8 Nov 2026); an invented person. */
const CARD = [
  "**Policy:** Attendance, from what you described (\"late\") — the policy manual's section on page 14.",
  "**Action plan:** Management will review the Attendance policy with Marnie. Future policy violations may result in additional corrective action up to and including termination of employment.",
].join("\n\n");
const ATTENDANCE: PolicySetAside = { names: new Set<CaPolicyName>(["attendance"]), any: false };

afterEach(() => vi.unstubAllEnvs());

describe("POLICY_SET_ASIDE_PLAN", () => {
  it("off: the plan still reviews the policy taken off (the report)", () => {
    expect(withPolicySetAside(CARD, ATTENDANCE)).toMatch(/review the Attendance policy with Marnie/);
  });

  it("on: the plan reviews the applicable company policy", () => {
    vi.stubEnv("POLICY_SET_ASIDE_PLAN_ENABLED", "true");
    const card = withPolicySetAside(CARD, ATTENDANCE);
    expect(card).toMatch(/\*\*Action plan:\*\* Management will review the applicable company policy with Marnie\. Future policy violations/);
    expect(card).toMatch(/\*\*Policy:\*\* none/);
  });

  it("on: of two policies, only the one taken off leaves the plan", () => {
    vi.stubEnv("POLICY_SET_ASIDE_PLAN_ENABLED", "true");
    const two = CARD.replace("the Attendance policy", "the Attendance and Late Opening policies");
    expect(withPolicySetAside(two, ATTENDANCE)).toMatch(/review the Late Opening policy with Marnie/);
  });

  it("on, nothing taken off: unchanged", () => {
    vi.stubEnv("POLICY_SET_ASIDE_PLAN_ENABLED", "true");
    expect(withPolicySetAside(CARD, NOTHING_SET_ASIDE)).toBe(CARD);
  });
});
