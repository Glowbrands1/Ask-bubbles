import "server-only";

import { NextResponse } from "next/server";

import { APPROVED_GOOGLE_STORES } from "@/config/company/google-reviews";
import { demoRuntime } from "@/lib/demo/runtime";

import { NO_STORE, parseSyncRequest } from "./route-helpers";
import type { SyncOutcome } from "./sync";

/**
 * ============================================================================
 * THE GOOGLE REVIEWS ADMIN BUTTONS IN A DEMO BUILD
 * ============================================================================
 *
 * The admin screen shows the demo runtime's labelled sample as a healthy,
 * connected integration, so its buttons must answer — without contacting
 * Google and without a database. Each answer here is a harmless success that
 * changes nothing: a "sync" reports the sample's own counts, "disconnect" says
 * the demo connection stays, and a link change is acknowledged and ignored.
 *
 * Every route calls these ONLY behind `isDemoMode()`, before `assertLiveMode()`
 * would refuse; the live path is untouched.
 */

export async function demoSyncResponse(body: unknown): Promise<NextResponse> {
  const asked = parseSyncRequest(body);
  if (asked.kind === "confirmation_required") {
    return NextResponse.json(
      { status: "confirmation_required", field: "confirmSave", reason: "Saving needs both dryRun: false and confirmSave: true." },
      { status: 400, headers: NO_STORE },
    );
  }
  const sample = await demoRuntime.loadGoogleReviewsSample();
  const live = sample?.reviews.filter((r) => r.removedAt === null) ?? [];
  const outcome: SyncOutcome = {
    status: "succeeded",
    mode: asked.kind === "dry_run" ? "dry_run" : "save",
    code: null,
    reason: "Demo: nothing was read from Google and nothing was saved.",
    runId: null,
    missing: [],
    accountsListed: 1,
    googleLocationsSeen: APPROVED_GOOGLE_STORES.length,
    blockedOtherBrand: 0,
    ignoredNotApproved: 0,
    storesLinked: APPROVED_GOOGLE_STORES.length,
    storesTotal: APPROVED_GOOGLE_STORES.length,
    stores: APPROVED_GOOGLE_STORES.map((s) => ({
      storeCode: s.code,
      link: sample?.confirmedStores.includes(s.code) ? "confirmed" : "matched",
      read: true,
      complete: true,
      reviewsFetched: live.filter((r) => r.storeCode === s.code).length,
      rejected: 0,
      applied: null,
      failure: null,
    })),
    totals: { fetched: live.length, inserted: 0, updated: 0, unchanged: live.length, removed: 0, restored: 0, rejected: 0 },
  };
  return NextResponse.json(outcome, { headers: NO_STORE });
}

export function demoDisconnectResponse(): NextResponse {
  return NextResponse.json(
    { status: "ok", disconnected: false, reason: "Demo: the demo connection stays connected. Nothing was changed." },
    { headers: NO_STORE },
  );
}

export function demoLocationsResponse(): NextResponse {
  return NextResponse.json({ status: "ok", demo: true, reason: "Demo: store links are not changed." }, { headers: NO_STORE });
}
