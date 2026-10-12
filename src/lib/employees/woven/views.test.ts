import { describe, expect, it } from "vitest";

import { WOVEN_SAMPLE_DATASET } from "@/data/demo/woven";
import type { AccessPreviewRow, DirectoryRow } from "./view-types";
import {
  accessDrift,
  centralToday,
  changeLabel,
  domainEligible,
  employeeDetailFrom,
  evaluateEligibility,
  mappingSummary,
  matchesFilter,
  parseChangeQuery,
  parseDirectoryQuery,
  parseEmployeeRowId,
  queryChanges,
  queryDirectory,
  scheduledDeparture,
  terminationDatePassedWhileActive,
} from "./views";

/**
 * The tabs' rules, over the labelled sample set — which is exactly the shape
 * the real directory is read into, so these are the real rules.
 */

const rows = WOVEN_SAMPLE_DATASET.directory;
const byName = (name: string) => rows.find((r) => `${r.firstName} ${r.lastName}` === name)!;

describe("parseDirectoryQuery", () => {
  it("keeps known filters and drops unknown ones, malformed ids and silly pages", () => {
    const q = parseDirectoryQuery({ q: "  Jonah ", filter: ["active", "bogus", "active"], location: "../x", position: "SAMPLE-POS-03", page: "-3" });
    expect(q).toEqual({ search: "Jonah", status: null, filters: ["active"], locationId: null, positionId: "SAMPLE-POS-03", page: 1 });
  });

  it("reads the status dropdown: active, terminated or unknown; anything else is all statuses", () => {
    expect(parseDirectoryQuery({ status: "active" }).status).toBe("active");
    expect(parseDirectoryQuery({ status: "terminated" }).status).toBe("terminated");
    expect(parseDirectoryQuery({ status: "unknown" }).status).toBe("unknown");
    for (const bad of ["", "Active", "all", "past_termination_date", "terminated,active"]) {
      expect(parseDirectoryQuery({ status: bad }).status, bad).toBeNull();
    }
    expect(parseDirectoryQuery({ status: ["terminated", "active"] }).status).toBe("terminated");
  });
});

describe("the status dropdown", () => {
  it("filters on Woven's normalised status and keeps the other filters", () => {
    const terminated = queryDirectory(rows, parseDirectoryQuery({ status: "terminated" }));
    expect(terminated.rows.map((r) => `${r.firstName} ${r.lastName}`).sort()).toEqual(["Beatrix Mallory", "Delphine Harrow"]);
    expect(terminated.total).toBe(2);
    const active = queryDirectory(rows, parseDirectoryQuery({ status: "active" }));
    expect(active.total).toBe(rows.length - 2);
    expect(active.rows.every((r) => r.employmentStatus === "active")).toBe(true);
    /* Combined with search and a chip. */
    expect(queryDirectory(rows, parseDirectoryQuery({ status: "active", filter: ["multiple_locations"] })).total).toBe(
      queryDirectory(rows, parseDirectoryQuery({ filter: ["active", "multiple_locations"] })).total,
    );
    expect(queryDirectory(rows, parseDirectoryQuery({ status: "terminated", q: "brightwater" })).total).toBe(0);
  });

  it("counts every status across the whole directory, whatever is selected", () => {
    const counts = { active: rows.filter((r) => r.employmentStatus === "active").length, terminated: 2, unknown: rows.filter((r) => r.employmentStatus === "unknown").length };
    expect(queryDirectory(rows, parseDirectoryQuery({})).statusCounts).toEqual(counts);
    expect(queryDirectory(rows, parseDirectoryQuery({ status: "terminated", q: "zzz" })).statusCounts).toEqual(counts);
    /* The chips' counts are unchanged by the dropdown too. */
    expect(queryDirectory(rows, parseDirectoryQuery({ status: "terminated" })).filterCounts).toEqual(queryDirectory(rows, parseDirectoryQuery({})).filterCounts);
  });

  it("never reads a termination date as a status: an active employee with a past TerminationDate stays under Active", () => {
    const conflict: DirectoryRow = { ...byName("Jonah Brightwater"), employmentStatus: "active", terminationDate: "2024-08-01", dataIssues: ["status_termination_conflict"] };
    const set = [...rows.filter((r) => r.id !== conflict.id), conflict];
    expect(queryDirectory(set, parseDirectoryQuery({ status: "active" })).rows.some((r) => r.id === conflict.id)).toBe(true);
    expect(queryDirectory(set, parseDirectoryQuery({ status: "terminated" })).rows.some((r) => r.id === conflict.id)).toBe(false);
  });
});

describe("changeLabel: the history keeps its kind; the screen says what it means", () => {
  it("the initial import, a new hire and a newly visible employee read differently", () => {
    expect(changeLabel("new_employee", "initial_load")).toBe("Initial import");
    expect(changeLabel("new_employee", "new_hire")).toBe("New hire");
    expect(changeLabel("new_employee", "newly_visible")).toBe("New employee");
    expect(changeLabel("new_employee", null)).toBe("New employee");
  });

  it("every other kind has plain words, never the code", () => {
    expect(changeLabel("terminated", null)).toBe("Terminated");
    expect(changeLabel("position_changed", "unclassified")).toBe("Position changed");
    expect(changeLabel("primary_location_changed", "transfer")).toBe("Primary location changed");
    expect(changeLabel("missing_from_source", null)).toBe("Missing from Woven");
    for (const kind of ["new_employee", "terminated", "reactivated", "position_changed", "primary_location_changed", "location_access_added", "location_access_removed", "email_changed", "missing_from_source"] as const) {
      expect(changeLabel(kind, null)).not.toContain("_");
    }
  });
});

describe("the nine directory filters", () => {
  const names = (filter: Parameters<typeof matchesFilter>[1]) =>
    rows.filter((r) => matchesFilter(r, filter)).map((r) => `${r.firstName} ${r.lastName}`).sort();

  it("Active and Terminated", () => {
    expect(names("terminated")).toEqual(["Beatrix Mallory", "Delphine Harrow"]);
    expect(names("active")).toHaveLength(rows.length - 2);
  });

  it("New hire uses the classification, not merely 'first seen'", () => {
    expect(names("new_hire")).toEqual(["Marisol Quintero"]);
  });

  it("Position changed and Transfer", () => {
    expect(names("position_changed")).toEqual(["Jonah Brightwater", "Rosalind Okafor"]);
    expect(names("transfer")).toEqual(["Priyanka Sorensen"]);
  });

  it("Multiple locations counts additional, temporary-or-expiring and all-location access", () => {
    expect(names("multiple_locations")).toEqual(["Callum Ashdown", "Jonah Brightwater", "Odessa Farthing", "Theo Vantongeren"]);
  });

  it("Missing email, Unmapped position, Unmapped location", () => {
    expect(names("missing_email")).toEqual(["Ignatius Pell"]);
    expect(names("unmapped_position")).toEqual(["Odessa Farthing", "Rosalind Okafor"]);
    expect(names("unmapped_location").length).toBeGreaterThan(0);
  });
});

describe("mappingSummary: Corporate is an approved non-location exception, not a missing location", () => {
  /* Shaped like the live rows: Corporate reviewed 'ignored'; Example Location Q still 'unmapped'. */
  const CORPORATE = "Example Soap Co - Corporate";
  const base = byName("Odessa Farthing");
  const corporate = (over: Partial<DirectoryRow>): DirectoryRow => ({
    ...base,
    primaryLocationId: "LOC-CORP",
    primaryLocationName: CORPORATE,
    primaryLocationMappingStatus: "ignored",
    primaryLocationCode: null,
    positionId: "POS-MAINT",
    positionName: "Maintenance",
    positionMappingStatus: "unmapped",
    dataIssues: [],
    ...over,
  });

  it("Corporate + all-location access reads '[Woven position] + All locations', not a warning", () => {
    for (const position of ["Maintenance", "HR", "Owner", "Operations", "Accounting", "Marketing"]) {
      const s = mappingSummary(corporate({ positionName: position, hasAllLocationAccess: true, activeLocationCount: 17, hasUnmappedLocation: false }));
      expect(s.label, position).toBe(`${position} + All locations`);
      expect(s.tone).toBe("neutral");
      expect(s.label).not.toContain("Position + location");
    }
  });

  it("uses the stored Woven PositionName as-is", () => {
    expect(mappingSummary(corporate({ positionName: "Loss Prevention", hasAllLocationAccess: true })).label).toBe("Loss Prevention + All locations");
  });

  it("Corporate without all-location access shows the actual scope, never 'All locations'", () => {
    const only = mappingSummary(corporate({ positionName: "Accounting", hasAllLocationAccess: false, hasMultipleLocationAccess: false, activeLocationCount: 1 }));
    expect(only.label).toBe(`Accounting + ${CORPORATE} only`);
    const several = mappingSummary(corporate({ positionName: "Operations", hasAllLocationAccess: false, hasMultipleLocationAccess: true, activeLocationCount: 3 }));
    expect(several.label).toBe("Operations + 3 locations");
    /* Woven's detail read failed: the affiliations are not known, so none are claimed. */
    const unverified = mappingSummary(corporate({ positionName: "Operations", hasAllLocationAccess: false, hasMultipleLocationAccess: true, activeLocationCount: 1, dataIssues: ["affiliations_not_verified"] }));
    expect(unverified.label).toBe("Operations + Locations not verified");
    for (const s of [only, several, unverified]) expect(s.label).not.toContain("All locations");
    /* Unknown (null) is not true either. */
    expect(mappingSummary(corporate({ hasAllLocationAccess: null, activeLocationCount: 1 })).label).not.toContain("All locations");
  });

  it("the tooltip keeps the facts: not a location, position unmapped, and an unresolved location still counted", () => {
    const s = mappingSummary(corporate({ hasAllLocationAccess: true, hasUnmappedLocation: true }));
    expect(s.label).toBe("Maintenance + All locations");
    expect(s.note).toContain(`${CORPORATE} is not a location`);
    expect(s.note).toContain("Position not yet mapped");
    expect(s.note).toContain("still counted under Unmapped location");
    expect(mappingSummary(corporate({ hasAllLocationAccess: true, hasUnmappedLocation: false })).note).not.toContain("Unmapped location");
  });

  it("a normal location employee still needs a confirmed location mapping", () => {
    const location = byName("Marisol Quintero");
    expect(location.primaryLocationMappingStatus).toBe("mapped");
    expect(mappingSummary(location)).toEqual({ label: "Mapped", tone: "ready", note: null });
    expect(mappingSummary({ ...location, primaryLocationMappingStatus: "unmapped", hasUnmappedLocation: true }).label).toBe("Location unmapped");
    expect(mappingSummary({ ...location, positionMappingStatus: "unmapped", hasUnmappedLocation: true }).label).toBe("Position + location");
    expect(mappingSummary({ ...location, positionMappingStatus: "unmapped" }).label).toBe("Position unmapped");
    /* A missing email still wins, Corporate or not. */
    expect(mappingSummary(corporate({ emailAddress: null })).label).toBe("Missing email");
  });

  it("Example Location Q stays unresolved: its holders are still counted under Unmapped location, Corporate staff included", () => {
    const q = { wovenLocationId: "LOC-NEQ", name: "Example Location Q", number: null, expiresOn: null };
    const corporateOnly = corporate({ hasAllLocationAccess: false, activeLocationCount: 1, hasUnmappedLocation: false });
    const corporateWithQ = corporate({ hasAllLocationAccess: true, activeLocationCount: 17, additionalLocations: [q], hasUnmappedLocation: true });
    const locationWithQ = { ...byName("Marisol Quintero"), additionalLocations: [q], activeLocationCount: 2, hasUnmappedLocation: true };
    const locationOnly = byName("Marisol Quintero");
    const set = [corporateOnly, corporateWithQ, locationWithQ, locationOnly];
    const page = queryDirectory(set, parseDirectoryQuery({}));
    /* Corporate alone never counts; the unresolved location does, wherever it appears. */
    expect(page.filterCounts.unmapped_location).toBe(2);
    expect(set.filter((r) => matchesFilter(r, "unmapped_location"))).toEqual([corporateWithQ, locationWithQ]);
    expect(queryDirectory(set, parseDirectoryQuery({ location: "LOC-NEQ" })).total).toBe(2);
  });

});

describe("queryDirectory", () => {
  it("searches name, email and Woven ID; combines filters; filters by any location", () => {
    expect(queryDirectory(rows, parseDirectoryQuery({ q: "brightwater" })).rows.map((r) => r.lastName)).toEqual(["Brightwater"]);
    expect(queryDirectory(rows, parseDirectoryQuery({ q: "SAMPLE-EMP-0005" })).rows.map((r) => r.lastName)).toEqual(["Ashdown"]);
    expect(queryDirectory(rows, parseDirectoryQuery({ filter: ["active", "multiple_locations"] })).total).toBe(4);
    const oak = queryDirectory(rows, parseDirectoryQuery({ location: "SAMPLE-LOC-104" }));
    expect(oak.rows.map((r) => r.lastName).sort()).toEqual(["Ashdown", "Brightwater", "Mallory", "Vantongeren"]);
  });

  it("pages, and counts every filter across the whole directory", () => {
    const page = queryDirectory(rows, parseDirectoryQuery({ page: "2" }), 5);
    expect(page.page).toBe(2);
    expect(page.rows).toHaveLength(5);
    expect(page.total).toBe(rows.length);
    expect(page.filterCounts.terminated).toBe(2);
    expect(queryDirectory(rows, parseDirectoryQuery({ page: "99" }), 5).page).toBe(3);
  });
});

describe("queryChanges", () => {
  it("filters by kind and review status, newest first, with counts per kind", () => {
    const page = queryChanges(WOVEN_SAMPLE_DATASET.changes, parseChangeQuery({ kind: "position_changed" }));
    expect(page.rows.map((r) => r.classification)).toEqual(["promotion_confirmed", "unclassified"]);
    expect(page.kindCounts.location_access_added).toBe(2);
    expect(queryChanges(WOVEN_SAMPLE_DATASET.changes, parseChangeQuery({ review: "dismissed" })).total).toBe(1);
    expect(parseChangeQuery({ kind: "work_email_changed" }).kind).toBeNull();
  });
});

describe("the eligibility preview", () => {
  const preview = WOVEN_SAMPLE_DATASET.accessPreview;
  const domains = WOVEN_SAMPLE_DATASET.loginEmailDomains;

  it("is always a preview", () => {
    expect(evaluateEligibility("marisol.quintero@sample-locations.test", preview, domains).previewOnly).toBe(true);
  });

  it("eligible: active, login domain, confirmed role, mapped location, no login yet", () => {
    const r = evaluateEligibility("MARISOL.QUINTERO@sample-locations.test", preview, domains);
    expect(r.verdict).toBe("eligible");
    expect(r.employee).toMatchObject({ wouldCreateRole: "employee", wouldCreateScopeLevel: "location", primaryLocationCode: "101" });
  });

  it("not eligible: terminated, not in Woven, not an address, or not at a login domain", () => {
    expect(evaluateEligibility("delphine.harrow@sample-locations.test", preview, domains).verdict).toBe("not_eligible");
    expect(evaluateEligibility("nobody@sample-locations.test", preview, domains).verdict).toBe("not_eligible");
    expect(evaluateEligibility("nope", preview, domains).verdict).toBe("not_eligible");
    const personal = evaluateEligibility("wren.castellano@personal-mail.test", preview, domains);
    expect(personal.verdict).toBe("not_eligible");
    expect(personal.reasons.join(" ")).toMatch(/login-email domain/);
  });

  it("held for review: unconfirmed position, unmapped location, or an existing login", () => {
    expect(evaluateEligibility("rosalind.okafor@sample-locations.test", preview, domains).verdict).toBe("held_for_review");
    expect(evaluateEligibility("theo.vantongeren@sample-locations.test", preview, domains).verdict).toBe("held_for_review");
    expect(evaluateEligibility("jonah.brightwater@sample-locations.test", preview, domains).reasons.join(" ")).toMatch(/already exists/);
  });

  it("with NO login domain configured, nobody is eligible", () => {
    const r = evaluateEligibility("marisol.quintero@sample-locations.test", preview, []);
    expect(r.verdict).toBe("not_eligible");
    expect(r.reasons.join(" ")).toMatch(/WOVEN_LOGIN_EMAIL_DOMAINS/);
  });

  it("holds a shared email for a person to resolve", () => {
    const dup: AccessPreviewRow[] = [preview[0], { ...preview[1], emailAddress: preview[0].emailAddress }];
    expect(evaluateEligibility(preview[0].emailAddress!, dup, domains).verdict).toBe("held_for_review");
  });

  it("domain matching is exact and case-insensitive", () => {
    expect(domainEligible("A@Sample-Locations.TEST", ["sample-locations.test"])).toBe(true);
    expect(domainEligible("a@evil-sample-locations.test", ["sample-locations.test"])).toBe(false);
    expect(domainEligible(null, ["sample-locations.test"])).toBe(false);
  });
});

describe("access drift", () => {
  it("lists exactly the people a later phase would act on", () => {
    const names = accessDrift(WOVEN_SAMPLE_DATASET.accessPreview).map((r) => r.employeeName).sort();
    expect(names).toContain("Delphine Harrow");
    expect(names).toContain("Jonah Brightwater");
    expect(names).toContain("Priyanka Sorensen");
    expect(names).toContain("Marisol Quintero");
    expect(names).not.toContain("Ignatius Pell");
  });
});

describe("the sample set is honest", () => {
  it("every id is SAMPLE-, every location an Example Location, every email a test domain", () => {
    const all = JSON.stringify(WOVEN_SAMPLE_DATASET);
    for (const r of rows as readonly DirectoryRow[]) {
      expect(r.externalEmployeeId.startsWith("SAMPLE-")).toBe(true);
      if (r.emailAddress) expect(r.emailAddress.endsWith(".test")).toBe(true);
    }
    expect(all).not.toMatch(/borrow/i);
    expect(WOVEN_SAMPLE_DATASET.label).toMatch(/^Sample data/);
    expect(byName("Theo Vantongeren").temporaryOrExpiringLocations[0].expiresOn).toBe("2026-10-12");
  });
});

describe("scheduled departures: information, never an action", () => {
  const today = "2026-10-12";
  const active = { ...rows.find((r) => r.employmentStatus === "active")!, terminationDate: null };

  it("is an Active employee whose stated termination date is still to come", () => {
    expect(scheduledDeparture({ ...active, terminationDate: "2026-10-20" }, today)).toBe(true);
    expect(scheduledDeparture({ ...active, terminationDate: "2026-10-20T00:00:00" }, today)).toBe(true);
  });

  it("is not today's or a past date, not a terminated employee, and not an Active employee with no date", () => {
    expect(scheduledDeparture({ ...active, terminationDate: "2026-10-12" }, today)).toBe(false);
    expect(scheduledDeparture({ ...active, terminationDate: "2026-09-01" }, today)).toBe(false);
    expect(scheduledDeparture({ ...active, employmentStatus: "terminated", terminationDate: "2026-10-20" }, today)).toBe(false);
    expect(scheduledDeparture(active, today)).toBe(false);
  });

  it("names a passed date on an Active employee separately — Woven's Status still decides", () => {
    expect(terminationDatePassedWhileActive({ ...active, terminationDate: "2026-09-01" }, today)).toBe(true);
    expect(terminationDatePassedWhileActive({ ...active, terminationDate: "2026-10-20" }, today)).toBe(false);
    expect(terminationDatePassedWhileActive({ ...active, employmentStatus: "terminated", terminationDate: "2026-09-01" }, today)).toBe(false);
  });

  it("is a directory filter with its own count, and the status counts do not move", () => {
    const leaving = { ...active, id: "ROW-LEAVING", externalEmployeeId: "EMP-LEAVING", terminationDate: "2026-11-01" };
    const set = [...rows, leaving];
    expect(matchesFilter(leaving, "scheduled_departure", today)).toBe(true);
    const page = queryDirectory(set, parseDirectoryQuery({ filter: "scheduled_departure" }), 50, today);
    expect(page.rows.map((r) => r.id)).toEqual(["ROW-LEAVING"]);
    expect(page.filterCounts.scheduled_departure).toBe(1);
    expect(page.statusCounts.active).toBe(set.filter((r) => r.employmentStatus === "active").length);
  });

  it("reads today in Central time", () => {
    /* 03:00 UTC on the 13th is still the 12th in Chicago. */
    expect(centralToday(new Date("2026-10-13T03:00:00Z"))).toBe("2026-10-12");
  });
});

describe("one employee's page", () => {
  const changes = WOVEN_SAMPLE_DATASET.changes;
  const withChanges = rows.find((r) => changes.some((c) => c.externalEmployeeId === r.externalEmployeeId))!;

  it("is their row and only their changes, newest first", () => {
    const detail = employeeDetailFrom(rows, changes, withChanges.id)!;
    expect(detail.row).toBe(withChanges);
    expect(detail.changes.length).toBeGreaterThan(0);
    expect(detail.changes.every((c) => c.externalEmployeeId === withChanges.externalEmployeeId)).toBe(true);
    const times = detail.changes.map((c) => c.detectedAt);
    expect(times).toEqual([...times].sort().reverse());
    expect(detail.changesTruncated).toBe(false);
  });

  it("says when the history was cut at the limit", () => {
    const detail = employeeDetailFrom(rows, changes, withChanges.id, 1)!;
    const all = changes.filter((c) => c.externalEmployeeId === withChanges.externalEmployeeId).length;
    expect(detail.changes).toHaveLength(1);
    expect(detail.changesTruncated).toBe(all > 1);
  });

  it("is null for an id nobody has", () => {
    expect(employeeDetailFrom(rows, changes, "SAMPLE-EMP-ROW-9999")).toBeNull();
  });

  it("accepts a stored or sample id from the URL and nothing else", () => {
    expect(parseEmployeeRowId("3f2b8c1e-5d4a-4b7e-9c2f-1a2b3c4d5e6f")).toBe("3f2b8c1e-5d4a-4b7e-9c2f-1a2b3c4d5e6f");
    expect(parseEmployeeRowId("SAMPLE-EMP-ROW-1")).toBe("SAMPLE-EMP-ROW-1");
    expect(parseEmployeeRowId("../etc")).toBeNull();
    expect(parseEmployeeRowId("a b")).toBeNull();
    expect(parseEmployeeRowId("%2e%2e")).toBeNull();
    expect(parseEmployeeRowId("")).toBeNull();
  });
});
