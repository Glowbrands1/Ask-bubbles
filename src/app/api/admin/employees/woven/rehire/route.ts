import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/respond";
import { parseJsonBody } from "@/lib/api/validation";
import { parseRehire, RehireInputError } from "@/lib/employees/woven/access/rehire";
import { runRehireApproval } from "@/lib/employees/woven/access/rehire-run";
import { authorizeWovenAdminDecision, NO_STORE, wovenStoreFailureResponse } from "@/lib/employees/woven/route-auth";

/**
 * POST /api/admin/employees/woven/rehire — an administrator approves restoring
 * access to an account Woven termination enforcement revoked.
 *
 *   { "appUserId": "…", "externalEmployeeId": "…", "reason": "Rehired 2026-11-02, confirmed with HR" }
 *
 * THE ONLY PATH THAT RESTORES SUCH AN ACCOUNT. Administrator-only, same-origin,
 * rate-limited; the approving administrator is the verified session (never the
 * body) and the database re-checks they are an ACTIVE admin/owner/developer.
 * The database also requires a written reason, a confirmed link revoked by
 * enforcement, and Woven's latest successful read of the pinned company showing
 * the employee Active. Enables the profile, lifts the Auth ban, clears the
 * revocation record and audits the approver and reason. A partial failure is
 * reported 502 `incomplete` — never success — and approving again retries.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const context = await authorizeWovenAdminDecision(request);
    const input = parseRehire(await parseJsonBody<Record<string, unknown>>(request));
    const outcome = await runRehireApproval(input, context.identity.subject);
    switch (outcome.status) {
      case "rehired":
      case "already_rehired":
        return NextResponse.json({ status: outcome.status }, { headers: NO_STORE });
      case "refused":
        return NextResponse.json({ status: "refused", code: outcome.code }, { status: 409, headers: NO_STORE });
      case "incomplete":
        return NextResponse.json(
          { status: "incomplete", code: outcome.code, reason: "The rehire did not complete and the account is not usable. Approve again to retry." },
          { status: 502, headers: NO_STORE },
        );
    }
  } catch (error) {
    if (error instanceof RehireInputError) {
      return NextResponse.json({ status: error.code, reason: error.message }, { status: error.status, headers: NO_STORE });
    }
    return wovenStoreFailureResponse(error) ?? errorResponse(error, "admin/employees/woven/rehire");
  }
}
