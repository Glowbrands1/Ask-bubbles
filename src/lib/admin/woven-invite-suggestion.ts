import { OTHER_BRAND_TITLE_MARKERS } from "@/config/company/google-reviews";
import { suggestLocations } from "@/lib/admin/woven-account-suggest";
import { observedStatus } from "@/lib/employees/woven/status-evidence";
import type { DirectoryRow, LocationMappingRow, PositionMappingRow } from "@/lib/employees/woven/view-types";
import { employeeName } from "@/lib/employees/woven/views";
import { ADMIN_CONSOLE_ROLES, ROLES } from "@/lib/permissions";
import type { Role, ScopeLevel } from "@/types";

/**
 * ============================================================================
 * WHAT WOVEN CAN SUGGEST FOR AN INVITATION — and what it deliberately cannot
 * ============================================================================
 *
 * Pure: a directory row plus the two person-reviewed mappings in, a suggestion
 * out. It reads and writes nothing. The Invite dialog shows it, the
 * administrator presses "Apply" (nothing fills in on its own), everything stays
 * editable, and the server validates the final request exactly as it would one
 * typed by hand.
 *
 * Locations reuse `suggestLocations`, so the matching rule is the SAME as the
 * "Create an account for a Woven employee" flow: a Woven location counts only
 * when an administrator mapped it to a roster location — never by name or by
 * Woven's raw number — and temporary or expiring access never feeds it.
 *
 * Every value is suggested only when reliable; otherwise it is left out with a
 * note. NEVER SUGGESTED, whatever Woven says:
 *   - an administrative role (admin, owner, developer);
 *   - a global scope (Woven's "all locations" is shown as a note only);
 *   - a role for an employee who has a protected role override;
 *   - anything for somebody not Active in the latest read, or whose Woven
 *     location belongs to another brand, or whose email is shared.
 */

export type SuggestedScopeLevel = Exclude<ScopeLevel, "global">;

export interface InviteSuggestionValues {
  displayName: string | null;
  role: Role | null;
  scopeLevel: SuggestedScopeLevel | null;
  primaryAreaId: string | null;
  additionalAreaIds: string[];
}

export type InviteSuggestion =
  | { status: "not_found" }
  | { status: "ambiguous"; reason: string }
  | {
      status: "found";
      employee: { name: string; positionName: string | null; primaryLocationName: string | null; employmentStatus: string };
      /** Null when nothing may be suggested. */
      suggestion: InviteSuggestionValues | null;
      /** Why a value was left out. Never contains an id or an email. */
      notes: string[];
    };

const BREADTH: Record<SuggestedScopeLevel, number> = { location: 0, district: 1, region: 2 };

/** The reach each suggestible role naturally has. Roles not listed are never suggested. */
const NATURAL_LEVEL: Partial<Record<Role, SuggestedScopeLevel>> = {
  employee: "location",
  assistant_manager: "location",
  location_manager: "location",
  district_manager: "district",
  regional_manager: "region",
};

const lower = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();
const squash = (value: string | null) => (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function inviteSuggestionForEmail(
  email: string,
  directory: readonly DirectoryRow[],
  positions: readonly PositionMappingRow[],
  locations: readonly LocationMappingRow[],
  overriddenEmployeeIds: ReadonlySet<string> = new Set(),
): InviteSuggestion {
  const wanted = lower(email);
  if (!wanted) return { status: "not_found" };

  const matches = directory.filter((row) => lower(row.emailAddress) === wanted);
  if (matches.length === 0) return { status: "not_found" };
  if (matches.length > 1) {
    return {
      status: "ambiguous",
      reason: "More than one Woven employee has this email address, so nothing is suggested. Choose the values yourself.",
    };
  }

  const row = matches[0]!;
  const name = employeeName(row);
  const status = observedStatus(row);
  const employee = { name, positionName: row.positionName, primaryLocationName: row.primaryLocationName, employmentStatus: status };

  if (status !== "active") {
    return {
      status: "found",
      employee,
      suggestion: null,
      notes: [
        status === "terminated"
          ? "Woven shows this person as terminated, so nothing is suggested."
          : "Woven did not confirm this person as active in its latest read, so nothing is suggested.",
      ],
    };
  }
  if (row.dataIssues.includes("status_termination_conflict")) {
    return { status: "found", employee, suggestion: null, notes: ["Woven shows a termination date for this person, so nothing is suggested."] };
  }
  if (OTHER_BRAND_TITLE_MARKERS.some((marker) => squash(row.primaryLocationName).includes(squash(marker)))) {
    return { status: "found", employee, suggestion: null, notes: ["This person's Woven location belongs to another brand, so nothing is suggested."] };
  }

  const notes: string[] = [];
  const values: InviteSuggestionValues = {
    displayName: name === "(no name in Woven)" ? null : name,
    role: null,
    scopeLevel: null,
    primaryAreaId: null,
    additionalAreaIds: [],
  };
  if (!values.displayName) notes.push("Woven has no name for this person.");

  /* ------------------------------------------------------------ role ---- */
  const position = row.positionId ? positions.find((p) => p.wovenPositionId === row.positionId) : undefined;
  const mappedRole = position && position.isConfirmed && position.status === "mapped" ? position.role : null;
  if (overriddenEmployeeIds.has(row.externalEmployeeId)) {
    notes.push("This person has a protected role override, so no role is suggested.");
  } else if (!position || !mappedRole) {
    notes.push(
      row.positionName
        ? `Woven position "${row.positionName}" has not been confirmed for an Ask Bubbles role, so no role is suggested.`
        : "Woven has no position for this person, so no role is suggested.",
    );
  } else if (!(ROLES as readonly string[]).includes(mappedRole)) {
    notes.push("The role mapped to this position is not one Ask Bubbles recognises, so no role is suggested.");
  } else if ((ADMIN_CONSOLE_ROLES as readonly string[]).includes(mappedRole) || !NATURAL_LEVEL[mappedRole as Role]) {
    notes.push("Woven never suggests an administrative or corporate role. Choose the role yourself if one is intended.");
  } else {
    values.role = mappedRole as Role;
  }

  /* ----------------------------------------------------------- scope ---- */
  if (values.role) {
    const natural = NATURAL_LEVEL[values.role]!;
    const mapped = position?.scopeLevel;
    const narrower =
      mapped && mapped !== "global" && mapped in BREADTH && BREADTH[mapped as SuggestedScopeLevel] < BREADTH[natural]
        ? (mapped as SuggestedScopeLevel)
        : null;
    values.scopeLevel = narrower ?? natural;
  }

  /* ------------------------------------------------------- locations ---- */
  const woven = suggestLocations(row, locations);
  if (woven.hasAllLocationAccess) {
    notes.push("Woven marks this person as having access to all locations. That is never suggested; choose Everything yourself if intended.");
  }

  if (values.scopeLevel === "location") {
    if (woven.primary?.areaId) values.primaryAreaId = woven.primary.areaId;
    else
      notes.push(
        woven.primary
          ? `Woven's primary location${woven.primary.name ? ` "${woven.primary.name}"` : ""} has not been matched to an Ask Bubbles location, so no primary area is suggested.`
          : "Woven has no primary location for this person, so no primary area is suggested.",
      );
  } else if (values.scopeLevel) {
    notes.push(`Woven names a location, not a ${values.scopeLevel}, so choose the ${values.scopeLevel} yourself.`);
  }

  const additional = new Set<string>();
  const unmatched: string[] = [];
  for (const entry of woven.additional) {
    if (entry.areaId) {
      if (entry.areaId !== values.primaryAreaId) additional.add(entry.areaId);
    } else {
      unmatched.push(entry.name ?? "an unnamed location");
    }
  }
  values.additionalAreaIds = [...additional];
  if (unmatched.length > 0) {
    notes.push(`Not suggested, because they are not matched to an Ask Bubbles location: ${unmatched.join(", ")}.`);
  }
  if (woven.temporary.length > 0) notes.push("Temporary or expiring locations in Woven are never suggested.");

  return { status: "found", employee, suggestion: values, notes };
}
