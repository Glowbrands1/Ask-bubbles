import { NextResponse } from "next/server";

import { assertLiveMode, errorResponse } from "@/lib/api/respond";
import { inviteSuggestionForEmail } from "@/lib/admin/woven-invite-suggestion";
import { loadDirectoryRows } from "@/lib/employees/woven/directory";
import { listWovenLocations } from "@/lib/employees/woven/locations";
import { listWovenPositions } from "@/lib/employees/woven/positions";
import { authorizeWovenPeopleRequest, NO_STORE, wovenStoreFailureResponse } from "@/lib/employees/woven/route-auth";
import { getSupabaseAdmin } from "@/lib/supabase/server";

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

    const [directory, positions, locations, overrides] = await Promise.all([
      loadDirectoryRows(),
      listWovenPositions(),
      listWovenLocations(),
      /* Through the read-only access view, the one place Woven routes may see overrides. */
      getSupabaseAdmin().from("employee_access_accounts").select("override_external_employee_id").not("override_external_employee_id", "is", null),
    ]);
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
