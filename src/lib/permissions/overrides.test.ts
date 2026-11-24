import { afterEach, describe, expect, it } from "vitest";

import {
  ADMIN_CONSOLE_ROLES,
  DEFAULT_PERMISSION_MATRIX,
  PERMISSIONS,
  ROLES,
  activePermissionMatrix,
  effectiveMatrix,
  hasPermission,
  isPermissionEditableFor,
  overridesFromMatrix,
  sanitizeOverrides,
  setActivePermissionOverrides,
} from "./index";

/**
 * Saved permission changes (Pau, 23 Nov 2026): merge, sanitize and the cells
 * that can never change, whatever a stored row says.
 */
afterEach(() => setActivePermissionOverrides({}));

/** Same grants, whatever order a list is in. */
const grants = (matrix: Record<string, readonly string[]>) =>
  Object.fromEntries(Object.entries(matrix).map(([role, list]) => [role, [...list].sort()]));

describe("effectiveMatrix", () => {
  it("is the defaults when nothing is saved", () => {
    expect(effectiveMatrix({})).toEqual(DEFAULT_PERMISSION_MATRIX);
    expect(effectiveMatrix(null)).toEqual(DEFAULT_PERMISSION_MATRIX);
  });

  it("replaces a role's list with the saved one, leaving other roles on the defaults", () => {
    const matrix = effectiveMatrix({ location_manager: ["ask_questions", "create_forms"] });
    expect(matrix.location_manager).toEqual(["ask_questions", "create_forms"]);
    expect(matrix.district_manager).toEqual(DEFAULT_PERMISSION_MATRIX.district_manager);
  });

  it("lets a saved list GIVE a permission the defaults withhold", () => {
    const matrix = effectiveMatrix({ employee: ["ask_questions", "view_reports"] });
    expect(hasPermission(matrix, "employee", "view_reports")).toBe(true);
    expect(hasPermission(matrix, "employee", "view_knowledge")).toBe(false);
  });

  it("an explicit saved list for ASD wins over the build-flag defaults (assistantManagerCreateEnabled / asdNoFormMonitoringEnabled)", () => {
    const matrix = effectiveMatrix({ assistant_manager: ["ask_questions"] });
    expect(matrix.assistant_manager).toEqual(["ask_questions"]);
  });

  it("never changes the administrator roles, whatever is stored", () => {
    const matrix = effectiveMatrix({ admin: [], owner: ["ask_questions"], developer: [] });
    for (const role of ADMIN_CONSOLE_ROLES) expect(matrix[role]).toEqual([...PERMISSIONS]);
  });

  it("never grants a locked cell", () => {
    const matrix = effectiveMatrix({
      district_manager: ["manage_users", "manage_integrations", "ask_questions"],
    });
    expect(matrix.district_manager).toEqual(["ask_questions"]);
  });

  it("never gives an administrator-only report to a role that does not hold it", () => {
    const matrix = effectiveMatrix({ location_manager: ["view_ai_usage", "view_analytics", "ask_questions"] });
    expect(matrix.location_manager).toEqual(["ask_questions"]);
  });

  it("lets the one role that holds an administrator-only report lose it", () => {
    expect(hasPermission(DEFAULT_PERMISSION_MATRIX, "regional_manager", "view_ai_usage")).toBe(true);
    const matrix = effectiveMatrix({ regional_manager: ["ask_questions"] });
    expect(hasPermission(matrix, "regional_manager", "view_ai_usage")).toBe(false);
  });
});

describe("sanitizeOverrides", () => {
  it("drops unknown roles and permissions, non-lists and junk, and never throws", () => {
    expect(
      sanitizeOverrides({
        nobody: ["ask_questions"],
        employee: ["ask_questions", "fly_a_plane", 7, null, "ask_questions"],
        location_manager: "everything",
      }),
    ).toEqual({ employee: ["ask_questions"] });
    for (const junk of [null, undefined, 3, "x", [], [["employee"]]]) expect(sanitizeOverrides(junk)).toEqual({});
  });

  it("keeps an explicitly empty list: every box off is a choice", () => {
    expect(sanitizeOverrides({ employee: [] })).toEqual({ employee: [] });
    expect(effectiveMatrix({ employee: [] }).employee).toEqual([]);
  });
});

describe("overridesFromMatrix", () => {
  it("stores only the roles that differ from the defaults", () => {
    const draft = { ...DEFAULT_PERMISSION_MATRIX, employee: [...DEFAULT_PERMISSION_MATRIX.employee, "view_reports" as const] };
    const overrides = overridesFromMatrix(draft);
    expect(Object.keys(overrides)).toEqual(["employee"]);
    expect(grants(effectiveMatrix(overrides))).toEqual(grants(draft));
  });

  it("a role ticked back to its defaults stores nothing", () => {
    expect(overridesFromMatrix(DEFAULT_PERMISSION_MATRIX)).toEqual({});
  });

  it("every editable cell of every role round-trips", () => {
    for (const role of ROLES) {
      const editable = PERMISSIONS.filter((permission) => isPermissionEditableFor(role, permission));
      if (ADMIN_CONSOLE_ROLES.includes(role)) {
        expect(editable).toEqual([]);
        continue;
      }
      const matrix = effectiveMatrix({ [role]: editable });
      expect(grants(effectiveMatrix(overridesFromMatrix(matrix)))).toEqual(grants(matrix));
    }
  });
});

describe("the active matrix", () => {
  it("is the defaults until something loads, then the merged one", () => {
    expect(activePermissionMatrix()).toEqual(DEFAULT_PERMISSION_MATRIX);
    setActivePermissionOverrides({ employee: ["ask_questions"] });
    expect(hasPermission(activePermissionMatrix(), "employee", "view_knowledge")).toBe(false);
    setActivePermissionOverrides({});
    expect(hasPermission(activePermissionMatrix(), "employee", "view_knowledge")).toBe(true);
  });

  it("junk handed to it is dropped, never widened", () => {
    setActivePermissionOverrides({ employee: ["manage_users"], admin: [] });
    expect(hasPermission(activePermissionMatrix(), "employee", "manage_users")).toBe(false);
    expect(hasPermission(activePermissionMatrix(), "admin", "manage_users")).toBe(true);
  });
});
