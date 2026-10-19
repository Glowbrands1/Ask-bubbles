import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/respond";
import { parseJsonBody } from "@/lib/api/validation";
import { parseReviewerChange, ReviewerInputError } from "@/lib/employees/woven/access/reviewers";
import { runRevokeReviewer } from "@/lib/employees/woven/access/reviewers-run";
import { authorizeWovenAdminDecision, NO_STORE, wovenStoreFailureResponse } from "@/lib/employees/woven/route-auth";

/**
 * POST /api/admin/employees/woven/termination-reviewers/revoke —
 * `{ "userId": "…", "reason": "…" }` revokes a reviewer designation.
 *
 * Administrator-only, same-origin, rate-limited; the acting administrator is
 * the verified session. A revoked designation invalidates every review made
 * under it immediately and for good (designating the person again does not
 * revive them); with nobody designated enforcement cannot act at all. Audited.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const context = await authorizeWovenAdminDecision(request);
    const input = parseReviewerChange(await parseJsonBody<Record<string, unknown>>(request));
    const outcome = await runRevokeReviewer(input, context.identity.subject);
    if (outcome.status === "refused") return NextResponse.json({ status: "refused", code: outcome.code }, { status: 409, headers: NO_STORE });
    return NextResponse.json({ status: outcome.status, designationId: outcome.designationId }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof ReviewerInputError) {
      return NextResponse.json({ status: error.code, reason: error.message }, { status: error.status, headers: NO_STORE });
    }
    return wovenStoreFailureResponse(error) ?? errorResponse(error, "admin/employees/woven/termination-reviewers/revoke");
  }
}
