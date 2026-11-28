import { NextResponse } from "next/server";

import { authorizeCronRequest, CRON_SECRET_ENV } from "@/lib/api/cron-auth";
import { SUPABASE_URL_ENV, supabaseSecretKeyConfigured } from "@/lib/config/server-env";
import {
  readWovenConfig,
  WOVEN_SYNC_ENABLED_ENV,
  WOVEN_SYNC_SCHEDULE_ENABLED_ENV,
} from "@/lib/employees/woven/config";
import { CRON_REQUESTER, outcomeHttpStatus, runWovenEmployeeSync } from "@/lib/employees/woven/sync";
import { runAccessLifecycle } from "@/lib/employees/woven/access/apply-run";
import { readWovenAccessConfig } from "@/lib/employees/woven/access/config";
import { recordAccessShadowRun } from "@/lib/employees/woven/access/shadow";
import { announceNewHires } from "@/lib/admin/new-hire-notices.server";
import { runPositionSync } from "@/lib/admin/position-sync.server";
import { runAccountLifecycle } from "@/lib/admin/woven-lifecycle.server";

/**
 * GET /api/employees/woven/cron — the scheduled Woven employee sync.
 *
 * ============================================================================
 * SCHEDULED TWICE A DAY — 11:17 and 23:17 UTC (`vercel.json`)
 * ============================================================================
 *
 * Enabled after the first manual dry run and the first manual stored run were
 * read and found right (docs/woven-employee-sync.md §8). Once a day suits an
 * employee directory: hires, terminations and moves are daily facts, and a
 * missed day is caught up in full by the next read. The minute is off the hour
 * and away from the other cron entry.
 *
 * It is the SAME sync as the admin screen's: `runWovenEmployeeSync`, with the
 * same read-completeness check, run lock, WOVEN_SYNC_WRITES_ENABLED switch and
 * one-transaction save. A failed or refused run records its code and leaves
 * the last good directory as it was; the next day's run tries again.
 *
 * ============================================================================
 * FIVE LOCKS, ANY ONE OF WHICH STOPS IT
 * ============================================================================
 *
 *   1. `CRON_SECRET` — Vercel's bearer credential for scheduled invocations.
 *      Absent: every call is refused, Vercel's included.
 *   2. `WOVEN_SYNC_ENABLED` — the master switch. Off: nothing reaches Woven.
 *   3. `WOVEN_SYNC_SCHEDULE_ENABLED` — the schedule's own switch. Off: manual
 *      runs from the admin route still work, and this tick starts nothing.
 *   4. `WOVEN_SYNC_WRITES_ENABLED` — enforced inside `runWovenEmployeeSync`.
 *      Off: the tick is refused (409 `writes_disabled`) before Woven or the
 *      store is touched.
 *   5. The run lock — at most one sync at a time, enforced by Postgres.
 *
 * WHAT THE DIRECTORY SYNC DOES NOT DO, even when all five are open: change
 * `app_users`, a role, a scope, a location assignment or a login; delete
 * anybody; or write to Woven. See `src/lib/employees/woven/sync.ts`.
 *
 * AFTER A SUCCESSFUL SYNC — and only then — WOVEN_ACCESS_MODE decides one more
 * step:
 *   off     nothing (the default);
 *   shadow  the access plan is recorded, nothing applied;
 *   apply   the apply step runs (owner, 28 Nov 2026): with
 *           WOVEN_ACCESS_APPLY_ACTIONS=DISABLE_TERMINATED, an account Woven
 *           marks Terminated is disabled and its auth access revoked (ban +
 *           sessions), behind the plan's guards. Never an account created,
 *           an invitation, a role or location change, or a delete. See
 *           `src/lib/employees/woven/access/apply.ts`.
 *
 * THE RESPONSE carries codes and counts only — never a name or an email.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/*
 * A full read is paced under Woven's ~100 requests/minute. The sync stops
 * starting requests at 230 s (`DEFAULT_READ_BUDGET_MS`) so the commit has room
 * inside this limit.
 */
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!process.env[SUPABASE_URL_ENV] || !supabaseSecretKeyConfigured()) {
    return NextResponse.json(
      { status: "not_configured", code: "supabase_missing", reason: "Supabase is not configured in this runtime." },
      { status: 503 },
    );
  }

  const auth = await authorizeCronRequest(request);
  if (auth === "unconfigured") {
    return NextResponse.json(
      {
        status: "not_configured",
        code: "cron_secret_missing",
        reason: `${CRON_SECRET_ENV} is not set, so the scheduled Woven sync is closed.`,
      },
      { status: 503 },
    );
  }
  if (auth === "unauthorized") {
    return NextResponse.json(
      { status: "unauthorized", code: "invalid_token", reason: "Not authorized." },
      { status: 401 },
    );
  }

  const config = readWovenConfig();
  if (!config.enabled) {
    return NextResponse.json({
      status: "disabled",
      reason: `${WOVEN_SYNC_ENABLED_ENV} is not on, so nothing reaches Woven.`,
    });
  }
  if (!config.scheduleEnabled) {
    return NextResponse.json({
      status: "schedule_disabled",
      reason: `${WOVEN_SYNC_SCHEDULE_ENABLED_ENV} is not on, so the scheduled sync starts nothing. Manual runs are unaffected.`,
    });
  }

  const outcome = await runWovenEmployeeSync({ requestedBy: CRON_REQUESTER, config });

  /*
   * Only after a SUCCESSFUL directory sync. Shadow records what the access sync
   * WOULD do (`access/shadow.ts`); apply disables Terminated accounts
   * (`access/apply.ts`). Off (the default), and the response is exactly the
   * sync's outcome. Codes and counts only: neither outcome carries a name or
   * an email.
   */
  const succeeded = outcome.status === "succeeded";
  const mode = readWovenAccessConfig().mode;
  const shadow = succeeded && mode === "shadow" ? await recordAccessShadowRun(CRON_REQUESTER) : ({ status: "off" } as const);
  /* WOVEN_ACCESS_MODE=apply: turn off the sign-in of someone Woven marks Terminated (access/apply.ts). First, so the termination notice below can say it is disabled. */
  const lifecycle = succeeded && mode === "apply" ? await runAccessLifecycle(CRON_REQUESTER) : ({ status: "off" } as const);
  /* WOVEN_LINK_EXISTING_ENABLED: link an existing account by its one exact email match (src/lib/admin/woven-lifecycle.ts). */
  const accountLinks = succeeded ? await runAccountLifecycle() : ({ status: "off" } as const);
  /* WOVEN_POSITION_SYNC_ENABLED: access follows Woven's position and store within the manager tiers (src/lib/admin/position-sync.ts). */
  const positionSync = succeeded ? await runPositionSync() : ({ status: "off" } as const);
  /* NEW_HIRE_NOTICES_ENABLED: hires, terminations and the email webhook (src/lib/admin/new-hire-notices.ts). Counts only. */
  const newHireNotices = succeeded ? await announceNewHires({}) : ({ status: "off" } as const);
  const body = {
    ...outcome,
    ...(shadow.status === "off" ? {} : { accessShadow: shadow }),
    ...(lifecycle.status === "off" ? {} : { accessLifecycle: lifecycle }),
    ...(accountLinks.status === "off" && !("code" in accountLinks && accountLinks.code) ? {} : { accountLinks }),
    ...(positionSync.status === "off" && !("code" in positionSync && positionSync.code) ? {} : { positionSync }),
    ...(newHireNotices.status === "off" ? {} : { newHireNotices }),
  };
  return NextResponse.json(body, { status: outcomeHttpStatus(outcome) });
}
