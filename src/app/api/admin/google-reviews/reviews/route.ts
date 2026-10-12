import { NextResponse } from "next/server";

import { assertLiveMode, errorResponse } from "@/lib/api/respond";
import { authorizeRequest } from "@/lib/auth/server";
import { NO_STORE } from "@/lib/google-reviews/route-helpers";
import { GoogleViewError, parseReviewQuery, readReviewPage } from "@/lib/google-reviews/views";

/**
 * GET /api/admin/google-reviews/reviews — the review list, filtered and paged.
 *
 * Query: store (one of the seven codes), rating (1–5), reply (answered |
 * unanswered), from / to (YYYY-MM-DD, Central time, inclusive), removed (1),
 * page. Anything else is ignored, never passed to the database.
 *
 * `manage_integrations`: review text is customer-written content, shown to
 * administrators only. No reviewer name, photo or id exists to return.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertLiveMode();
    await authorizeRequest(request, "manage_integrations");
    const query = parseReviewQuery(new URL(request.url).searchParams);
    return NextResponse.json({ status: "ok", query, ...(await readReviewPage(query)) }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof GoogleViewError) {
      return NextResponse.json({ status: "failed", code: error.reason === "missing" ? "tables_not_created" : "store_unavailable", reason: error.message }, { status: 503, headers: NO_STORE });
    }
    return errorResponse(error, "admin/google-reviews/reviews");
  }
}
