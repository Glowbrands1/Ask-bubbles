/**
 * VALIDATION FOR DIRECT (ADMIN API) ACCOUNT PROVISIONING — pure, no I/O.
 *
 * Used by `scripts/provision-user-direct.mjs`, which Node runs with type
 * stripping, so this file is erasable TypeScript only (no enums, no parameter
 * properties, no imports of aliased modules). It takes the roster as an
 * argument rather than importing it so it can be tested without one.
 *
 * What it refuses, and why:
 *   - an administrative role: this path exists to give a manager an account,
 *     never to mint an administrator. Admins go through User Management.
 *   - global scope: nobody provisioned this way is given every location.
 *   - an area that is not on the roster: an invented id would be stored as if it
 *     were an assignment. If the roster has no such area, the answer is "add it
 *     to the roster first", not a placeholder.
 */

export const PROVISIONABLE_ROLES = [
  "employee",
  "assistant_manager",
  "location_manager",
  "district_manager",
  "regional_manager",
] as const;

export type ProvisionableRole = (typeof PROVISIONABLE_ROLES)[number];
export type ProvisionScopeLevel = "region" | "district" | "location";

const PREFIX: Record<ProvisionScopeLevel, string> = {
  region: "reg-",
  district: "dist-",
  location: "loc-",
};

export interface DirectProvisionInput {
  email: string;
  displayName: string;
  role: string;
  scopeLevel: string;
  areaId: string;
  grantSwitch: boolean;
}

export interface Roster {
  locationIds: readonly string[];
  districtIds: readonly string[];
  regionIds: readonly string[];
}

export type DirectProvisionPlan = {
  email: string;
  displayName: string;
  role: ProvisionableRole;
  scopeLevel: ProvisionScopeLevel;
  areaId: string;
  grantSwitch: boolean;
};

export function validateDirectProvision(
  input: DirectProvisionInput,
  roster: Roster,
): { ok: true; plan: DirectProvisionPlan } | { ok: false; problems: string[] } {
  const problems: string[] = [];

  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push(`"${input.email}" is not an email address.`);

  const displayName = input.displayName.trim();
  if (!displayName) problems.push("A display name is required.");

  if (!(PROVISIONABLE_ROLES as readonly string[]).includes(input.role)) {
    problems.push(
      `Role "${input.role}" cannot be provisioned this way. Allowed: ${PROVISIONABLE_ROLES.join(", ")}. ` +
        "Administrative roles are never created by this script.",
    );
  }

  const level = input.scopeLevel;
  if (level === "global") {
    problems.push("Global scope is refused: nobody is provisioned this way with access to every location.");
  } else if (!["region", "district", "location"].includes(level)) {
    problems.push(`Scope level "${level}" is not one of region, district, location.`);
  }

  if (["region", "district", "location"].includes(level)) {
    const typed = level as ProvisionScopeLevel;
    const area = input.areaId.trim();
    const known =
      typed === "region" ? roster.regionIds : typed === "district" ? roster.districtIds : roster.locationIds;
    if (!area) {
      problems.push("An area id is required for a non-global scope.");
    } else if (!area.startsWith(PREFIX[typed])) {
      problems.push(`A ${typed} area id must start with "${PREFIX[typed]}" (got "${area}").`);
    } else if (!known.includes(area)) {
      problems.push(
        `"${area}" is not on the Ask Bubbles ${typed} roster (src/config/company/locations.ts). ` +
          "Add the real area to the roster first; this script does not accept an id the roster does not know.",
      );
    }
  }

  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    plan: {
      email,
      displayName,
      role: input.role as ProvisionableRole,
      scopeLevel: level as ProvisionScopeLevel,
      areaId: input.areaId.trim(),
      grantSwitch: input.grantSwitch,
    },
  };
}

/**
 * A temporary password the operator hands over once. Drawn from the system CSPRNG
 * with rejection sampling (no modulo bias), 24 characters, always satisfying a
 * mixed-class policy. The caller supplies the random source so tests are
 * deterministic.
 */
export function generateTemporaryPassword(randomByte: () => number): string {
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digit = "23456789";
  const symbol = "!@#$%^*-_=+";
  const all = lower + upper + digit + symbol;

  const pick = (set: string): string => {
    const limit = 256 - (256 % set.length);
    for (;;) {
      const b = randomByte();
      if (b < limit) return set[b % set.length];
    }
  };

  const chars = [pick(lower), pick(upper), pick(digit), pick(symbol)];
  while (chars.length < 24) chars.push(pick(all));
  // Fisher–Yates so the guaranteed classes are not always first.
  for (let i = chars.length - 1; i > 0; i--) {
    const limit = 256 - (256 % (i + 1));
    let b = randomByte();
    while (b >= limit) b = randomByte();
    const j = b % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
