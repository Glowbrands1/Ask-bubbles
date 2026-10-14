import { NextResponse } from "next/server";

import { assertLiveMode, assertNoConfigurationProblems, assertWithinRateLimit, errorResponse } from "@/lib/api/respond";
import { parseJsonBody } from "@/lib/api/validation";
import { DirectoryError } from "@/lib/admin/user-directory";
import { loadAccessPlan } from "@/lib/employees/woven/access/load";
import { createLinkedAccount } from "@/lib/admin/woven-account";
import { authorizeWovenPeopleRequest, NO_STORE, wovenStoreFailureResponse } from "@/lib/employees/woven/route-auth";

/**
 * GET  /api/admin/employees/woven/accounts   every synced employee, mapped or not, with account state
 * POST /api/admin/employees/woven/accounts   { externalEmployeeId, role, locationId } create (or repair the link of) ONE account
 *
 * `manage_users` AND `manage_integrations`. No email, invitation, code or
 * password is involved; the account is created disabled. See `provision.ts`.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertLiveMode();
    assertNoConfigurationProblems();
    await authorizeWovenPeopleRequest(request);
    const plan = await loadAccessPlan();
    const employees = plan.rows
      .filter((r) => r.externalEmployeeId !== null && r.wovenStatus !== null)
      .map((r) => ({
        externalEmployeeId: r.externalEmployeeId,
        name: r.employeeName,
        email: r.emailAddress,
        status: r.wovenStatus,
        position: r.wovenPosition,
        primaryLocation: r.wovenPrimaryLocation,
        suggestedRole: r.proposedRole,
        suggestedLocationId: r.proposedPrimaryAreaId,
        /* none: no account · linked: account linked to this employee · unlinked: an account with this email exists, link missing (repairable) */
        account: r.account === null ? "none" : r.account.via === "link" ? "linked" : "unlinked",
        notes: r.reasons,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ employees }, { headers: NO_STORE });
  } catch (error) {
    return wovenStoreFailureResponse(error) ?? errorResponse(error, "GET admin/employees/woven/accounts");
  }
}

export async function POST(request: Request) {
  try {
    assertLiveMode();
    assertNoConfigurationProblems();
    const context = await authorizeWovenPeopleRequest(request);
    assertWithinRateLimit(request, "mutate");

    const body = await parseJsonBody<{ externalEmployeeId?: unknown; role?: unknown; locationId?: unknown }>(request);
    if (typeof body.externalEmployeeId !== "string" || body.externalEmployeeId.length === 0) {
      return NextResponse.json({ error: "Choose an employee.", code: "invalid_input" }, { status: 400, headers: NO_STORE });
    }
    const result = await createLinkedAccount(
      { externalEmployeeId: body.externalEmployeeId, role: body.role, locationId: body.locationId },
      { id: context.identity.subject, email: context.identity.email, role: context.identity.role },
    );
    return NextResponse.json(result, { status: result.outcome === "created" ? 201 : 200, headers: NO_STORE });
  } catch (error) {
    if (error instanceof DirectoryError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: NO_STORE });
    }
    return wovenStoreFailureResponse(error) ?? errorResponse(error, "POST admin/employees/woven/accounts");
  }
}
