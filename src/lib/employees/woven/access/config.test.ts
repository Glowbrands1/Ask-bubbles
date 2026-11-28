import { describe, expect, it } from "vitest";

import { readWovenAccessConfig, readWovenAccessMode } from "./config";

/**
 * WOVEN_ACCESS_MODE=apply, ported from the sibling app for ONE capability:
 * DISABLE_TERMINATED (owner, 28 Nov 2026: "make this automatic for both sunny
 * and bubble"). The account-creation, invitation and link capabilities are not
 * ported here, so naming them refuses the whole configuration.
 */
describe("WOVEN_ACCESS_MODE and its apply switches", () => {
  it("defaults to off; shadow applies nothing", () => {
    expect(readWovenAccessConfig({})).toEqual({ mode: "off", applyActions: [], employeeAllowlist: null, problem: null });
    expect(readWovenAccessConfig({ WOVEN_ACCESS_MODE: "shadow" })).toEqual({ mode: "shadow", applyActions: [], employeeAllowlist: null, problem: null });
  });

  it("apply with no capabilities listed applies nothing", () => {
    expect(readWovenAccessConfig({ WOVEN_ACCESS_MODE: "apply" })).toEqual({ mode: "apply", applyActions: [], employeeAllowlist: null, problem: null });
  });

  it("apply + DISABLE_TERMINATED is accepted (case and spacing forgiven, duplicates folded)", () => {
    expect(readWovenAccessConfig({ WOVEN_ACCESS_MODE: "Apply", WOVEN_ACCESS_APPLY_ACTIONS: " disable_terminated, DISABLE_TERMINATED" })).toEqual({
      mode: "apply",
      applyActions: ["DISABLE_TERMINATED"],
      employeeAllowlist: null,
      problem: null,
    });
    expect(readWovenAccessMode({ WOVEN_ACCESS_MODE: "apply", WOVEN_ACCESS_APPLY_ACTIONS: "DISABLE_TERMINATED" })).toEqual({ mode: "apply", problem: null });
  });

  it("an optional batch allowlist limits apply to those Woven EmployeeIDs", () => {
    expect(
      readWovenAccessConfig({ WOVEN_ACCESS_MODE: "apply", WOVEN_ACCESS_APPLY_ACTIONS: "DISABLE_TERMINATED", WOVEN_ACCESS_APPLY_EMPLOYEE_IDS: "abc-1, def-2,abc-1" }),
    ).toMatchObject({ mode: "apply", employeeAllowlist: ["abc-1", "def-2"], problem: null });
  });

  it.each(["CREATE_USER", "SEND_INVITE", "LINK_EXISTING", "DISABLE_TERMINATED,CREATE_USER", "CREATE_USER,SEND_INVITE,LINK_EXISTING,DISABLE_TERMINATED"])(
    "%s: the sibling's create/invite/link capabilities are not available here — the whole mode falls back to OFF",
    (actions) => {
      const config = readWovenAccessConfig({ WOVEN_ACCESS_MODE: "apply", WOVEN_ACCESS_APPLY_ACTIONS: actions });
      expect(config).toMatchObject({ mode: "off", applyActions: [], employeeAllowlist: null });
      expect(config.problem).toMatch(/may name only DISABLE_TERMINATED/);
      expect(config.problem).toMatch(/not available in Ask Bubbles/);
    },
  );

  it.each(["UPDATE_ROLE", "UPDATE_PRIMARY_LOCATION", "DELETE_USER", "DISABLE_TERMINATED,UPDATE_ROLE"])(
    "%s is refused and the mode falls back to OFF — a misconfiguration never widens what runs",
    (actions) => {
      const config = readWovenAccessConfig({ WOVEN_ACCESS_MODE: "apply", WOVEN_ACCESS_APPLY_ACTIONS: actions });
      expect(config).toMatchObject({ mode: "off", applyActions: [] });
      expect(config.problem).toMatch(/may name only DISABLE_TERMINATED/);
    },
  );

  it("a malformed batch list, or an unknown mode, is OFF with a problem", () => {
    const badIds = readWovenAccessConfig({ WOVEN_ACCESS_MODE: "apply", WOVEN_ACCESS_APPLY_ACTIONS: "DISABLE_TERMINATED", WOVEN_ACCESS_APPLY_EMPLOYEE_IDS: "ok-1, not ok!" });
    expect(badIds.mode).toBe("off");
    expect(badIds.problem).toMatch(/WOVEN_ACCESS_APPLY_EMPLOYEE_IDS/);
    const unknown = readWovenAccessConfig({ WOVEN_ACCESS_MODE: "on" });
    expect(unknown).toMatchObject({ mode: "off" });
    expect(unknown.problem).toMatch(/must be "off", "shadow" or "apply"/);
  });
});
