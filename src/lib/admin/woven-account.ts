import "server-only";

import { WOVEN_TENANT } from "@/config/company/woven";
import { OTHER_BRAND_TITLE_MARKERS } from "@/config/company/google-reviews";
import { assertCanGrant, createAccountWithoutEmail } from "@/lib/admin/create-account";
import { loadAccessPlan } from "@/lib/employees/woven/access/load";
import { AUTO_PROVISION_ROLES } from "@/lib/employees/woven/access/plan";
import type { PlannedRow } from "@/lib/employees/woven/access/types";
import { DirectoryError, isRole, normalizeScope, type DirectoryActor } from "@/lib/admin/user-directory";
import { isKnownAreaId } from "@/lib/locations";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { escapeLike } from "@/lib/supabase/like";


/**
 * ============================================================================
 * CREATING ACCOUNTS FOR WOVEN EMPLOYEES — administrator-initiated, no email
 * Lives OUTSIDE src/lib/employees/woven on purpose: the sync library may never
 * reach app_users or auth (phase-one-guarantees.test.ts), and still cannot.
 * ============================================================================
 *
 * Two ways in, one core (`createLinkedAccount`):
 *   - an administrator picks ONE employee, a role and a location in User
 *     Management (works for any synced employee, mapped or not);
 *   - the optional bulk run for the safely eligible, which the access plan
 *     decides (READY) and which is a dry run unless `apply` is set.
 *
 * Neither is ever run by a Woven sync. Neither sends an invitation, code or
 * email, and neither sets a password: the account is created DISABLED (see
 * `createAccountWithoutEmail`) and an administrator enables it and generates a
 * reset link when they are ready to hand it over.
 *
 * REPAIR: if an account with the employee's email already exists but has no
 * Woven link (an earlier create whose link insert failed), the same call links
 * it instead of creating a second account.
 */

export const PROVISION_BATCH_MAX = 25;
/** What this path may ever assign. No administrative role, and always one location. */
export const MANUAL_ROLES = AUTO_PROVISION_ROLES;

export type CreateOutcome = "created" | "repaired";

const squash = (v: string | null) => (v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export async function createLinkedAccount(
  input: { externalEmployeeId: string; role: unknown; scope: unknown; confirmAdmin?: unknown },
  actor: DirectoryActor,
): Promise<{ outcome: CreateOutcome; userId: string; linked: boolean }> {
  /* Role and scope are validated by the same function the account creation uses; checked here first so a repair is held to it too. */
  if (!isRole(input.role)) throw new DirectoryError("invalid_input", "Choose a role for this person.");
  const role = input.role;
  const scope = normalizeScope(input.scope);
  assertCanGrant(actor, role, scope, input.confirmAdmin);

  const db = getSupabaseAdmin();
  const { data: emp, error: empError } = await db
    .from("employee_access_directory")
    .select("external_employee_id, first_name, last_name, preferred_first_name, email_address, employment_status, missing_sync_count, data_issues, primary_location_name, woven_company_id")
    .eq("external_employee_id", input.externalEmployeeId)
    .maybeSingle();
  if (empError) throw new DirectoryError("provider_failed", "The employee could not be read.", 502);
  if (!emp) throw new DirectoryError("not_found", "No such synced employee.", 404);

  /* Tenant: only a record of the pinned company, and never another brand's location. */
  if (String(emp.woven_company_id ?? "").toLowerCase() !== WOVEN_TENANT.companyId.toLowerCase()) {
    throw new DirectoryError("invalid_input", "This employee does not belong to the Buff City Soap Woven company.", 403);
  }
  if (OTHER_BRAND_TITLE_MARKERS.some((m) => squash(emp.primary_location_name).includes(squash(m)))) {
    throw new DirectoryError("invalid_input", "This employee's Woven location belongs to another brand.", 403);
  }
  /* Employment: observed Active, no conflicting termination evidence. */
  const issues: string[] = Array.isArray(emp.data_issues) ? emp.data_issues : [];
  if (emp.employment_status !== "active" || (emp.missing_sync_count ?? 0) > 0) {
    throw new DirectoryError("invalid_input", "Woven does not show this employee as currently Active.", 409);
  }
  if (issues.includes("status_termination_conflict")) {
    throw new DirectoryError("invalid_input", "Woven shows a termination date for this employee. Resolve it in Woven first.", 409);
  }
  const email = typeof emp.email_address === "string" ? emp.email_address.trim().toLowerCase() : "";
  if (!email || issues.includes("invalid_email") || issues.includes("missing_email") || issues.includes("duplicate_email")) {
    throw new DirectoryError("invalid_input", "This employee has no usable, unique email address in Woven.", 409);
  }
  const name = (`${emp.preferred_first_name || emp.first_name || ""} ${emp.last_name || ""}`).trim() || email;

  const setBy = `admin:${actor.email || actor.id}`.slice(0, 120);
  const link = async (appUserId: string, method: "provisioned" | "admin_confirmed_email", managed: boolean) => {
    const { error } = await db.from("employee_account_links").insert({
      app_user_id: appUserId,
      management: "woven_linked",
      external_employee_id: input.externalEmployeeId,
      link_method: method,
      managed_status: managed,
      managed_location: false,
      managed_role: false,
      ...(method === "provisioned" ? { provisioned_by_source: "woven", first_provisioned_at: new Date().toISOString() } : {}),
      reason: method === "provisioned" ? "Account created for a Woven employee by an administrator" : "Link repaired by an administrator (exact email match)",
      set_by: setBy,
    });
    return !error;
  };

  /* Duplicate protection and repair: an account with this email is never created twice. */
  const { data: existing } = await db.from("app_users").select("id, role").ilike("email", escapeLike(email)).maybeSingle();
  const { data: linkedToEmployee } = await db.from("employee_account_links").select("app_user_id").eq("external_employee_id", input.externalEmployeeId).maybeSingle();
  if (existing) {
    const id = String(existing.id);
    if (linkedToEmployee) {
      throw new DirectoryError("duplicate_email", "This employee already has a linked Ask Bubbles account.", 409);
    }
    const { data: linkedElsewhere } = await db.from("employee_account_links").select("app_user_id").eq("app_user_id", id).maybeSingle();
    if (linkedElsewhere) {
      throw new DirectoryError("duplicate_email", "An account with this email is already linked to another person.", 409);
    }
    if (["admin", "owner", "developer"].includes(String(existing.role))) {
      throw new DirectoryError("protected_account", "An administrator account has this email. It is not linked from here.", 403);
    }
    /* A repair changes no access; the existing account keeps the role and scope it has. */
    const ok = await link(id, "admin_confirmed_email", false);
    if (!ok) throw new DirectoryError("provider_failed", "The existing account could not be linked. Try again.", 502);
    return { outcome: "repaired", userId: id, linked: true };
  }
  if (linkedToEmployee) {
    throw new DirectoryError("duplicate_email", "This employee is already linked to an account with a different email.", 409);
  }

  const user = await createAccountWithoutEmail(
    { email, displayName: name, role, scope, confirmAdmin: input.confirmAdmin },
    actor,
  );
  const linked = await link(user.id, "provisioned", true);
  return { outcome: "created", userId: user.id, linked };
}

/* ---------------------------------------------------------------- bulk -- */

export type ProvisionOutcome = { externalEmployeeId: string; status: "created" | "failed"; code?: string };

const isReady = (r: PlannedRow) => {
  const a = r.after as Record<string, unknown> | null;
  return (
    r.externalEmployeeId !== null &&
    r.actions[0] === "CREATE_USER" &&
    a !== null &&
    typeof a.email === "string" &&
    a.scope_level === "location" &&
    typeof a.scope_primary_area_id === "string" &&
    isKnownAreaId(a.scope_primary_area_id) &&
    (MANUAL_ROLES as readonly string[]).includes(String(a.role))
  );
};

/**
 * Optional bulk run for the safely eligible. READY = the plan says CREATE_USER;
 * EXISTING = the plan found an account; BLOCKED = everything else, with reasons
 * (those employees can still be created one at a time by an administrator).
 * A tripped mass-change guard blocks every creation; `creates_exceed_batch_limit`
 * is met by creating at most `batchSize` per call.
 */
export async function runProvisioning(opts: { apply: boolean; batchSize: number; actor: DirectoryActor }) {
  const plan = await loadAccessPlan();
  const employees = plan.rows.filter((r) => r.externalEmployeeId !== null && r.wovenStatus !== null);
  const ready = employees.filter(isReady);
  const existing = employees.filter((r) => !isReady(r) && r.account !== null);
  const blocked = employees.filter((r) => !isReady(r) && r.account === null);
  const guardCodes = plan.guard.codes.filter((c) => c !== "creates_exceed_batch_limit");

  const summary = {
    ready: ready.length,
    existing: existing.length,
    blocked: blocked.length,
    guardCodes,
    guardDetails: plan.guard.details,
    exceptions: blocked.map((r) => ({
      externalEmployeeId: r.externalEmployeeId,
      name: r.employeeName,
      position: r.wovenPosition,
      primaryLocation: r.wovenPrimaryLocation,
      actions: r.actions,
      reasons: r.reasons,
    })),
    readyList: ready.map((r) => ({
      externalEmployeeId: r.externalEmployeeId,
      name: r.employeeName,
      email: r.emailAddress,
      position: r.wovenPosition,
      role: r.proposedRole,
      areaId: r.proposedPrimaryAreaId,
    })),
  };

  if (!opts.apply) return { mode: "dry_run" as const, ...summary };
  if (guardCodes.length > 0) return { mode: "refused" as const, ...summary, outcomes: [] as ProvisionOutcome[] };

  const outcomes: ProvisionOutcome[] = [];
  for (const row of ready.slice(0, Math.min(opts.batchSize, PROVISION_BATCH_MAX))) {
    const a = row.after as Record<string, unknown>;
    const id = row.externalEmployeeId as string;
    try {
      const result = await createLinkedAccount({ externalEmployeeId: id, role: a.role, scope: { level: "location", primaryAreaId: a.scope_primary_area_id, alsoCoversAreaIds: [] } }, opts.actor);
      outcomes.push(result.linked ? { externalEmployeeId: id, status: "created" } : { externalEmployeeId: id, status: "created", code: "link_not_recorded" });
    } catch (error) {
      outcomes.push({ externalEmployeeId: id, status: "failed", code: (error as { code?: string }).code ?? "failed" });
    }
  }
  return { mode: "applied" as const, ...summary, outcomes };
}
