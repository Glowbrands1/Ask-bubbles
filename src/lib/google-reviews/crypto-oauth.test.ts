import { randomBytes } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { readGoogleReviewsConfig, readOAuthSettings, resolveRedirectUri } from "./config";
import { OAUTH_STATE_LABEL, REFRESH_TOKEN_LABEL, SealError, open, readEncryptionKey, safeEqual, seal } from "./crypto";
import {
  BUSINESS_SCOPE,
  GOOGLE_AUTH_URL,
  OAuthError,
  createAuthorization,
  exchangeAuthorizationCode,
  refreshAccessToken,
  revokeRefreshToken,
  verifyAttempt,
} from "./oauth";

const KEY = randomBytes(32);
const settings = { clientId: "client-id.apps.example", clientSecret: "SECRET-VALUE-0001", redirectUri: "https://askbubbles.example/api/admin/google-reviews/callback" };

const json = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("sealing the refresh token", () => {
  it("round-trips, uses a fresh nonce each time, and never leaks the plaintext into the sealed form", () => {
    const token = "1//0gSyntheticRefreshToken-abcdef";
    const a = seal(token, REFRESH_TOKEN_LABEL, KEY);
    const b = seal(token, REFRESH_TOKEN_LABEL, KEY);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(a).not.toContain(token);
    expect(open(a, REFRESH_TOKEN_LABEL, KEY)).toBe(token);
  });

  it("refuses the wrong key, the wrong label, tampering and malformed input", () => {
    const sealed = seal("secret", REFRESH_TOKEN_LABEL, KEY);
    expect(() => open(sealed, REFRESH_TOKEN_LABEL, randomBytes(32))).toThrow(SealError);
    expect(() => open(sealed, OAUTH_STATE_LABEL, KEY)).toThrow(SealError); // a sealed value cannot be moved to another field
    const parts = sealed.split(".");
    const tampered = [parts[0], parts[1], parts[2], Buffer.from("tampered").toString("base64url")].join(".");
    expect(() => open(tampered, REFRESH_TOKEN_LABEL, KEY)).toThrow(SealError);
    for (const bad of ["", "x", "v2.a.b.c", "v1.a.b", "v1.!!.b.c", "1//0gPlaintext"]) expect(() => open(bad, REFRESH_TOKEN_LABEL, KEY)).toThrow(SealError);
  });

  it("validates the key and never echoes it", () => {
    expect(() => readEncryptionKey({})).toThrow(/GOOGLE_TOKEN_ENCRYPTION_KEY is not set/);
    for (const bad of ["short", Buffer.from("x".repeat(31)).toString("base64"), "not base64 at all !!!"]) {
      try {
        readEncryptionKey({ GOOGLE_TOKEN_ENCRYPTION_KEY: bad });
        throw new Error("should have thrown");
      } catch (error) {
        expect((error as Error).message).not.toContain(bad);
        expect((error as SealError).code).toBe("key_invalid");
      }
    }
    expect(readEncryptionKey({ GOOGLE_TOKEN_ENCRYPTION_KEY: KEY.toString("base64") }).equals(KEY)).toBe(true);
  });

  it("compares in constant time and rejects length differences", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("configuration", () => {
  it("is off by default and reports missing credentials by NAME only", () => {
    const c = readGoogleReviewsConfig({});
    expect([c.enabled, c.writesEnabled, c.scheduleEnabled, c.credentialsReady]).toEqual([false, false, false, false]);
    expect(c.missingCredentials).toEqual(["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_TOKEN_ENCRYPTION_KEY"]);
    const on = readGoogleReviewsConfig({ GOOGLE_REVIEWS_SYNC_ENABLED: "TRUE", GOOGLE_OAUTH_CLIENT_ID: "x", GOOGLE_OAUTH_CLIENT_SECRET: "y", GOOGLE_TOKEN_ENCRYPTION_KEY: "z" });
    expect([on.enabled, on.writesEnabled, on.credentialsReady]).toEqual([true, false, true]);
    expect(JSON.stringify(c)).not.toMatch(/SECRET-VALUE/);
  });

  it("derives the redirect URI from the site URL, lets it be set explicitly, and refuses to guess", () => {
    expect(resolveRedirectUri({ NEXT_PUBLIC_SITE_URL: "https://askbubbles.vercel.app/" })).toBe("https://askbubbles.vercel.app/api/admin/google-reviews/callback");
    expect(resolveRedirectUri({ GOOGLE_OAUTH_REDIRECT_URI: "https://x.example/cb" })).toBe("https://x.example/cb");
    expect(resolveRedirectUri({})).toBeNull();
    expect(readOAuthSettings({ GOOGLE_OAUTH_CLIENT_ID: "a", GOOGLE_OAUTH_CLIENT_SECRET: "b" })).toBeNull();
  });
});

describe("authorization request", () => {
  it("asks for offline access with PKCE S256, the single business scope, and a state", () => {
    const start = createAuthorization(settings, { key: KEY });
    const url = new URL(start.url);
    expect(url.origin + url.pathname).toBe(GOOGLE_AUTH_URL);
    expect(url.searchParams.get("scope")).toBe(BUSINESS_SCOPE);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get("state")!.length).toBeGreaterThanOrEqual(24);
    expect(url.searchParams.get("client_secret")).toBeNull();
    expect(start.url).not.toContain(settings.clientSecret);
    expect(start.cookieValue).not.toContain(url.searchParams.get("state")!); // the cookie is sealed, not readable
  });

  it("verifies state, is single-purpose, expires, and rejects tampering — returning only the verifier", () => {
    const now = 1_700_000_000_000;
    const start = createAuthorization(settings, { key: KEY, now });
    const state = new URL(start.url).searchParams.get("state")!;
    expect(verifyAttempt(start.cookieValue, state, { key: KEY, now: now + 1000 }).verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(() => verifyAttempt(start.cookieValue, state + "x", { key: KEY, now })).toThrowError(expect.objectContaining({ code: "state_mismatch" }));
    expect(() => verifyAttempt(start.cookieValue, state, { key: KEY, now: now + 601_000 })).toThrowError(expect.objectContaining({ code: "attempt_expired" }));
    expect(() => verifyAttempt(undefined, state, { key: KEY })).toThrowError(expect.objectContaining({ code: "attempt_invalid" }));
    expect(() => verifyAttempt(start.cookieValue, null, { key: KEY })).toThrowError(expect.objectContaining({ code: "attempt_invalid" }));
    expect(() => verifyAttempt("v1.a.b.c", state, { key: KEY })).toThrowError(expect.objectContaining({ code: "attempt_invalid" }));
    expect(() => verifyAttempt(start.cookieValue, state, { key: randomBytes(32), now })).toThrowError(expect.objectContaining({ code: "attempt_invalid" }));
  });
});

describe("code exchange and refresh", () => {
  it("exchanges a code with the PKCE verifier, keeps only the refresh token, and requires the business scope", async () => {
    const calls: { url: string; body: string }[] = [];
    const fetchImpl = async (url: string, init?: RequestInit) => {
      calls.push({ url, body: String(init?.body) });
      return json(200, { access_token: "ACCESS-DISCARDED", refresh_token: "REFRESH-1", scope: `openid ${BUSINESS_SCOPE}`, expires_in: 3600 })();
    };
    const grant = await exchangeAuthorizationCode(settings, "the-code", "the-verifier", fetchImpl);
    expect(grant).toEqual({ refreshToken: "REFRESH-1", scopes: ["openid", BUSINESS_SCOPE] });
    expect(JSON.stringify(grant)).not.toContain("ACCESS-DISCARDED");
    expect(calls[0]!.url).toBe("https://oauth2.googleapis.com/token");
    const body = new URLSearchParams(calls[0]!.body);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code_verifier")).toBe("the-verifier");
    expect(body.get("redirect_uri")).toBe(settings.redirectUri);
  });

  it("refuses a grant with no refresh token or without the business scope, and maps Google errors to codes without echoing bodies", async () => {
    await expect(exchangeAuthorizationCode(settings, "c", "v", json(200, { access_token: "a", scope: BUSINESS_SCOPE }))).rejects.toMatchObject({ code: "no_refresh_token" });
    await expect(exchangeAuthorizationCode(settings, "c", "v", json(200, { refresh_token: "r", scope: "openid email" }))).rejects.toMatchObject({ code: "missing_scope" });
    await expect(exchangeAuthorizationCode(settings, "c", "v", json(400, { error: "invalid_grant", error_description: "Bad Request for account bob@example.invalid" }))).rejects.toMatchObject({ code: "invalid_grant" });
    await expect(exchangeAuthorizationCode(settings, "c", "v", json(401, { error: "invalid_client" }))).rejects.toMatchObject({ code: "invalid_client" });
    await expect(exchangeAuthorizationCode(settings, "c", "v", json(500, { error: "weird free text with a token ya29.abc" }))).rejects.toMatchObject({ code: "bad_response" });
    try {
      await exchangeAuthorizationCode(settings, "c", "v", json(400, { error: "invalid_grant", error_description: "bob@example.invalid ya29.SECRET" }));
    } catch (error) {
      expect((error as Error).message).not.toMatch(/bob@|ya29/);
    }
  });

  it("refreshes an access token with a safety margin, and reports a revoked grant as invalid_grant", async () => {
    const t = await refreshAccessToken(settings, "REFRESH-1", json(200, { access_token: "ACCESS-1", expires_in: 3600 }), () => 1_000_000);
    expect(t).toEqual({ value: "ACCESS-1", expiresAt: 1_000_000 + 3540 * 1000 });
    await expect(refreshAccessToken(settings, "R", json(400, { error: "invalid_grant" }))).rejects.toMatchObject({ code: "invalid_grant" });
    await expect(refreshAccessToken(settings, "R", json(200, { access_token: "" }))).rejects.toMatchObject({ code: "bad_response" });
  });

  it("turns a dropped connection into network_error and never follows redirects", async () => {
    await expect(exchangeAuthorizationCode(settings, "c", "v", async () => { throw new TypeError("fetch failed https://x?refresh_token=SECRET"); })).rejects.toMatchObject({ code: "network_error" });
    const seen = vi.fn(json(200, {}));
    await revokeRefreshToken("R", seen);
    expect(OAuthError).toBeDefined();
  });

  it("revoke is best-effort: true on 200, false on any failure", async () => {
    expect(await revokeRefreshToken("R", json(200, {}))).toBe(true);
    expect(await revokeRefreshToken("R", json(400, { error: "invalid_token" }))).toBe(false);
    expect(await revokeRefreshToken("R", async () => { throw new Error("down"); })).toBe(false);
  });
});
