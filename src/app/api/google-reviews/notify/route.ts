import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { SUPABASE_URL_ENV, supabaseSecretKeyConfigured } from "@/lib/config/server-env";
import { readGoogleReviewsConfig } from "@/lib/google-reviews/config";
import { runGoogleReviewsSync } from "@/lib/google-reviews/sync";

/**
 * POST /api/google-reviews/notify — the Google Pub/Sub PUSH endpoint for
 * Business Profile NEW_REVIEW / UPDATED_REVIEW notifications.
 *
 * The notification only says "something changed", so it triggers the SAME sync
 * as the schedule (full, idempotent, run-locked): it never trusts the message
 * content, and a duplicate or out-of-order delivery is harmless. The cron stays
 * on as the reconciliation fallback for anything missed.
 *
 * Auth: the push subscription's URL carries `?token=<GOOGLE_PUBSUB_VERIFICATION_TOKEN>`.
 * Without that variable set the route is closed. Obeys the same on/off switches
 * as the cron (sync + writes). Read-only against Google.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const TOKEN_ENV = "GOOGLE_PUBSUB_VERIFICATION_TOKEN";
const REQUESTER = "pubsub:google-reviews";

function tokenMatches(presented: string | null): boolean {
  const expected = process.env[TOKEN_ENV];
  if (!expected || !presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!process.env[TOKEN_ENV]) return NextResponse.json({ status: "not_configured", code: "pubsub_token_missing" }, { status: 503 });
  if (!tokenMatches(new URL(request.url).searchParams.get("token"))) return NextResponse.json({ status: "unauthorized" }, { status: 401 });

  const config = readGoogleReviewsConfig();
  if (!config.enabled || !config.writesEnabled || !process.env[SUPABASE_URL_ENV] || !supabaseSecretKeyConfigured()) {
    // Acknowledge so Pub/Sub does not redeliver; the switches are off on purpose.
    return NextResponse.json({ status: "ignored" });
  }

  const outcome = await runGoogleReviewsSync({ requestedBy: REQUESTER, config });
  // 200 even when the sync was busy or partial: the next notification or the cron reconciles. Codes only.
  return NextResponse.json({ status: outcome.status, code: outcome.code });
}
