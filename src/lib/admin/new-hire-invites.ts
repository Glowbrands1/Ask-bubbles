import "server-only";

import { createLinkedAccount, MANUAL_ROLES } from "@/lib/admin/woven-account";
import { DirectoryError, type DirectoryActor } from "@/lib/admin/user-directory";
import { loadAccessPlan, type AccessPlan } from "@/lib/employees/woven/access/load";
import type { PlannedRow } from "@/lib/employees/woven/access/types";
import { isKnownAreaId } from "@/lib/locations";
import { ADMIN_CONSOLE_ROLES } from "@/lib/permissions";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { escapeLike } from "@/lib/supabase/like";
import type { Role } from "@/types";

/**
 * ============================================================================
 * NEW HIRES GET THEIR ACCESS LINK ON THEIR OWN — ONE AT A TIME
 * ============================================================================
 *
 * Pau, 28 Oct 2026 (same switches in both apps): "i just dont want to bulk
 * send link to everyone coz im limited 2 sends an hr". Built and off. Lives
 * here, outside src/lib/employees/woven, like the rest of account creation:
 * the Woven sync itself still never reaches app_users or auth
 * (phase-one-guarantees.test.ts), and never runs this.
 *
 *   NEW_HIRE_INVITES_ENABLED   the master switch. Off (default): the hourly
 *                              route answers `disabled` and reads nothing.
 *   NEW_HIRE_INVITE_SINCE      YYYY-MM-DD. Only people whose Woven hire date
 *                              is on or after it, and not after today, are
 *                              new hires. Unset: off.
 *   NEW_HIRE_INVITE_ROLES      the roles that get the automatic link, from the
 *                              approved provisioning roles (location_manager,
 *                              assistant_manager, employee). Empty (default):
 *                              nobody.
 *   NEW_HIRE_INVITES_PER_HOUR  1 (default) or 2. Anything else is 1.
 *   NEW_HIRE_INVITE_ACTOR      the email of an active administrator with
 *                              access to all locations; the accounts are made
 *                              in their name, as if they had pressed Create.
 *                              Unset or not such an account: off.
 *
 * Each hour (`/api/employees/woven/invites/cron`), while the access guards
 * allow changes: the plan's READY employees (the same rule as the bulk
 * provisioning) who are new hires in one of the roles, oldest hire first; for
 * at most NEW_HIRE_INVITES_PER_HOUR of them, the account is created by the
 * invitation itself (`createLinkedAccount` with `invite`) and linked to Woven.
 * The mailer's limit stops the hour, and nothing is created for that person
 * (`inviteUser` refuses before the profile): they are tried the next hour.
 * Everybody already on the team is left to an administrator.
 */

export const NEW_HIRE_INVITES_ENABLED_ENV = "NEW_HIRE_INVITES_ENABLED";
export const NEW_HIRE_INVITE_SINCE_ENV = "NEW_HIRE_INVITE_SINCE";
export const NEW_HIRE_INVITE_ROLES_ENV = "NEW_HIRE_INVITE_ROLES";
export const NEW_HIRE_INVITES_PER_HOUR_ENV = "NEW_HIRE_INVITES_PER_HOUR";
export const NEW_HIRE_INVITE_ACTOR_ENV = "NEW_HIRE_INVITE_ACTOR";

export interface NewHireConfig {
  enabled: boolean;
  since: string | null;
  roles: readonly Role[];
  perHour: 1 | 2;
  actorEmail: string | null;
  today: string;
  problem: string | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const on = (raw: string | undefined) => ["1", "true", "yes", "on"].includes((raw ?? "").trim().toLowerCase());

export function readNewHireConfig(env: Record<string, string | undefined> = process.env, now: Date = new Date()): NewHireConfig {
  const today = now.toISOString().slice(0, 10);
  const off = (problem: string | null): NewHireConfig => ({ enabled: false, since: null, roles: [], perHour: 1, actorEmail: null, today, problem });
  if (!on(env[NEW_HIRE_INVITES_ENABLED_ENV])) return off(null);
  const since = (env[NEW_HIRE_INVITE_SINCE_ENV] ?? "").trim();
  if (!ISO_DATE.test(since) || Number.isNaN(Date.parse(`${since}T00:00:00Z`))) {
    return off(`${NEW_HIRE_INVITE_SINCE_ENV} must be a date (YYYY-MM-DD). New-hire invitations were treated as off.`);
  }
  const named = [...new Set((env[NEW_HIRE_INVITE_ROLES_ENV] ?? "").split(",").map((role) => role.trim()).filter(Boolean))];
  const refused = named.filter((role) => !(MANUAL_ROLES as readonly string[]).includes(role));
  if (refused.length > 0) {
    return off(`${NEW_HIRE_INVITE_ROLES_ENV} may name only ${MANUAL_ROLES.join(", ")}; ${refused.join(", ")} is not one. New-hire invitations were treated as off.`);
  }
  const actorEmail = (env[NEW_HIRE_INVITE_ACTOR_ENV] ?? "").trim().toLowerCase();
  if (!actorEmail.includes("@")) {
    return off(`${NEW_HIRE_INVITE_ACTOR_ENV} must be an administrator's email. New-hire invitations were treated as off.`);
  }
  const perHour = (env[NEW_HIRE_INVITES_PER_HOUR_ENV] ?? "").trim() === "2" ? 2 : 1;
  return { enabled: true, since, roles: named as Role[], perHour, actorEmail, today, problem: null };
}

/** Hired on or after the set date, and not after today. A missing or unreadable date is not a new hire. */
export function isNewHire(hireDate: string | null | undefined, config: Pick<NewHireConfig, "since" | "today">): boolean {
  const day = (hireDate ?? "").slice(0, 10);
  return config.since !== null && ISO_DATE.test(day) && day >= config.since && day <= config.today;
}

/** The bulk provisioning's READY rule: the plan says CREATE_USER, for one known location and an approved role. */
function ready(row: PlannedRow): boolean {
  const after = row.after as Record<string, unknown> | null;
  return (
    row.externalEmployeeId !== null &&
    row.actions[0] === "CREATE_USER" &&
    after !== null &&
    typeof after.email === "string" &&
    after.scope_level === "location" &&
    typeof after.scope_primary_area_id === "string" &&
    isKnownAreaId(after.scope_primary_area_id) &&
    (MANUAL_ROLES as readonly string[]).includes(String(after.role))
  );
}

export interface NewHireInviteDeps {
  loadPlan(now: Date): Promise<AccessPlan>;
  /** Woven hire dates for these EmployeeIDs. */
  hireDates(ids: readonly string[]): Promise<Map<string, string | null>>;
  /** The administrator the accounts are made by, or null when there is no such account. */
  actor(email: string): Promise<DirectoryActor | null>;
  createAndInvite(row: PlannedRow, actor: DirectoryActor): Promise<void>;
}

export type NewHireInviteOutcome =
  | { status: "off"; code: string }
  | { status: "blocked"; code: "guards" }
  | { status: "completed"; sent: number; failed: number; waiting: number; stoppedBy: string | null };

export async function sendNewHireInvites(input: { config: NewHireConfig; now: Date }, deps: NewHireInviteDeps): Promise<NewHireInviteOutcome> {
  const { config, now } = input;
  if (!config.enabled || !config.actorEmail) return { status: "off", code: config.problem ? "misconfigured" : "new_hire_invites_off" };
  if (config.roles.length === 0) return { status: "off", code: "no_roles" };
  const actor = await deps.actor(config.actorEmail);
  if (!actor) return { status: "off", code: "actor_not_an_administrator" };

  const plan = await deps.loadPlan(now);
  if (plan.guard.codes.some((code) => code !== "creates_exceed_batch_limit")) return { status: "blocked", code: "guards" };
  const candidates = plan.rows.filter((row) => ready(row) && config.roles.includes(String((row.after as Record<string, unknown>).role) as Role));
  const hired = await deps.hireDates(candidates.map((row) => row.externalEmployeeId!));
  const waiting = candidates
    .filter((row) => isNewHire(hired.get(row.externalEmployeeId!), config))
    .sort((a, b) => (hired.get(a.externalEmployeeId!) ?? "").localeCompare(hired.get(b.externalEmployeeId!) ?? "") || a.key.localeCompare(b.key));

  let sent = 0;
  let failed = 0;
  let stoppedBy: string | null = null;
  for (const row of waiting.slice(0, config.perHour)) {
    try {
      await deps.createAndInvite(row, actor);
      sent += 1;
    } catch (error) {
      failed += 1;
      // The mailer's limit: nobody else is tried this hour, and nothing was created for this person.
      if (error instanceof DirectoryError && error.code === "email_rate_limited") {
        stoppedBy = "email_rate_limited";
        break;
      }
    }
  }
  return { status: "completed", sent, failed, waiting: waiting.length - sent, stoppedBy };
}

/* ------------------------------------------------------- the real services -- */

async function readActor(email: string): Promise<DirectoryActor | null> {
  const { data } = await getSupabaseAdmin()
    .from("app_users")
    .select("id, email, role, status, scope_level")
    .ilike("email", escapeLike(email))
    .maybeSingle();
  if (!data || data.status !== "active" || data.scope_level !== "global") return null;
  if (!(ADMIN_CONSOLE_ROLES as readonly string[]).includes(String(data.role))) return null;
  return {
    id: String(data.id),
    email: String(data.email),
    role: data.role as Role,
    scope: { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] },
  };
}

async function readHireDates(ids: readonly string[]): Promise<Map<string, string | null>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await getSupabaseAdmin()
    .from("employee_access_directory")
    .select("external_employee_id, hire_date")
    .in("external_employee_id", [...ids]);
  if (error) throw new Error("hire dates could not be read");
  return new Map((data ?? []).map((row) => [String(row.external_employee_id), typeof row.hire_date === "string" ? row.hire_date : null]));
}

/** The hourly run with the real services. Off: `{ status: "off" }`, and nothing is read. */
export async function runNewHireInvites(redirectTo: string, now: Date = new Date()): Promise<NewHireInviteOutcome> {
  const config = readNewHireConfig(process.env, now);
  if (!config.enabled) return { status: "off", code: config.problem ? "misconfigured" : "new_hire_invites_off" };
  try {
    return await sendNewHireInvites(
      { config, now },
      {
        loadPlan: (at) => loadAccessPlan(at),
        hireDates: readHireDates,
        actor: readActor,
        createAndInvite: async (row, actor) => {
          const after = row.after as Record<string, unknown>;
          await createLinkedAccount(
            {
              externalEmployeeId: row.externalEmployeeId!,
              role: after.role,
              scope: { level: "location", primaryAreaId: after.scope_primary_area_id, alsoCoversAreaIds: [] },
            },
            actor,
            { invite: { redirectTo } },
          );
        },
      },
    );
  } catch {
    return { status: "off", code: "new_hire_invites_failed" };
  }
}
