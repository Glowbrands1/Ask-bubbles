import { NextResponse } from "next/server";

import { WOVEN_TENANT } from "@/config/company/woven";
import { assertLiveMode, errorResponse } from "@/lib/api/respond";
import { inviteSuggestionForEmail } from "@/lib/admin/woven-invite-suggestion";
import { loadDirectoryRows } from "@/lib/employees/woven/directory";
import { listWovenLocations } from "@/lib/employees/woven/locations";
import { listWovenPositions } from "@/lib/employees/woven/positions";
import { authorizeWovenPeopleRequest, NO_STORE, wovenStoreFailureResponse } from "@/lib/employees/woven/route-auth";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { escapeLike } from "@/lib/supabase/like";

/**
 * GET /api/admin/employees/woven/invite-suggestion?email=… — what Woven can
 * suggest for an invitation to this address.
 *
 * A SUGGESTION ONLY. It changes nothing and grants nothing: the Invite dialog
 * shows it, an administrator chooses to apply it, and the invitation is then
 * validated by `POST /api/admin/users` as if it had been typed by hand.
 *
 * Returns a name and position, so `manage_users` AND `manage_integrations`,
 * like every other Woven route that returns people. The address is read from
 * the query only to look it up; it is not stored or logged.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertLiveMode();
    await authorizeWovenPeopleRequest(request);

    const email = new URL(request.url).searchParams.get("email");
    if (!email || email.length > 254) {
      return NextResponse.json({ status: "invalid", reason: "An email address is required." }, { status: 400, headers: NO_STORE });
    }

    /*
     * TENANT BOUNDARY. The database already pins every directory row and location
     * mapping to the one Woven company (a NOT NULL CHECK), and the account-creation
     * path re-checks it; this does too, so a suggestion can only ever come from a
     * record of the pinned company. The address is escaped, so a `%` or `_` in it
     * cannot widen the match.
     */
    const pattern = escapeLike(email.trim());
    const tenant = await getSupabaseAdmin()
      .from("employee_access_directory")
      .select("external_employee_id")
      .eq("woven_company_id", WOVEN_TENANT.companyId.toLowerCase())
      .ilike("email_address", pattern);
    if (tenant.error) {
      return NextResponse.json({ status: "failed", code: "store_unavailable", reason: "The directory could not be read." }, { status: 503, headers: NO_STORE });
    }
    const tenantIds = new Set(((tenant.data ?? []) as { external_employee_id: string }[]).map((r) => r.external_employee_id));

    const [allRows, positions, locations, overrides] = await Promise.all([
      loadDirectoryRows(),
      listWovenPositions(),
      listWovenLocations(),
      /* Through the read-only access view, the one place Woven routes may see overrides. */
      getSupabaseAdmin().from("employee_access_accounts").select("override_external_employee_id").not("override_external_employee_id", "is", null),
    ]);
    const directory = allRows.filter((row) => tenantIds.has(row.externalEmployeeId));
    /* A protected role override means a person already decided this role: no position-based suggestion. */
    const overridden = new Set(
      ((overrides.data ?? []) as { override_external_employee_id: string | null }[])
        .map((r) => r.override_external_employee_id)
        .filter((id): id is string => typeof id === "string"),
    );
    return NextResponse.json(inviteSuggestionForEmail(email, directory, positions, locations, overridden), { headers: NO_STORE });
  } catch (error) {
    return wovenStoreFailureResponse(error) ?? errorResponse(error, "admin/employees/woven/invite-suggestion");
  }
}
