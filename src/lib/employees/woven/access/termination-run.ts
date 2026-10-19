import "server-only";

import { revokeAuthAccess } from "@/lib/auth/revocation";
import { getSupabaseAdmin } from "@/lib/supabase/server";

import { PINNED_COMPANY_ID } from "../config";
import { loadAccessPlan } from "./load";
import { enforceTerminations, type TerminationOutcome } from "./terminate";
import { readTerminationEnforcement } from "./termination-config";

/**
 * The server wiring of `terminate.ts`: the real plan loader, the secret-key
 * database client (functions only — no table write), and the authentication
 * layer's ban + session revocation. This is the ONLY access module that may
 * name `revokeAuthAccess` (`phase-one-guarantees.test.ts` enforces it).
 *
 * Off by default: with `WOVEN_TERMINATION_ENFORCEMENT` unset or invalid this
 * returns `{ status: "off" }` before reading the plan or touching anything.
 * Never throws; the scheduled sync's own outcome never depends on it.
 */
export async function runTerminationEnforcement(requestedBy: string, actingUserId: string | null = null): Promise<TerminationOutcome> {
  const config = readTerminationEnforcement();
  if (!config.enabled) return { status: "off" };
  try {
    return await enforceTerminations(
      { requestedBy, actingUserId, config },
      {
        loadPlan: loadAccessPlan,
        rpc: (fn, args) => getSupabaseAdmin().rpc(fn, args) as unknown as PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>,
        revokeAuth: (userId) => revokeAuthAccess(userId),
        pinnedCompanyId: PINNED_COMPANY_ID,
      },
    );
  } catch {
    return { status: "failed", code: "enforcement_failed" };
  }
}
