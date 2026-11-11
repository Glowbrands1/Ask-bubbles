import { NextResponse } from "next/server";

import { assertLiveMode, assertNoConfigurationProblems, assertWithinRateLimit, errorResponse } from "@/lib/api/respond";
import { parseJsonBody } from "@/lib/api/validation";
import { authorizeRequest } from "@/lib/auth/server";
import { AutoSyncError, readAutoSync, setAutoSync, wovenCronSchedule } from "@/lib/employees/woven/auto-sync";
import { readWovenConfig } from "@/lib/employees/woven/config";

/**
 * /api/admin/employees/woven/auto-sync — the Auto Sync switch.
 *
 * GET   the setting (on/off, who and when) and the schedule this build runs.
 * POST  `{"enabled": true | false}` switches it.
 *
 * `manage_integrations` only (admin, owner, developer). The audit label comes
 * from the VERIFIED session, never from the body.
 *
 * Turning OFF always works. Turning ON is refused unless ALL of these hold, each
 * reported by its own code so the screen can say which one:
 *   - the Woven sync is on and its company is the pinned Midwest Soap Makers one
 *     and its credentials are present                        (`sync_not_ready`)
 *   - stored syncs are allowed (WOVEN_SYNC_WRITES_ENABLED)   (`writes_disabled`)
 *   - this build's vercel.json schedules the cron            (`not_scheduled`)
 *   - a stored sync has saved the directory — enforced by the DATABASE function
 *                                       (`auto_sync_requires_saved_directory`)
 *
 * The switch starts no sync and reads nothing from Woven. It does not enable
 * invitations, logins, disabling or deletion: none of those exist in the sync.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function refusal(code: string, reason: string, status = 409) {
  return NextResponse.json({ status: "refused", code, reason }, { status, headers: NO_STORE });
}

export async function GET(request: Request) {
  try {
    assertLiveMode();
    await authorizeRequest(request, "manage_integrations");
    const setting = await readAutoSync();
    return NextResponse.json({ status: "ok", setting, schedule: wovenCronSchedule()?.expression ?? null }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof AutoSyncError) {
      return NextResponse.json({ status: "failed", code: error.code, reason: error.message }, { status: 503, headers: NO_STORE });
    }
    return errorResponse(error, "admin/employees/woven/auto-sync");
  }
}

export async function POST(request: Request) {
  try {
    assertLiveMode();
    assertNoConfigurationProblems();
    const context = await authorizeRequest(request, "manage_integrations");
    assertWithinRateLimit(request, "mutate");

    const body = await parseJsonBody<Record<string, unknown>>(request);
    if (typeof body.enabled !== "boolean") {
      return refusal("invalid_request", 'Send {"enabled": true} or {"enabled": false}.', 400);
    }

    if (body.enabled) {
      const config = readWovenConfig();
      if (config.tenantProblem || !config.enabled || config.missingCredentials.length > 0) {
        return refusal("sync_not_ready", "The Woven employee sync is not switched on and fully configured for Midwest Soap Makers, so a schedule would have nothing to run.");
      }
      if (!config.writesEnabled) {
        return refusal("writes_disabled", "Stored syncs are switched off (WOVEN_SYNC_WRITES_ENABLED), so a scheduled run could not save anything.");
      }
      if (!wovenCronSchedule()) {
        return refusal("not_scheduled", "This deployment's vercel.json does not schedule the Woven employee cron.");
      }
    }

    const actor = `admin:${context.identity.email || context.identity.subject}`.slice(0, 200);
    const result = await setAutoSync(body.enabled, actor);
    return NextResponse.json({ status: "ok", ...result }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof AutoSyncError) {
      if (error.code === "auto_sync_requires_saved_directory") return refusal(error.code, error.message);
      return NextResponse.json({ status: "failed", code: error.code, reason: error.message }, { status: 503, headers: NO_STORE });
    }
    return errorResponse(error, "admin/employees/woven/auto-sync");
  }
}
