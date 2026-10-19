import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";

import { PINNED_COMPANY_ID } from "../config";
import { classifyStatusError } from "../status";
import { recordShadowReview, type ShadowReviewInput, type ShadowReviewOutcome } from "./shadow-review";
import type { RpcResult } from "./terminate";

/** The administrator's view: the newest shadow run, the gate's state, and the EmployeeIDs that run planned to disable. Ids and counts only — no names or emails. */
export interface ShadowReviewCandidates {
  shadowRunId: string | null;
  createdAt: string | null;
  runStatus: string | null;
  guardCodes: string[];
  gate: { ok: boolean; code: string };
  employeeIds: string[];
}

export async function loadShadowReviewCandidates(): Promise<ShadowReviewCandidates> {
  const db = getSupabaseAdmin();
  const { data: runs, error } = await db
    .from("employee_access_runs")
    .select("id, status, guard_codes, created_at")
    .eq("mode", "shadow")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw classifyStatusError(error);
  const run = (runs?.[0] ?? null) as { id: string; status: string; guard_codes: string[]; created_at: string } | null;

  const state = await db.rpc("employee_access_review_state");
  const gate = (state.data && typeof state.data === "object" ? state.data : {}) as { ok?: boolean; code?: string };

  let employeeIds: string[] = [];
  if (run) {
    const { data: actions, error: actionsError } = await db
      .from("employee_access_actions")
      .select("external_employee_id")
      .eq("access_run_id", run.id)
      .eq("action", "DISABLE_TERMINATED")
      .eq("is_primary", true);
    if (actionsError) throw classifyStatusError(actionsError);
    employeeIds = ((actions ?? []) as { external_employee_id: string | null }[]).flatMap((a) => (a.external_employee_id ? [a.external_employee_id] : [])).sort();
  }
  return {
    shadowRunId: run?.id ?? null,
    createdAt: run?.created_at ?? null,
    runStatus: run?.status ?? null,
    guardCodes: run?.guard_codes ?? [],
    gate: { ok: gate.ok === true, code: typeof gate.code === "string" ? gate.code : "review_state_unavailable" },
    employeeIds,
  };
}

export function runShadowReview(input: ShadowReviewInput, reviewerUserId: string): Promise<ShadowReviewOutcome> {
  return recordShadowReview(input, reviewerUserId, {
    rpc: (fn, args) => getSupabaseAdmin().rpc(fn, args) as unknown as PromiseLike<RpcResult>,
    pinnedCompanyId: PINNED_COMPANY_ID,
  });
}
