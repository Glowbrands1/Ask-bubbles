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

/* ------------------------------------------------------------------ run -- */

/**
 * The slice of a Supabase Admin client this needs. Declared structurally so the
 * script passes the real `createClient(...)` result and tests pass a fake.
 */
export interface ProvisionAdminClient {
  auth: {
    admin: {
      createUser(attrs: { email: string; password: string; email_confirm: boolean }): Promise<{
        data: { user: { id: string } | null } | null;
        error: { message: string } | null;
      }>;
      deleteUser(id: string): Promise<{ error: { message: string } | null }>;
      listUsers(params: { page: number; perPage: number }): Promise<{
        data: { users: Array<{ email?: string | null }> } | null;
        error: { message: string } | null;
      }>;
    };
  };
  // The PostgREST builder is deliberately loose: it is chained dynamically.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any;
}

export type ProvisionErrorCode =
  | "profile_exists"
  | "auth_exists"
  | "read_failed"
  | "column_missing"
  | "create_failed"
  | "profile_failed"
  | "cleanup_failed";

export class DirectProvisionError extends Error {
  readonly code: ProvisionErrorCode;
  /** Set only for `cleanup_failed`: the auth user that still exists and needs deleting by hand. */
  readonly orphanedAuthUserId: string | null;
  constructor(code: ProvisionErrorCode, message: string, orphanedAuthUserId: string | null = null) {
    super(message);
    this.name = "DirectProvisionError";
    this.code = code;
    this.orphanedAuthUserId = orphanedAuthUserId;
  }
}

export interface DirectProvisionResult {
  subject: string;
  profile: {
    id: string;
    email: string;
    role: string;
    status: string;
    scope_level: string;
    scope_primary_area_id: string | null;
    can_switch_apps?: boolean;
  };
  /** Present only for a real run. Never logged by this module. */
  temporaryPassword: string | null;
  warnings: string[];
}

/**
 * Checks for duplicates and, unless `dryRun`, creates the credential then the
 * profile, undoing the credential if the profile cannot be written.
 *
 * NEVER DUPLICATES: a profile OR an auth user already holding the address stops
 * it before anything is written.
 *
 * CLEANUP IS CHECKED, NOT ASSUMED. supabase-js reports a failed deleteUser as a
 * returned `error`, not a throw, so a bare `.catch` would silently leave an
 * orphan. If the delete fails, this throws `cleanup_failed` carrying the id, so
 * the operator is told exactly which credential to remove.
 */
export async function runDirectProvision(
  admin: ProvisionAdminClient,
  plan: DirectProvisionPlan,
  options: { dryRun: boolean; randomByte: () => number },
): Promise<DirectProvisionResult | { dryRun: true }> {
  const profileRead = await admin
    .from("app_users")
    .select("id, role, status")
    .ilike("email", plan.email)
    .maybeSingle();
  if (profileRead.error) {
    throw new DirectProvisionError("read_failed", `Could not read app_users: ${profileRead.error.message}`);
  }
  if (profileRead.data) {
    throw new DirectProvisionError(
      "profile_exists",
      `A profile already exists for ${plan.email} (${profileRead.data.role}, ${profileRead.data.status}). Nothing changed.`,
    );
  }

  for (let page = 1; ; page += 1) {
    const listed = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (listed.error || !listed.data) {
      throw new DirectProvisionError("read_failed", `Could not list auth users: ${listed.error?.message ?? "no data"}`);
    }
    if (listed.data.users.some((u) => u.email?.toLowerCase() === plan.email)) {
      throw new DirectProvisionError(
        "auth_exists",
        `An auth account already exists for ${plan.email} with no profile. Resolve it deliberately (nothing was changed); this script will not adopt or duplicate it.`,
      );
    }
    if (listed.data.users.length < 200) break;
  }

  if (plan.grantSwitch) {
    const column = await admin.from("app_users").select("can_switch_apps").limit(1);
    if (column.error) {
      throw new DirectProvisionError(
        "column_missing",
        "app_users.can_switch_apps is missing. Apply migration 20261013002000_app_switcher_grant.sql first.",
      );
    }
  }

  if (options.dryRun) return { dryRun: true };

  const temporaryPassword = generateTemporaryPassword(options.randomByte);
  const made = await admin.auth.admin.createUser({ email: plan.email, password: temporaryPassword, email_confirm: true });
  if (made.error || !made.data?.user) {
    throw new DirectProvisionError("create_failed", `Supabase refused to create the account: ${made.error?.message ?? "no user returned"}`);
  }
  const subject = made.data.user.id;

  const inserted = await admin
    .from("app_users")
    .insert({
      id: subject,
      email: plan.email,
      display_name: plan.displayName,
      role: plan.role,
      status: "active",
      scope_level: plan.scopeLevel,
      scope_primary_area_id: plan.areaId,
      scope_also_covers_area_ids: [],
      ...(plan.grantSwitch ? { can_switch_apps: true } : {}),
    })
    .select("id, email, role, status, scope_level, scope_primary_area_id")
    .single();

  if (inserted.error || !inserted.data) {
    let cleanupError: string | null = null;
    try {
      const removed = await admin.auth.admin.deleteUser(subject);
      if (removed.error) cleanupError = removed.error.message;
    } catch (thrown) {
      cleanupError = thrown instanceof Error ? thrown.message : String(thrown);
    }
    if (cleanupError) {
      throw new DirectProvisionError(
        "cleanup_failed",
        `The profile could not be created AND the auth account could not be removed again (${cleanupError}). ` +
          `Delete auth user ${subject} (${plan.email}) by hand before re-running.`,
        subject,
      );
    }
    throw new DirectProvisionError(
      "profile_failed",
      `The profile could not be created, so the auth account was removed again: ${inserted.error?.message ?? "no row returned"}`,
    );
  }

  const warnings: string[] = [];
  const audit = await admin.from("app_user_audit").insert({
    target_user_id: subject,
    target_email: plan.email,
    actor_user_id: null,
    actor_email: "direct-provision script",
    action: "invited",
    to_value: plan.role,
  });
  if (audit?.error) warnings.push(`The account was created but the audit row could not be written: ${audit.error.message}`);

  return {
    subject,
    profile: { ...inserted.data, ...(plan.grantSwitch ? { can_switch_apps: true } : {}) },
    temporaryPassword,
    warnings,
  };
}
