import { NextResponse } from "next/server";

import { assertLiveMode, assertNoConfigurationProblems, assertWithinRateLimit, errorResponse } from "@/lib/api/respond";
import { parseJsonBody } from "@/lib/api/validation";
import { PROVISION_BATCH_MAX, runProvisioning } from "@/lib/admin/woven-account";
import { authorizeWovenPeopleRequest, NO_STORE, wovenStoreFailureResponse } from "@/lib/employees/woven/route-auth";

/**
 * POST /api/admin/employees/woven/provision
 *
 *   { "apply": false }                    dry run: READY / EXISTING / BLOCKED + exceptions (default)
 *   { "apply": true, "batchSize": 25 }    create up to batchSize READY accounts. NO email, invitation or code is sent
 *
 * `manage_users` AND `manage_integrations`. Re-run until `ready` is 0: created
 * people become EXISTING, so a rerun never duplicates anyone.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertLiveMode();
    assertNoConfigurationProblems();
    const context = await authorizeWovenPeopleRequest(request);
    assertWithinRateLimit(request, "mutate");

    const body = await parseJsonBody<{ apply?: unknown; batchSize?: unknown }>(request);
    const batchSize = Math.min(PROVISION_BATCH_MAX, Math.max(1, Number.isInteger(body.batchSize) ? (body.batchSize as number) : PROVISION_BATCH_MAX));
    const result = await runProvisioning({
      apply: body.apply === true,
      batchSize,
      actor: { id: context.identity.subject, email: context.identity.email, role: context.identity.role },
    });
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (error) {
    return wovenStoreFailureResponse(error) ?? errorResponse(error, "admin/employees/woven/provision");
  }
}
