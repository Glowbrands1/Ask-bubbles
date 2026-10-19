import { NextResponse } from "next/server";

import { assertLiveMode, assertNoConfigurationProblems, errorResponse } from "@/lib/api/respond";
import { parseJsonBody } from "@/lib/api/validation";
import { parseReviewerChange, ReviewerInputError } from "@/lib/employees/woven/access/reviewers";
import { listDesignations, runDesignateReviewer } from "@/lib/employees/woven/access/reviewers-run";
import { authorizeWovenAdminDecision, authorizeWovenPeopleRequest, NO_STORE, wovenStoreFailureResponse } from "@/lib/employees/woven/route-auth";

/**
 * /api/admin/employees/woven/termination-reviewers — who may review termination
 * enforcement. The list STARTS EMPTY; nobody is seeded or assumed. Who should be
 * designated is a Buff City Soap decision.
 *
 *   GET   every designation, current and closed (account ids, emails, reasons).
 *   POST  { "userId": "…", "reason": "…" } designates ANOTHER active administrator.
 *         Administrator-only, same-origin, rate-limited; the acting administrator
 *         is the verified session (never the body). The database re-checks that
 *         the actor and the designee are active admin/owner/developer accounts,
 *         that they differ, and that the reason is written; audited.
 *
 * Revoking is POST .../termination-reviewers/revoke.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertLiveMode();
    assertNoConfigurationProblems();
    await authorizeWovenPeopleRequest(request);
    return NextResponse.json({ designations: await listDesignations() }, { headers: NO_STORE });
  } catch (error) {
    return wovenStoreFailureResponse(error) ?? errorResponse(error, "admin/employees/woven/termination-reviewers");
  }
}

export async function POST(request: Request) {
  try {
    const context = await authorizeWovenAdminDecision(request);
    const input = parseReviewerChange(await parseJsonBody<Record<string, unknown>>(request));
    const outcome = await runDesignateReviewer(input, context.identity.subject);
    if (outcome.status === "refused") return NextResponse.json({ status: "refused", code: outcome.code }, { status: 409, headers: NO_STORE });
    return NextResponse.json({ status: outcome.status, designationId: outcome.designationId }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof ReviewerInputError) {
      return NextResponse.json({ status: error.code, reason: error.message }, { status: error.status, headers: NO_STORE });
    }
    return wovenStoreFailureResponse(error) ?? errorResponse(error, "admin/employees/woven/termination-reviewers");
  }
}
