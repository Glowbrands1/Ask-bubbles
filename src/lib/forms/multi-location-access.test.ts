import { describe, expect, it } from "vitest";

import { reportingScopeOf, admitsLocation, narrowLocationSelection, locationIdsForScope } from "@/lib/reporting/scope/authorized-locations";
import { DEFAULT_PERMISSION_MATRIX, hasPermission } from "@/lib/permissions";
import type { AccessScope } from "@/types";

import type { FormsActor } from "./access";
import { scopeRoster, type DirectoryRosterRow } from "./employee-roster";
import { instanceListFilterFor, visibleInstances } from "./instance-scope";
import type { InstanceRow } from "./instances";
import { authorizeLocation, authorizedLocationIds } from "./location-scope";

/**
 * AN EMPLOYEE ASSIGNED LOCATIONS A, B AND C reaches data at all three and never
 * at D — through the form record rules, the list filter, the reporting scope,
 * the location authorization the form API uses, and the scoped roster. Role
 * restrictions are the same at every location. Locations are roster stores.
 */
const A = "loc-66";
const B = "loc-67";
const C = "loc-219";
const D = "loc-264";
const SORTED = [A, B, C].sort();
const ABC: AccessScope = { level: "location", primaryAreaId: A, alsoCoversAreaIds: [B, C] };

const actor = (role: FormsActor["role"], scope: AccessScope = ABC): FormsActor => ({ id: "u1", role, verified: true, scope }) as FormsActor;
const instance = (id: string, locationId: string | null, createdBy = "someone-else"): InstanceRow =>
  ({ id, layoutFamily: "none", locationId, createdBy }) as unknown as InstanceRow;
const records = [instance("a", A), instance("b", B), instance("c", C), instance("d", D)];

describe("forms: records at every assigned location, none elsewhere", () => {
  it("a location manager sees A, B and C records and not D", () => {
    expect(visibleInstances(actor("location_manager"), records).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
  it("the list query filter carries all three locations and not D", () => {
    expect([...(instanceListFilterFor(actor("location_manager"))?.locationIds ?? [])].sort()).toEqual(SORTED);
  });
  it("role permissions do not depend on how many locations are assigned: an employee gets no forms or admin permissions at one, several or all", () => {
    for (const permission of ["view_form_monitoring", "view_forms_workspace", "create_forms", "manage_users"] as const) {
      expect(hasPermission(DEFAULT_PERMISSION_MATRIX, "employee", permission)).toBe(false);
    }
    expect(hasPermission(DEFAULT_PERMISSION_MATRIX, "location_manager", "view_form_monitoring")).toBe(true);
    expect(hasPermission(DEFAULT_PERMISSION_MATRIX, "location_manager", "manage_users")).toBe(false);
  });
  it("authoring is authorized at A, B and C and refused at D (the backend rule the form API applies)", () => {
    for (const id of [A, B, C]) expect(authorizeLocation(ABC, id)).toEqual({ kind: "authorized", locationId: id });
    expect(authorizeLocation(ABC, D).kind).toBe("refused");
  });
  it("a record at D created by this person is still refused (location decides, not authorship)", () => {
    expect(visibleInstances(actor("location_manager"), [instance("d2", D, "u1")])).toEqual([]);
  });
  it("a one-location scope cannot reach B", () => {
    const one: AccessScope = { level: "location", primaryAreaId: A, alsoCoversAreaIds: [] };
    expect(authorizedLocationIds(one)).toEqual([A]);
    expect(authorizeLocation(one, B).kind).toBe("refused");
  });
});

describe("dashboards and reporting: the scope covers A, B and C", () => {
  const scope = reportingScopeOf(ABC);
  it("admits A, B and C and not D, and is not unrestricted", () => {
    expect(scope.unrestricted).toBe(false);
    for (const id of [A, B, C]) expect(admitsLocation(scope, id)).toBe(true);
    expect(admitsLocation(scope, D)).toBe(false);
    expect([...(locationIdsForScope(scope) ?? [])].sort()).toEqual(SORTED);
  });
  it("a requested filter is narrowed to the assigned locations; an empty one means all three", () => {
    expect(narrowLocationSelection(scope, [A, D])).toEqual([A]);
    expect(narrowLocationSelection(scope, [D])).toEqual([]);
    expect(narrowLocationSelection(scope, []).sort()).toEqual(SORTED);
  });
  it("All Locations is unrestricted without being an administrator role", () => {
    expect(reportingScopeOf({ level: "global", primaryAreaId: null, alsoCoversAreaIds: [] }).unrestricted).toBe(true);
    expect(hasPermission(DEFAULT_PERMISSION_MATRIX, "employee", "manage_users")).toBe(false);
  });
});

describe("employee roster for forms", () => {
  const row = (id: string, locationIds: string[]): DirectoryRosterRow =>
    ({ id, firstName: "F" + id, lastName: "L" + id, preferredFirstName: null, employmentStatus: "active", locationIds }) as DirectoryRosterRow;
  it("includes people at A, B or C, only their assigned-location part, and excludes people only at D", () => {
    const r = scopeRoster([row("1", [A]), row("2", [C]), row("3", [D]), row("4", [B, D])], ABC);
    expect(r.map((e) => e.id).sort()).toEqual(["1", "2", "4"]);
    expect(r.find((e) => e.id === "4")?.locationIds).toEqual([B]);
  });
});

/* Google Reviews: the dashboard is not connected and reads no review data, so there is no location data to scope yet. Its admin routes need manage_integrations (routes.test.ts). */
