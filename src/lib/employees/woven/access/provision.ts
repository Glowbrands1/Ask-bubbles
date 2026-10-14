import "server-only";

import { COMPANY_LOCATION_ENTRIES } from "@/config/company/locations";
import { createAccountWithoutEmail } from "@/lib/admin/create-account";
import type { DirectoryActor } from "@/lib/admin/user-directory";
import { getSupabaseAdmin } from "@/lib/supabase/server";

import { loadAccessPlan } from "./load";
import { AUTO_PROVISION_ROLES } from "./plan";
import type { PlannedRow } from "./types";

/**
 * Bulk account creation from the access plan, run only by an administrator
 * calling the route (never by a Woven sync). The plan decides who is READY;
 * this creates each account through `createAccountWithoutEmail` — NO invitation,
 * code or email, no password — and records the Woven link. Dry run by default.
 * Each person then gets a private sign-in link from the existing "Generate
 * reset link" tool.
 *
 * READY    = the plan says CREATE_USER and its values re-check here.
 * EXISTING = the plan found an Ask Bubbles account for the employee.
 * BLOCKED  = everything else, with the planner's reasons.
 *
 * A tripped mass-change guard blocks every creation. `creates_exceed_batch_limit`
 * is the exception: it is met by sending at most `batchSize` per call.
 */

export const PROVISION_BATCH_MAX = 25;
const KNOWN_AREAS = new Set(COMPANY_LOCATION_ENTRIES.map((l) => `loc-${l.code}`));

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
    KNOWN_AREAS.has(a.scope_primary_area_id) &&
    (AUTO_PROVISION_ROLES as readonly string[]).includes(String(a.role)) &&
    String(a.role) !== "admin"
  );
};

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

  const db = getSupabaseAdmin();
  const outcomes: ProvisionOutcome[] = [];
  for (const row of ready.slice(0, Math.min(opts.batchSize, PROVISION_BATCH_MAX))) {
    const a = row.after as Record<string, unknown>;
    const id = row.externalEmployeeId as string;
    try {
      const user = await createAccountWithoutEmail(
        {
          email: a.email,
          displayName: a.display_name,
          role: a.role,
          scope: { level: "location", primaryAreaId: a.scope_primary_area_id, alsoCoversAreaIds: [] },
        },
        opts.actor,
      );
      const { error } = await db.from("employee_account_links").insert({
        app_user_id: user.id,
        management: "woven_linked",
        external_employee_id: id,
        link_method: "provisioned",
        managed_status: true,
        managed_location: false,
        managed_role: false,
        provisioned_by_source: "woven",
        first_provisioned_at: new Date().toISOString(),
        reason: "Bulk provisioned from Woven",
        set_by: `admin:${opts.actor.email || opts.actor.id}`.slice(0, 120),
      });
      outcomes.push(error ? { externalEmployeeId: id, status: "created", code: "link_not_recorded" } : { externalEmployeeId: id, status: "created" });
    } catch (error) {
      const code = (error as { code?: string }).code ?? "failed";
      outcomes.push({ externalEmployeeId: id, status: "failed", code });
      if (code === "email_rate_limited") break;
    }
  }
  return { mode: "applied" as const, ...summary, outcomes };
}
