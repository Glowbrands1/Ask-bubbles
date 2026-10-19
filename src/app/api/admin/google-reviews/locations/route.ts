import { NextResponse } from "next/server";

import { approvedStoreByCode } from "@/config/company/google-reviews";
import { assertLiveMode, assertNoConfigurationProblems, assertWithinRateLimit, errorResponse } from "@/lib/api/respond";
import { parseJsonBody } from "@/lib/api/validation";
import { authorizeRequest } from "@/lib/auth/server";
import { isSameOriginRequest } from "@/lib/google-reviews/csrf";
import { NO_STORE, actorOf } from "@/lib/google-reviews/route-helpers";
import { GoogleStoreError, createSupabaseGoogleStore } from "@/lib/google-reviews/store";
import { GoogleViewError, readStoreSummaries } from "@/lib/google-reviews/views";

/**
 * /api/admin/google-reviews/locations — the seven approved stores and their links.
 *
 * GET lists them with match status, evidence summary and review totals.
 *
 * POST `{ "action": "confirm", "storeCode", "account", "location" }` accepts a
 * CANDIDATE: a Google location the last sync found for this store (the right
 * address but no store code in the profile, or the right code but no address).
 * It is refused unless that exact account + location is the one the sync itself
 * recorded for that store — an administrator can confirm what the system found,
 * never type in an arbitrary Google location. POST `{ "action": "clear",
 * "storeCode" }` removes a link; stored reviews are kept.
 *
 * Only the seven approved store codes are accepted; any other code is a 400.
 * `manage_integrations`, audited with the verified session's identity.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NAME_ACCOUNT = /^accounts\/[0-9]{1,30}$/;
const NAME_LOCATION = /^locations\/[0-9]{1,30}$/;

export async function GET(request: Request) {
  try {
    assertLiveMode();
    await authorizeRequest(request, "manage_integrations");
    return NextResponse.json({ status: "ok", stores: await readStoreSummaries() }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof GoogleViewError) {
      return NextResponse.json({ status: "failed", code: error.reason === "missing" ? "tables_not_created" : "store_unavailable", reason: error.message }, { status: 503, headers: NO_STORE });
    }
    return errorResponse(error, "admin/google-reviews/locations");
  }
}

export async function POST(request: Request) {
  try {
    if (!isSameOriginRequest(request)) {
      return NextResponse.json({ status: "refused", reason: "Cross-site request refused." }, { status: 403, headers: NO_STORE });
    }
    assertLiveMode();
    assertNoConfigurationProblems();
    const context = await authorizeRequest(request, "manage_integrations");
    assertWithinRateLimit(request, "mutate");

    const body = await parseJsonBody<Record<string, unknown>>(request);
    const storeCode = typeof body.storeCode === "string" ? body.storeCode : "";
    if (!approvedStoreByCode(storeCode)) {
      return NextResponse.json({ status: "invalid", code: "unknown_store", reason: "That is not one of the approved stores." }, { status: 400, headers: NO_STORE });
    }
    const store = createSupabaseGoogleStore();
    const actor = actorOf(context);

    if (body.action === "clear") {
      return NextResponse.json({ status: "ok", cleared: await store.clearLink(storeCode, actor) }, { headers: NO_STORE });
    }

    if (body.action === "confirm") {
      const account = typeof body.account === "string" ? body.account : "";
      const location = typeof body.location === "string" ? body.location : "";
      if (!NAME_ACCOUNT.test(account) || !NAME_LOCATION.test(location)) {
        return NextResponse.json({ status: "invalid", code: "bad_google_name", reason: "The Google account or location name is malformed." }, { status: 400, headers: NO_STORE });
      }
      const found = await store.getLocationEvidence(storeCode);
      const candidate = found?.evidence.candidate && typeof found.evidence.candidate === "object" ? (found.evidence.candidate as Record<string, unknown>) : null;
      if (found?.matchStatus !== "candidate" || !candidate || candidate.account !== account || candidate.location !== location) {
        return NextResponse.json(
          { status: "refused", code: "not_the_candidate", reason: "Only the candidate the sync found for this store can be confirmed. Run a sync and try again." },
          { status: 409, headers: NO_STORE },
        );
      }
      await store.recordLink(storeCode, account, location, "confirmed", "high", { ...found.evidence, confirmed_candidate: true }, actor);
      return NextResponse.json({ status: "ok", confirmed: true }, { headers: NO_STORE });
    }

    return NextResponse.json({ status: "invalid", code: "unknown_action", reason: "action must be \"confirm\" or \"clear\"." }, { status: 400, headers: NO_STORE });
  } catch (error) {
    if (error instanceof GoogleStoreError) return NextResponse.json({ status: "failed", code: error.code, reason: error.message }, { status: 503, headers: NO_STORE });
    return errorResponse(error, "admin/google-reviews/locations");
  }
}
