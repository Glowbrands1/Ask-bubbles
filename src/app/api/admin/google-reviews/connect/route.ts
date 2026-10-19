import { NextResponse } from "next/server";

import { assertLiveMode, assertNoConfigurationProblems, assertWithinRateLimit, errorResponse } from "@/lib/api/respond";
import { authorizeRequest } from "@/lib/auth/server";
import { CALLBACK_PATH, readGoogleReviewsConfig, readOAuthSettings } from "@/lib/google-reviews/config";
import { SealError } from "@/lib/google-reviews/crypto";
import { OAUTH_COOKIE, createAuthorization } from "@/lib/google-reviews/oauth";
import { NO_STORE } from "@/lib/google-reviews/route-helpers";

/**
 * GET /api/admin/google-reviews/connect — start the Google sign-in.
 *
 * `manage_integrations` only. It redirects the browser to Google's consent
 * screen for the single Business Profile scope, with PKCE and a `state`. The
 * attempt (state + PKCE verifier) is kept ONLY in a sealed, HttpOnly cookie that
 * is sent to the callback path and nowhere else, and expires in 10 minutes.
 *
 * Nothing is stored until the callback verifies it and Google hands back a
 * grant. If the OAuth client or the encryption key is not configured this
 * answers 503 naming the missing VARIABLES, never values.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertLiveMode();
    assertNoConfigurationProblems();
    const context = await authorizeRequest(request, "manage_integrations");
    assertWithinRateLimit(request, "mutate");

    const origin = new URL(request.url).origin;
    const config = readGoogleReviewsConfig();
    const settings = readOAuthSettings(process.env, origin);
    if (!config.credentialsReady || !settings) {
      return NextResponse.json(
        { status: "not_configured", code: "not_configured", missing: config.missingCredentials, reason: "Google OAuth is not configured, so a Google account cannot be connected yet." },
        { status: 503, headers: NO_STORE },
      );
    }

    const start = createAuthorization(settings, { subject: context.identity.subject });
    const response = NextResponse.redirect(start.url, { status: 302, headers: NO_STORE });
    response.cookies.set(OAUTH_COOKIE, start.cookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: CALLBACK_PATH,
      maxAge: start.maxAgeSeconds,
    });
    return response;
  } catch (error) {
    if (error instanceof SealError) {
      return NextResponse.json(
        { status: "not_configured", code: "not_configured", reason: error.message },
        { status: 503, headers: NO_STORE },
      );
    }
    return errorResponse(error, "admin/google-reviews/connect");
  }
}
