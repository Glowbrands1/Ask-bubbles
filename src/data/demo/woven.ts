import type {
  AccessPreviewRow,
  ChangeRow,
  DirectoryRow,
  LocationMappingRow,
  PositionMappingRow,
  RunRow,
  WovenSampleDataset,
} from "@/lib/employees/woven/view-types";

/**
 * ============================================================================
 * WOVEN EMPLOYEE SYNC — LABELLED SAMPLE DATA, FOR DEMO BUILDS ONLY
 * ============================================================================
 *
 * EVERY RECORD HERE IS INVENTED. The people, emails, locations, positions, runs
 * and changes do not come from Woven and describe nobody. Every id starts with
 * `SAMPLE-`, every location is a fictional "Example Location", every position is
 * a generic store title, and every email is at `sample-locations.test`, a
 * reserved test domain.
 *
 * REACHABLE FROM EXACTLY ONE PLACE: `lib/demo/runtime.demo.ts`, the demo side
 * of the build-time boundary. A production build never imports that module,
 * so none of this is compiled into it. `scripts/verify-no-demo-in-bundle.mjs`
 * fails a build whose output carries any of these names.
 *
 * It is never written to a table. The Woven screens render it IN PLACE OF the
 * database, under a "Sample data — not from Woven" banner, and every action
 * that would write is disabled while it is shown.
 */

const DOMAIN = "sample-locations.test";
const DAY = "2026-09-29";
const RUN_1 = "SAMPLE-RUN-0118";
const RUN_2 = "SAMPLE-RUN-0117";
const RUN_3 = "SAMPLE-RUN-0116";

const loc = {
  north: { wovenLocationId: "SAMPLE-LOC-101", name: "Example Location 101", number: "101" },
  river: { wovenLocationId: "SAMPLE-LOC-102", name: "Example Location 102", number: "102" },
  lake: { wovenLocationId: "SAMPLE-LOC-103", name: "Example Location 103", number: "103" },
  oak: { wovenLocationId: "SAMPLE-LOC-104", name: "Example Location 104", number: "104" },
  office: { wovenLocationId: "SAMPLE-LOC-900", name: "Example Support Office", number: "HQ" },
};

type Loc = (typeof loc)[keyof typeof loc];
const locationCode = (l: Loc) => (l === loc.oak || l === loc.office ? null : l.number);
/*
 * 101 and 102 are reviewed and mapped; 103 is unreviewed with an exact-number
 * suggestion; 104 has no roster match. The support office is left unreviewed,
 * so the Locations tab can show "Suggest ignore".
 */
const mapStatus = (l: Loc): DirectoryRow["primaryLocationMappingStatus"] => (l === loc.office || l === loc.oak ? "unmapped" : "mapped");

function person(
  n: number,
  first: string,
  last: string,
  over: Partial<DirectoryRow> & { primary: Loc; position: [string, string, DirectoryRow["positionMappingStatus"]] },
): DirectoryRow {
  const { primary, position, ...rest } = over;
  return {
    id: `SAMPLE-EMP-ROW-${n}`,
    externalEmployeeId: `SAMPLE-EMP-${String(n).padStart(4, "0")}`,
    firstName: first,
    lastName: last,
    preferredFirstName: null,
    emailAddress: `${first.toLowerCase()}.${last.toLowerCase()}@${DOMAIN}`,
    employmentStatus: "active",
    positionId: position[0],
    positionName: position[1],
    positionMappingStatus: position[2],
    primaryLocationId: primary.wovenLocationId,
    primaryLocationName: primary.name,
    primaryLocationMappingStatus: mapStatus(primary),
    primaryLocationCode: locationCode(primary),
    additionalLocations: [],
    temporaryOrExpiringLocations: [],
    activeLocationCount: 1,
    hasUnmappedLocation: locationCode(primary) === null && primary !== loc.office,
    hasMultipleLocationAccess: false,
    hasAllLocationAccess: false,
    hireDate: "2023-04-17",
    terminationDate: null,
    dataIssues: [],
    missingSyncCount: 0,
    lastSeenAt: `${DAY}T10:31:00Z`,
    lastSyncedAt: `${DAY}T10:32:00Z`,
    lastChangeKind: null,
    lastChangeClassification: null,
    lastChangeAt: null,
    recentChangeKinds: [],
    ...rest,
  };
}

const P = {
  member: ["SAMPLE-POS-01", "Team Member", "mapped"] as [string, string, "mapped"],
  asm: ["SAMPLE-POS-02", "Assistant Manager", "mapped"] as [string, string, "mapped"],
  lm: ["SAMPLE-POS-03", "Location Manager", "mapped"] as [string, string, "mapped"],
  dm: ["SAMPLE-POS-04", "District Manager", "mapped"] as [string, string, "mapped"],
  lead: ["SAMPLE-POS-05", "Lead Team Member", "unmapped"] as [string, string, "unmapped"],
  trainer: ["SAMPLE-POS-06", "Trainer", "unmapped"] as [string, string, "unmapped"],
};

const directory: DirectoryRow[] = [
  person(1, "Marisol", "Quintero", {
    primary: loc.north,
    position: P.member,
    hireDate: "2026-09-22",
    lastChangeKind: "new_employee",
    lastChangeClassification: "new_hire",
    lastChangeAt: `${DAY}T10:32:00Z`,
    recentChangeKinds: ["new_hire"],
  }),
  person(2, "Jonah", "Brightwater", {
    primary: loc.lake,
    position: P.lm,
    additionalLocations: [{ ...loc.oak }],
    activeLocationCount: 2,
    hasMultipleLocationAccess: true,
    hasUnmappedLocation: true,
    hireDate: "2021-03-04",
    lastChangeKind: "position_changed",
    lastChangeAt: `${DAY}T10:32:00Z`,
    recentChangeKinds: ["position_changed"],
  }),
  person(3, "Delphine", "Harrow", {
    primary: loc.river,
    position: P.asm,
    employmentStatus: "terminated",
    hireDate: "2023-06-12",
    terminationDate: "2026-09-26",
    lastChangeKind: "terminated",
    lastChangeAt: `${DAY}T10:32:00Z`,
    recentChangeKinds: ["terminated"],
  }),
  person(4, "Priyanka", "Sorensen", {
    primary: loc.river,
    position: P.lm,
    hireDate: "2022-01-09",
    lastChangeKind: "primary_location_changed",
    lastChangeAt: `${DAY}T10:32:00Z`,
    recentChangeKinds: ["primary_location_changed"],
  }),
  person(5, "Callum", "Ashdown", {
    primary: loc.north,
    position: P.dm,
    additionalLocations: [{ ...loc.river }, { ...loc.lake }, { ...loc.oak }],
    activeLocationCount: 4,
    hasMultipleLocationAccess: true,
    hasUnmappedLocation: true,
    hireDate: "2019-08-01",
    lastChangeKind: "location_access_added",
    lastChangeAt: `${DAY}T10:32:00Z`,
    recentChangeKinds: ["location_access_added", "location_access_removed"],
  }),
  person(6, "Theo", "Vantongeren", {
    primary: loc.oak,
    position: P.member,
    temporaryOrExpiringLocations: [{ ...loc.lake, expiresOn: "2026-10-12" }],
    activeLocationCount: 2,
    hasMultipleLocationAccess: true,
    hireDate: "2025-05-18",
    lastChangeKind: "location_access_added",
    lastChangeAt: "2026-09-28T10:31:00Z",
    recentChangeKinds: ["location_access_added"],
  }),
  person(7, "Rosalind", "Okafor", {
    primary: loc.lake,
    position: P.lead,
    hireDate: "2024-02-02",
    dataIssues: ["unmapped_position"],
    lastChangeKind: "position_changed",
    lastChangeAt: `${DAY}T10:32:00Z`,
    recentChangeKinds: ["position_changed"],
  }),
  person(8, "Emeric", "Lindqvist", {
    primary: loc.north,
    position: P.asm,
    hireDate: "2022-11-30",
    lastChangeKind: "reactivated",
    lastChangeAt: "2026-09-27T10:31:00Z",
    recentChangeKinds: ["reactivated"],
  }),
  person(9, "Beatrix", "Mallory", {
    primary: loc.oak,
    position: P.member,
    employmentStatus: "terminated",
    hireDate: "2024-04-14",
    terminationDate: "2026-08-30",
    lastChangeKind: "email_changed",
    lastChangeAt: "2026-09-26T10:30:00Z",
  }),
  person(10, "Ignatius", "Pell", {
    primary: loc.north,
    position: P.member,
    emailAddress: null,
    hireDate: "2025-07-07",
    dataIssues: ["missing_email"],
  }),
  person(11, "Wren", "Castellano", {
    primary: loc.river,
    position: P.member,
    emailAddress: "wren.castellano@personal-mail.test",
    hireDate: "2024-10-01",
  }),
  person(12, "Odessa", "Farthing", {
    primary: loc.office,
    position: P.trainer,
    hasAllLocationAccess: true,
    hasUnmappedLocation: false,
    hireDate: "2020-05-11",
    dataIssues: ["unmapped_position"],
  }),
];

const change = (
  n: number,
  who: DirectoryRow,
  kind: ChangeRow["kind"],
  classification: string | null,
  fromValue: unknown,
  toValue: unknown,
  extra: Partial<ChangeRow> = {},
): ChangeRow => ({
  id: `SAMPLE-CHG-${String(n).padStart(3, "0")}`,
  employeeName: `${who.firstName} ${who.lastName}`,
  externalEmployeeId: who.externalEmployeeId,
  kind,
  fieldName: null,
  classification,
  fromValue,
  toValue,
  effectiveDate: null,
  detectedAt: `${DAY}T10:32:00Z`,
  syncRunId: RUN_1,
  reviewStatus: "unreviewed",
  ...extra,
});

const [marisol, jonah, delphine, priyanka, callum, theo, rosalind, emeric, beatrix] = directory;

const changes: ChangeRow[] = [
  change(1, marisol, "new_employee", "new_hire", null, { positionName: P.member[1], primaryLocationName: loc.north.name }, { effectiveDate: "2026-09-22" }),
  change(2, delphine, "terminated", null, { employmentStatus: "active" }, { employmentStatus: "terminated" }, { fieldName: "employment_status", effectiveDate: "2026-09-26" }),
  change(3, jonah, "position_changed", "promotion_confirmed", { positionName: P.asm[1] }, { positionName: P.lm[1] }, { fieldName: "position_id", reviewStatus: "acknowledged" }),
  change(4, rosalind, "position_changed", "unclassified", { positionName: P.member[1] }, { positionName: `${P.lead[1]} (not mapped)` }, { fieldName: "position_id" }),
  change(5, priyanka, "primary_location_changed", "transfer", { primaryLocationName: loc.lake.name }, { primaryLocationName: loc.river.name }, { fieldName: "primary_woven_location_id" }),
  change(6, callum, "location_access_added", "additional", null, { locationName: loc.oak.name, accessType: "additional" }, { fieldName: `location:${loc.oak.wovenLocationId}` }),
  change(7, theo, "location_access_added", "temporary_or_expiring_access", null, { locationName: loc.lake.name, expiresOn: "2026-10-12" }, {
    fieldName: `location:${loc.lake.wovenLocationId}`,
    detectedAt: "2026-09-28T10:31:00Z",
    syncRunId: RUN_2,
  }),
  change(8, callum, "location_access_removed", "expired", { locationName: "Example Location 105", expiresOn: "2026-09-27" }, null, {
    fieldName: "location:SAMPLE-LOC-105",
    effectiveDate: "2026-09-27",
    detectedAt: "2026-09-28T10:31:00Z",
    syncRunId: RUN_2,
    reviewStatus: "dismissed",
  }),
  change(9, emeric, "reactivated", "rehire", { employmentStatus: "terminated" }, { employmentStatus: "active" }, {
    fieldName: "employment_status",
    effectiveDate: "2026-09-25",
    detectedAt: "2026-09-27T10:31:00Z",
    syncRunId: RUN_3,
    reviewStatus: "acknowledged",
  }),
  change(10, beatrix, "email_changed", null, { emailAddress: `b.mallory@${DOMAIN}` }, { emailAddress: `beatrix.mallory@${DOMAIN}` }, {
    fieldName: "email_address",
    detectedAt: "2026-09-26T10:30:00Z",
    syncRunId: "SAMPLE-RUN-0115",
    reviewStatus: "acknowledged",
  }),
];

const run = (id: string, startedAt: string, over: Partial<RunRow>): RunRow => ({
  id,
  startedAt,
  finishedAt: startedAt.replace(":30:", ":32:"),
  status: "succeeded",
  sourceMode: "scheduled_poll",
  employeesFetched: 12,
  employeesAdded: 0,
  employeesUpdated: 0,
  newHires: 0,
  terminations: 0,
  positionChanges: 0,
  confirmedPromotionsDemotions: 0,
  transfers: 0,
  locationAccessChanges: 0,
  errorCount: 0,
  errorCode: null,
  errorDetail: null,
  ...over,
});

const runs: RunRow[] = [
  run(RUN_1, `${DAY}T10:30:00Z`, { employeesAdded: 1, employeesUpdated: 5, newHires: 1, terminations: 1, positionChanges: 2, confirmedPromotionsDemotions: 1, transfers: 1, locationAccessChanges: 1 }),
  run(RUN_2, "2026-09-28T10:30:00Z", { employeesUpdated: 2, locationAccessChanges: 2 }),
  run("SAMPLE-RUN-0119", "2026-09-27T19:14:00Z", {
    status: "rejected",
    sourceMode: "manual_poll",
    employeesFetched: 3,
    finishedAt: "2026-09-27T19:14:40Z",
    errorCount: 1,
    errorCode: "unexpectedly_small",
    errorDetail: "Only 3 active employees arrived, against 11 on file; at least 9 (80%) are required before a sync is trusted.",
  }),
  run(RUN_3, "2026-09-27T10:30:00Z", { employeesUpdated: 1 }),
  run("SAMPLE-RUN-0115", "2026-09-26T10:30:00Z", {
    status: "failed",
    employeesFetched: 0,
    errorCount: 1,
    errorCode: "woven_server_error",
    errorDetail: "Woven failed /employees (HTTP 503) after 3 retries.",
  }),
];

const locations: LocationMappingRow[] = [
  { ...mapRow(loc.north, "mapped", "101"), employeeCount: 5 },
  { ...mapRow(loc.river, "mapped", "102"), employeeCount: 4 },
  { ...mapRow(loc.lake, "unmapped", null, "103"), employeeCount: 4 },
  { ...mapRow(loc.oak, "unmapped", null, null), employeeCount: 4 },
  { ...mapRow(loc.office, "unmapped", null, null), employeeCount: 1, isNonLocation: true, districtName: null, regionName: null },
];

function mapRow(l: Loc, status: LocationMappingRow["status"], location: string | null, suggested: string | null = null): LocationMappingRow {
  return {
    wovenLocationId: l.wovenLocationId,
    name: l.name,
    displayName: l.name,
    number: l.number,
    districtName: l === loc.north || l === loc.river ? "Example North District" : "Example South District",
    regionName: "Example Central Region",
    isClosed: false,
    isNonLocation: false,
    employeeCount: 0,
    status,
    locationCode: location,
    locationName: location ? l.name : null,
    suggestedLocationCode: suggested,
    suggestedLocationName: suggested ? l.name : null,
    reviewedBy: status === "mapped" ? "admin:sample-reviewer" : null,
    reviewedAt: status === "mapped" ? "2026-09-24T15:00:00Z" : null,
  };
}

const positions: PositionMappingRow[] = [
  pos(P.member, 5, "employee", "location", 10),
  pos(P.asm, 2, "assistant_manager", "location", 20),
  pos(P.lm, 2, "location_manager", "location", 30),
  pos(P.dm, 1, "district_manager", "district", 40),
  pos(P.lead, 1, null, null, null),
  pos(P.trainer, 1, null, null, null),
];

function pos(p: [string, string, string], count: number, role: string | null, scope: string | null, rank: number | null): PositionMappingRow {
  const mapped = role !== null;
  return {
    wovenPositionId: p[0],
    name: p[1],
    employeeCount: count,
    status: mapped ? "mapped" : "unmapped",
    role,
    scopeLevel: scope,
    hierarchyRank: rank,
    isConfirmed: mapped,
    reviewedBy: mapped ? "admin:sample-reviewer" : null,
    reviewedAt: mapped ? "2026-09-24T15:05:00Z" : null,
  };
}

const roleFor: Record<string, string> = Object.fromEntries(positions.filter((p) => p.role).map((p) => [p.wovenPositionId, p.role!]));
const scopeFor: Record<string, string> = Object.fromEntries(positions.filter((p) => p.scopeLevel).map((p) => [p.wovenPositionId, p.scopeLevel!]));

/** Which sample people "have" an Ask Bubbles login, and how it differs from Woven. */
const logins: Record<string, { role: string; status: string; scope: string; area: string }> = {
  "SAMPLE-EMP-0002": { role: "assistant_manager", status: "active", scope: "location", area: "loc-103" },
  "SAMPLE-EMP-0003": { role: "assistant_manager", status: "active", scope: "location", area: "loc-102" },
  "SAMPLE-EMP-0004": { role: "location_manager", status: "active", scope: "location", area: "loc-103" },
  "SAMPLE-EMP-0005": { role: "district_manager", status: "active", scope: "district", area: "dist-example-north" },
};

const accessPreview: AccessPreviewRow[] = directory.map((d) => {
  const login = logins[d.externalEmployeeId];
  const confirmed = d.positionMappingStatus === "mapped";
  const role = confirmed && d.positionId ? roleFor[d.positionId] ?? null : null;
  const eligibleDomain = d.emailAddress?.endsWith(`@${DOMAIN}`) ?? false;
  return {
    employeeId: d.id,
    externalEmployeeId: d.externalEmployeeId,
    employeeName: `${d.firstName} ${d.lastName}`,
    employmentStatus: d.employmentStatus,
    emailAddress: d.emailAddress,
    emailIsDuplicated: false,
    emailDomainEligible: eligibleDomain,
    positionMappingConfirmed: confirmed,
    mappedRole: role,
    mappedScopeLevel: confirmed && d.positionId ? scopeFor[d.positionId] ?? null : null,
    mappedPrimaryLocationCode: d.primaryLocationCode,
    appUserRole: login?.role ?? null,
    appUserStatus: login?.status ?? null,
    appUserScopeLevel: login?.scope ?? null,
    appUserScopePrimaryAreaId: login?.area ?? null,
    hasLogin: login !== undefined,
    wouldProvision:
      !login && d.employmentStatus === "active" && eligibleDomain && confirmed && d.primaryLocationCode !== null,
    wouldDeactivate: !!login && d.employmentStatus === "terminated" && login.status !== "disabled",
    roleDiffers: !!login && confirmed && role !== login.role,
    primaryLocationDiffers:
      !!login && login.scope === "location" && d.primaryLocationCode !== null && login.area !== `loc-${d.primaryLocationCode}`,
    roleOverride: null,
    effectiveRole: role,
    effectiveScopeLevel: confirmed && d.positionId ? scopeFor[d.positionId] ?? null : null,
    roleSource: confirmed ? "position" : "none",
  };
});

export const WOVEN_SAMPLE_DATASET: WovenSampleDataset = {
  label: "Sample data — invented records, not from Woven",
  overview: {
    lastSuccessAt: `${DAY}T10:32:00Z`,
    lastAttemptAt: `${DAY}T10:30:00Z`,
    lastAttemptStatus: "succeeded",
    totalActive: directory.filter((d) => d.employmentStatus === "active").length,
    totalTerminated: directory.filter((d) => d.employmentStatus === "terminated").length,
    totalStatusUnknown: 0,
    newHiresSinceLast: 1,
    initialLoadCount: null,
    terminationsSinceLast: 1,
    positionChangesSinceLast: 2,
    confirmedPromotionsDemotionsSinceLast: 1,
    transfersSinceLast: 1,
    locationAccessAddedSinceLast: 1,
    locationAccessRemovedSinceLast: 0,
    lastRunErrorCount: 0,
    recordsWithIssues: directory.filter((d) => d.dataIssues.length > 0).length,
    unmappedLocations: locations.filter((l) => l.status === "unmapped").length,
    unmappedPositions: positions.filter((p) => p.status === "unmapped").length,
    employeesMissingEmail: directory.filter((d) => d.emailAddress === null).length,
    unreviewedChanges: changes.filter((c) => c.reviewStatus === "unreviewed").length,
    recentRuns: [
      ...Array.from({ length: 9 }, () => ({ status: "succeeded" as const, employeesFetched: 12 })),
      { status: "failed", employeesFetched: 0 },
      { status: "succeeded", employeesFetched: 12 },
      { status: "rejected", employeesFetched: 3 },
      { status: "succeeded", employeesFetched: 12 },
      { status: "succeeded", employeesFetched: 12 },
    ],
  },
  directory,
  changes,
  runs,
  locations,
  positions,
  accessPreview,
  loginEmailDomains: [DOMAIN],
};

/** Every invented name in this file, for the bundle guard. */
export const WOVEN_SAMPLE_NAMES = directory.map((d) => `${d.firstName} ${d.lastName}`);
