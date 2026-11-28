import "server-only";

import type { DirectoryActor } from "@/lib/admin/user-directory";
import { loadAccessPlan } from "@/lib/employees/woven/access/load";
import type { AccessPlan } from "@/lib/employees/woven/access/build";
import { ADMIN_CONSOLE_ROLES } from "@/lib/permissions";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { Role } from "@/types";

import { readPositionSyncConfig } from "./position-sync";
import { decideLifecycle, readLifecycleConfig, type LinkToInsert } from "./woven-lifecycle";

/**
 * The account link (`woven-lifecycle.ts`) with the real services. Runs after a successful, stored Woven sync, after
 * the access sync's apply step and before the position sync and the notices. Never throws; the outcome carries codes
 * and counts only.
 */

export type LifecycleOutcome =
  | { status: "off"; code?: string }
  | { status: "blocked"; code: "guards" }
  | { status: "completed"; linked: number; failed: number };

export interface LifecycleDeps {
  actor(email: string): Promise<DirectoryActor | null>;
  loadPlan(): Promise<AccessPlan>;
  link(row: LinkToInsert): Promise<void>;
}

export async function runAccountLifecycle(input: { env?: Record<string, string | undefined> } = {}, deps: LifecycleDeps = realLifecycleDeps()): Promise<LifecycleOutcome> {
  const env = input.env ?? process.env;
  const config = readLifecycleConfig(env);
  if (!config.linkExisting) return { status: "off" };
  const actorEmail = readPositionSyncConfig(env).actorEmail;
  if (!actorEmail) return { status: "off", code: "actor_missing" };
  try {
    const actor = await deps.actor(actorEmail);
    if (!actor) return { status: "off", code: "actor_not_an_administrator" };
    const plan = await deps.loadPlan();
    if (!plan.guard.mutationsAllowed) return { status: "blocked", code: "guards" };
    const decided = decideLifecycle(plan.rows, config, `woven-lifecycle:${actor.email}`.slice(0, 120));
    let linked = 0;
    let failed = 0;
    for (const row of decided.links) {
      try {
        await deps.link(row);
        linked += 1;
      } catch {
        failed += 1;
      }
    }
    return { status: "completed", linked, failed };
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
    link: async (row) => {
      const { error } = await getSupabaseAdmin().from("employee_account_links").insert(row);
      if (error) throw new Error(`the link could not be stored (${error.code ?? "error"})`);
    },
  };
}
