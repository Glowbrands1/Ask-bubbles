import "server-only";

import { revokeAuthAccess } from "@/lib/auth/revocation";
import { getSupabaseAdmin } from "@/lib/supabase/server";

import { applyAccessLifecycle, type ApplyDeps, type ApplyOutcome } from "./apply";
import { readWovenAccessConfig } from "./config";
import { loadAccessPlan } from "./load";
import { notifyAdminsOfDisabled } from "./disable-notices";

/**
 * The apply step with the real services: the plan from the database, the
 * migration's functions over PostgREST (20261128001000) and the hardened
 * revocation (Auth Admin ban + session revocation). Only in
 * `WOVEN_ACCESS_MODE=apply`; returns `{ status: "off" }` otherwise without
 * touching anything. Never throws.
 */
export function realApplyDeps(): ApplyDeps {
  const admin = getSupabaseAdmin();
  return {
    loadPlan: (now) => loadAccessPlan(now),
    rpc: (fn, args) => admin.rpc(fn, args) as unknown as PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>,
    revokeAuthAccess: (userId) => revokeAuthAccess(userId),
    notifyDisabled: (people) => notifyAdminsOfDisabled(people),
  };
}

export async function runAccessLifecycle(requestedBy: string, now: Date = new Date()): Promise<ApplyOutcome> {
  const config = readWovenAccessConfig();
  if (config.mode !== "apply") return { status: "off" };
  try {
    return await applyAccessLifecycle({ requestedBy, config, now }, realApplyDeps());
  } catch {
    return { status: "failed", code: "apply_failed", accessRunId: null };
  }
}
