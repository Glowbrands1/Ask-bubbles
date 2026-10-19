import "server-only";

import { restoreAuthAccess } from "@/lib/auth/revocation";
import { getSupabaseAdmin } from "@/lib/supabase/server";

import { PINNED_COMPANY_ID } from "../config";
import { approveRehire, type RehireInput, type RehireOutcome } from "./rehire";
import type { RpcResult } from "./terminate";

/**
 * The server wiring of `rehire.ts`: the secret-key database client (functions
 * only) and the authentication layer's ban lift. This is the ONLY module that
 * may name `restoreAuthAccess` in the access code. It is called by exactly one
 * thing — the administrator-only rehire route — never by the cron route,
 * enforcement or shadow code.
 */
export function runRehireApproval(input: RehireInput, approverUserId: string): Promise<RehireOutcome> {
  return approveRehire(input, approverUserId, {
    rpc: (fn, args) => getSupabaseAdmin().rpc(fn, args) as unknown as PromiseLike<RpcResult>,
    restoreAuth: (userId) => restoreAuthAccess(userId),
    pinnedCompanyId: PINNED_COMPANY_ID,
  });
}
