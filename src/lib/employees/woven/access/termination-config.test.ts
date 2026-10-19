import { describe, expect, it } from "vitest";

import { readWovenAccessMode } from "./config";
import { readTerminationEnforcement } from "./termination-config";

describe("WOVEN_TERMINATION_ENFORCEMENT — default OFF and fails closed", () => {
  it("is OFF when unset, empty or explicitly off", () => {
    for (const env of [{}, { WOVEN_TERMINATION_ENFORCEMENT: "" }, { WOVEN_TERMINATION_ENFORCEMENT: "  " }, { WOVEN_TERMINATION_ENFORCEMENT: "off" }, { WOVEN_TERMINATION_ENFORCEMENT: "OFF" }]) {
      expect(readTerminationEnforcement(env)).toEqual({ enabled: false, employeeAllowlist: null, problem: null });
    }
  });

  it("the default process environment of a deployment that sets nothing is OFF", () => {
    expect(readTerminationEnforcement({ WOVEN_ACCESS_MODE: "shadow", WOVEN_SYNC_ENABLED: "true" }).enabled).toBe(false);
  });

  it("only the exact word on enables it", () => {
    expect(readTerminationEnforcement({ WOVEN_TERMINATION_ENFORCEMENT: "on" }).enabled).toBe(true);
    expect(readTerminationEnforcement({ WOVEN_TERMINATION_ENFORCEMENT: " ON " }).enabled).toBe(true);
  });

  it("every other value is off AND reported as a problem", () => {
    for (const value of ["true", "1", "yes", "enabled", "apply", "shadow", "onn", "of", "false"]) {
      const result = readTerminationEnforcement({ WOVEN_TERMINATION_ENFORCEMENT: value });
      expect(result.enabled, value).toBe(false);
      expect(result.problem, value).toMatch(/"on" or "off"/);
    }
  });

  it("an optional batch allowlist narrows it; a malformed one turns it off", () => {
    expect(readTerminationEnforcement({ WOVEN_TERMINATION_ENFORCEMENT: "on", WOVEN_TERMINATION_ENFORCEMENT_EMPLOYEE_IDS: "a1, b2,a1" })).toEqual({
      enabled: true,
      employeeAllowlist: ["a1", "b2"],
      problem: null,
    });
    const bad = readTerminationEnforcement({ WOVEN_TERMINATION_ENFORCEMENT: "on", WOVEN_TERMINATION_ENFORCEMENT_EMPLOYEE_IDS: "ok,not ok!" });
    expect(bad.enabled).toBe(false);
    expect(bad.problem).toMatch(/EmployeeIDs/);
  });

  it("does not change WOVEN_ACCESS_MODE: still no apply value, and the switch does not influence it", () => {
    expect(readWovenAccessMode({ WOVEN_TERMINATION_ENFORCEMENT: "on" }).mode).toBe("off");
    expect(readWovenAccessMode({ WOVEN_ACCESS_MODE: "apply", WOVEN_TERMINATION_ENFORCEMENT: "on" }).mode).toBe("off");
    expect(readWovenAccessMode({ WOVEN_ACCESS_MODE: "shadow" }).mode).toBe("shadow");
  });
});
