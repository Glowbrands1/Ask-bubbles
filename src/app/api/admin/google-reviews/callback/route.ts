import { NextResponse } from "next/server";

import { assertLiveMode, assertNoConfigurationProblems, errorResponse } from "@/lib/api/respond";
import { authorizeRequest } from "@/lib/auth/server";
import { CALLBACK_PATH, readGoogleReviewsConfig, readOAuthSettings } from "@/lib/google-reviews/config";
import { REFRESH_TOKEN_LABEL, SealError, seal } from "@/lib/google-reviews/crypto";
import { OAUTH_COOKIE, OAuthError, exchangeAuthorizationCode, verifyAttempt } from "@/lib/google-reviews/oauth";
import { OAUTH_RESULTS, actorOf, readCookie, screenUrl, type OAuthResult } from "@/lib/google-reviews/route-helpers";
import { GoogleStoreError, createSupabaseGoogleStore } from "@/lib/google-reviews/store";

/**
 * GET /api/admin/google-reviews/callback — Google sends the browser back here.
 *
 * `manage_integrations` is required AGAIN: the signed-in administrator who
 * starts a connection is the one who completes it. Then, in order:
 *   1. the sealed attempt cookie is opened and its `state` compared in constant
 *      time with the one Google returned (a forged or replayed callback fails);
 *   2. the code is exchanged using the PKCE verifier from that cookie;
 *   3. only a grant that INCLUDES the Business Profile scope and a refresh
 *      token is accepted;
 *   4. the refresh token is SEALED (AES-256-GCM) and saved as the single active
 *      connection, replacing any earlier one. The access token is discarded.
 *
 * The browser is then redirected to the screen with a result CODE from a closed
 * list; nothing from Google's query string is ever reflected, and the attempt
 * cookie is cleared whatever happened.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function done(request: Request, result: OAuthResult): NextResponse {
  const response = NextResponse.redirect(screenUrl(request, result), { status: 303, headers: { "Cache-Control": "no-store" } });
  response.cookies.set(OAUTH_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: CALLBACK_PATH, maxAge: 0 });
  return response;
}

export async function GET(request: Request) {
  try {
    assertLiveMode();
    assertNoConfigurationProblems();
    const context = await authorizeRequest(request, "manage_integrations");

    const url = new URL(request.url);
    const config = readGoogleReviewsConfig();
    const settings = readOAuthSettings(process.env, url.origin);
    if (!config.credentialsReady || !settings) return done(request, "not_configured");

    if (url.searchParams.get("error")) return done(request, "denied"); // the person declined, or Google refused; no detail is reflected

    const code = url.searchParams.get("code");
    if (!code) return done(request, "attempt_invalid");

    const { verifier } = verifyAttempt(readCookie(request.headers.get("cookie"), OAUTH_COOKIE), url.searchParams.get("state"), {
      subject: context.identity.subject,
    });
    const grant = await exchangeAuthorizationCode(settings, code, verifier);

    const store = createSupabaseGoogleStore();
    await store.saveConnection(seal(grant.refreshToken, REFRESH_TOKEN_LABEL), grant.scopes, actorOf(context));
    return done(request, "connected");
  } catch (error) {
    if (error instanceof OAuthError) return done(request, (OAUTH_RESULTS as readonly string[]).includes(error.code) ? (error.code as OAuthResult) : "bad_response");
    if (error instanceof SealError) return done(request, "not_configured");
    if (error instanceof GoogleStoreError) return done(request, "store_error");
    return errorResponse(error, "admin/google-reviews/callback");
  }
}
