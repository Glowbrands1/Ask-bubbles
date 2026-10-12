import { NextResponse } from "next/server";

import { assertLiveMode, assertNoConfigurationProblems, assertWithinRateLimit, errorResponse } from "@/lib/api/respond";
import { parseJsonBody } from "@/lib/api/validation";
import { authorizeRequest } from "@/lib/auth/server";
import { NO_STORE, actorOf, parseSyncRequest } from "@/lib/google-reviews/route-helpers";
import { readGoogleReviewsStatus } from "@/lib/google-reviews/status";
import { GoogleStoreError } from "@/lib/google-reviews/store";
import { outcomeHttpStatus, runGoogleReviewsSync } from "@/lib/google-reviews/sync";
import { GoogleViewError } from "@/lib/google-reviews/views";

/**
 * /api/admin/google-reviews/sync — the MANUAL review sync, and its status.
 *
 * POST runs a sync now. It is a DRY RUN UNLESS THE BODY SAYS OTHERWISE: `{}`
 * reads Google, matches the seven stores and counts, and saves nothing. A save
 * needs THREE things, each checked on its own:
 *   1. `"dryRun": false`,
 *   2. `"confirmSave": true` — without it, `dryRun: false` is refused with 400
 *      before the sync starts, and
 *   3. GOOGLE_REVIEWS_WRITES_ENABLED — while it is off the save is refused (409
 *      `writes_disabled`) before Google or the database is touched.
 *
 * GET reports whether the integration is switched on, which variables are
 * missing (by NAME), the connection, the recent runs and the one thing blocking
 * live reviews, if anything.
 *
 * `manage_integrations`. The audit label comes from the verified session. The
 * response is codes and counts: never review text, a reviewer, a token, or a
 * Google error body.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    assertLiveMode();
    assertNoConfigurationProblems();
    const context = await authorizeRequest(request, "manage_integrations");
    assertWithinRateLimit(request, "mutate");

    const asked = parseSyncRequest(await parseJsonBody<Record<string, unknown>>(request).catch(() => ({})));
    if (asked.kind === "confirmation_required") {
      return NextResponse.json(
        { status: "confirmation_required", field: "confirmSave", reason: "Saving needs both dryRun: false and confirmSave: true." },
        { status: 400, headers: NO_STORE },
      );
    }

    const outcome = await runGoogleReviewsSync({ requestedBy: actorOf(context), dryRun: asked.kind === "dry_run" });
    return NextResponse.json(outcome, { status: outcomeHttpStatus(outcome), headers: NO_STORE });
  } catch (error) {
    if (error instanceof GoogleStoreError) return NextResponse.json({ status: "failed", code: error.code, reason: error.message }, { status: 503, headers: NO_STORE });
    return errorResponse(error, "admin/google-reviews/sync");
  }
}

export async function GET(request: Request) {
  try {
    assertLiveMode();
    await authorizeRequest(request, "manage_integrations");
    return NextResponse.json({ status: "ok", ...(await readGoogleReviewsStatus(new URL(request.url).origin)) }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof GoogleViewError) {
      return NextResponse.json(
        { status: "failed", code: error.reason === "missing" ? "tables_not_created" : "store_unavailable", reason: error.message },
        { status: 503, headers: NO_STORE },
      );
    }
    return errorResponse(error, "admin/google-reviews/sync");
  }
}
