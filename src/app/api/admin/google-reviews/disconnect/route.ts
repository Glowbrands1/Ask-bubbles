import { NextResponse } from "next/server";

import { assertLiveMode, assertNoConfigurationProblems, assertWithinRateLimit, errorResponse } from "@/lib/api/respond";
import { authorizeRequest } from "@/lib/auth/server";
import { REFRESH_TOKEN_LABEL, open } from "@/lib/google-reviews/crypto";
import { revokeRefreshToken } from "@/lib/google-reviews/oauth";
import { NO_STORE, actorOf } from "@/lib/google-reviews/route-helpers";
import { GoogleStoreError, createSupabaseGoogleStore } from "@/lib/google-reviews/store";

/**
 * POST /api/admin/google-reviews/disconnect — end the Google connection.
 *
 * `manage_integrations` only. Asks Google to revoke the grant (best effort — a
 * failure there never blocks this) and marks the local connection revoked, so
 * no further sync can run until someone connects again. Stored reviews are kept.
 * Returns whether Google confirmed the revocation; never a token.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertLiveMode();
    assertNoConfigurationProblems();
    const context = await authorizeRequest(request, "manage_integrations");
    assertWithinRateLimit(request, "mutate");

    const store = createSupabaseGoogleStore();
    const connection = await store.getActiveConnection();
    if (!connection) return NextResponse.json({ status: "ok", disconnected: false, reason: "No Google account is connected." }, { headers: NO_STORE });

    let revokedAtGoogle = false;
    try {
      revokedAtGoogle = await revokeRefreshToken(open(connection.refreshTokenSealed, REFRESH_TOKEN_LABEL));
    } catch {
      // The token could not even be opened (key problem): still end the local connection.
    }
    await store.endConnection("revoked", null, actorOf(context));
    return NextResponse.json({ status: "ok", disconnected: true, revokedAtGoogle }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof GoogleStoreError) return NextResponse.json({ status: "failed", code: error.code, reason: error.message }, { status: 503, headers: NO_STORE });
    return errorResponse(error, "admin/google-reviews/disconnect");
  }
}
