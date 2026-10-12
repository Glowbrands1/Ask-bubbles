import { NextResponse } from "next/server";

import { authorizeCronRequest, CRON_SECRET_ENV } from "@/lib/api/cron-auth";
import { SUPABASE_URL_ENV, supabaseSecretKeyConfigured } from "@/lib/config/server-env";
import {
  GOOGLE_REVIEWS_SCHEDULE_ENABLED_ENV,
  GOOGLE_REVIEWS_SYNC_ENABLED_ENV,
  readGoogleReviewsConfig,
} from "@/lib/google-reviews/config";
import { CRON_REQUESTER, outcomeHttpStatus, runGoogleReviewsSync } from "@/lib/google-reviews/sync";

/**
 * GET /api/google-reviews/cron — the scheduled Google Reviews refresh.
 *
 * ============================================================================
 * SCHEDULED EVERY SIX HOURS — minute 23 (`vercel.json`)
 * ============================================================================
 *
 * New reviews and owner replies are same-day facts; six hours keeps the screen
 * current while using a tiny fraction of Google's quota (about 7 stores × a few
 * pages per run). A missed run is caught up in full by the next, because every
 * run reads each store's reviews from the start and reconciles them.
 *
 * It is the SAME sync as the admin screen's (`runGoogleReviewsSync`): the same
 * run lock, completeness rules, removal guard and per-store transactions.
 *
 * ============================================================================
 * FIVE LOCKS, ANY ONE OF WHICH STOPS IT
 * ============================================================================
 *   1. `CRON_SECRET` — Vercel's bearer credential. Absent: every call is refused.
 *   2. `GOOGLE_REVIEWS_SYNC_ENABLED` — the master switch.
 *   3. `GOOGLE_REVIEWS_SCHEDULE_ENABLED` — the schedule's own switch. Off: manual
 *      runs still work and this tick starts nothing.
 *   4. `GOOGLE_REVIEWS_WRITES_ENABLED` — enforced inside the sync: off refuses
 *      the save before Google or the database is touched.
 *   5. The run lock — at most one sync at a time, enforced by Postgres.
 *
 * READ-ONLY AGAINST GOOGLE, always. THE RESPONSE carries codes and counts only —
 * never a review, a reviewer or a token.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!process.env[SUPABASE_URL_ENV] || !supabaseSecretKeyConfigured()) {
    return NextResponse.json({ status: "not_configured", code: "supabase_missing", reason: "Supabase is not configured in this runtime." }, { status: 503 });
  }

  const auth = await authorizeCronRequest(request);
  if (auth === "unconfigured") {
    return NextResponse.json({ status: "not_configured", code: "cron_secret_missing", reason: `${CRON_SECRET_ENV} is not set, so the scheduled Google Reviews sync is closed.` }, { status: 503 });
  }
  if (auth === "unauthorized") {
    return NextResponse.json({ status: "unauthorized", code: "invalid_token", reason: "Not authorized." }, { status: 401 });
  }

  const config = readGoogleReviewsConfig();
  if (!config.enabled) {
    return NextResponse.json({ status: "disabled", reason: `${GOOGLE_REVIEWS_SYNC_ENABLED_ENV} is not on, so nothing reaches Google.` });
  }
  if (!config.scheduleEnabled) {
    return NextResponse.json({ status: "schedule_disabled", reason: `${GOOGLE_REVIEWS_SCHEDULE_ENABLED_ENV} is not on, so the scheduled sync starts nothing. Manual runs are unaffected.` });
  }

  const outcome = await runGoogleReviewsSync({ requestedBy: CRON_REQUESTER, config });
  return NextResponse.json(outcome, { status: outcomeHttpStatus(outcome) });
}
