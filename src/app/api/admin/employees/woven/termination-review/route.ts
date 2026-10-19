import { NextResponse } from "next/server";

import { assertLiveMode, assertNoConfigurationProblems, errorResponse } from "@/lib/api/respond";
import { parseJsonBody } from "@/lib/api/validation";
import { parseShadowReview, ShadowReviewError } from "@/lib/employees/woven/access/shadow-review";
import { loadShadowReviewCandidates, runShadowReview } from "@/lib/employees/woven/access/shadow-review-run";
import { authorizeWovenAdminDecision, authorizeWovenPeopleRequest, NO_STORE, wovenStoreFailureResponse } from "@/lib/employees/woven/route-auth";

/**
 * /api/admin/employees/woven/termination-review — the administrator's review of
 * the newest shadow run, the human gate before termination enforcement.
 *
 *   GET   the newest shadow run, whether the gate is open, and the EmployeeIDs
 *         it planned to disable (ids and counts only).
 *   POST  { "shadowRunId": "…", "employeeIds": ["…"], "reason": "…" } records
 *         the review. Administrator-only, same-origin, rate-limited; the
 *         reviewer is the verified session. The database re-checks that the
 *         reviewer is an active administrator, that this is the newest clean,
 *         fresh run, that every id was planned by it, and the pinned company.
 *
 * Records a review; changes nobody's access.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertLiveMode();
    assertNoConfigurationProblems();
    await authorizeWovenPeopleRequest(request);
    return NextResponse.json(await loadShadowReviewCandidates(), { headers: NO_STORE });
  } catch (error) {
    return wovenStoreFailureResponse(error) ?? errorResponse(error, "admin/employees/woven/termination-review");
  }
}

export async function POST(request: Request) {
  try {
    const context = await authorizeWovenAdminDecision(request);
    const input = parseShadowReview(await parseJsonBody<Record<string, unknown>>(request));
    const outcome = await runShadowReview(input, context.identity.subject);
    if (outcome.status === "refused") {
      return NextResponse.json({ status: "refused", code: outcome.code }, { status: 409, headers: NO_STORE });
    }
    return NextResponse.json(
      { status: "recorded", reviewId: outcome.reviewId, employeeCount: outcome.employeeCount, idsSha256: outcome.idsSha256 },
      { headers: NO_STORE },
    );
  } catch (error) {
    if (error instanceof ShadowReviewError) {
      return NextResponse.json({ status: error.code, reason: error.message }, { status: error.status, headers: NO_STORE });
    }
    return wovenStoreFailureResponse(error) ?? errorResponse(error, "admin/employees/woven/termination-review");
  }
}
