import "server-only";

import { patchUser, DirectoryError, type DirectoryActor } from "@/lib/admin/user-directory";
import { loadAccessPlan } from "@/lib/employees/woven/access/load";
import type { AccessPlan } from "@/lib/employees/woven/access/build";
import { ADMIN_CONSOLE_ROLES } from "@/lib/permissions";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { Role } from "@/types";

import { readPositionSyncConfig } from "./position-sync";
import { decideLifecycle, readLifecycleConfig, type LinkToInsert } from "./woven-lifecycle";

/**
 * The account lifecycle (`woven-lifecycle.ts`) with the real services. Runs after a successful, stored Woven sync,
 * before the position sync and the notices (so a termination notice can say the sign-in is disabled). Never throws;
 * the outcome carries codes and counts only.
 */

export type LifecycleOutcome =
  | { status: "off"; code?: string }
  | { status: "blocked"; code: "guards" }
  | { status: "completed"; disabled: number; linked: number; failed: number; ignoredActions?: string[] };

export interface LifecycleDeps {
  actor(email: string): Promise<DirectoryActor | null>;
  loadPlan(): Promise<AccessPlan>;
  disable(appUserId: string, actor: DirectoryActor): Promise<void>;
  link(row: LinkToInsert): Promise<void>;
}

export async function runAccountLifecycle(input: { env?: Record<string, string | undefined> } = {}, deps: LifecycleDeps = realLifecycleDeps()): Promise<LifecycleOutcome> {
  const env = input.env ?? process.env;
  const config = readLifecycleConfig(env);
  if (config.actions.length === 0) return { status: "off" };
  const actorEmail = readPositionSyncConfig(env).actorEmail;
  if (!actorEmail) return { status: "off", code: "actor_missing" };
  try {
    const actor = await deps.actor(actorEmail);
    if (!actor) return { status: "off", code: "actor_not_an_administrator" };
    const plan = await deps.loadPlan();
    if (!plan.guard.mutationsAllowed) return { status: "blocked", code: "guards" };
    const decided = decideLifecycle(plan.rows, config, `woven-lifecycle:${actor.email}`.slice(0, 120));
    let disabled = 0;
    let linked = 0;
    let failed = 0;
    for (const d of decided.disables) {
      if (d.appUserId === actor.id) continue;
      try {
        await deps.disable(d.appUserId, actor);
        disabled += 1;
      } catch (error) {
        failed += 1;
        console.error("[woven-lifecycle] a sign-in could not be turned off:", error instanceof DirectoryError ? error.code : "error");
      }
    }
    for (const row of decided.links) {
      try {
        await deps.link(row);
        linked += 1;
      } catch {
        failed += 1;
      }
    }
    return { status: "completed", disabled, linked, failed, ...(config.ignored.length ? { ignoredActions: config.ignored } : {}) };
  } catch (error) {
    console.error("[woven-lifecycle] not run:", error instanceof Error ? error.message : "unknown error");
    return { status: "off", code: "lifecycle_failed" };
  }
}

async function readActor(email: string): Promise<DirectoryActor | null> {
  const { data } = await getSupabaseAdmin().from("app_users").select("id, email, role, status, scope_level").eq("email", email.toLowerCase()).maybeSingle();
  if (!data || data.status !== "active" || data.scope_level !== "global") return null;
  if (!(ADMIN_CONSOLE_ROLES as readonly string[]).includes(String(data.role))) return null;
  return { id: String(data.id), email: String(data.email), role: data.role as Role, scope: { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] } };
}

export function realLifecycleDeps(): LifecycleDeps {
  return {
    actor: readActor,
    loadPlan: () => loadAccessPlan(),
    // patchUser writes the profile, then bans the Supabase Auth user and ends every session (revokeAuthAccess), audited.
    disable: async (appUserId, actor) => {
      await patchUser(appUserId, { status: "disabled" }, actor);
    },
    link: async (row) => {
      const { error } = await getSupabaseAdmin().from("employee_account_links").insert(row);
      if (error) throw new Error(`the link could not be stored (${error.code ?? "error"})`);
    },
  };
}
