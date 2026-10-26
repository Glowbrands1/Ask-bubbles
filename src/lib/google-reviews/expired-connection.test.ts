import { afterEach, describe, expect, it, vi } from "vitest";

import { blockerText } from "@/features/admin/google-reviews/copy";

/**
 * QA, 25 Oct 2026, production: the one google_business_connections row is
 * expired with last_error_code invalid_grant, connected 14 Oct 11:07 UTC and
 * ended 21 Oct 12:23 UTC, seven days and an hour later. That is how long
 * Google keeps a refresh token while the OAuth consent screen is in Testing.
 * With GOOGLE_REVIEWS_STALE_BANNER_ENABLED the admin screen says so.
 */

vi.mock("./views", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./views")>()),
  readConnectionState: async () => ({ state: "expired", endedAt: "2026-10-21T12:23:00.000Z", errorCode: "invalid_grant" }),
  readRecentRuns: async () => [
    {
      id: "run-1",
      startedAt: "2026-10-25T18:23:00.000Z",
      finishedAt: "2026-10-25T18:23:01.000Z",
      status: "failed",
      mode: "save",
      requestedBy: "cron",
      locationsAttempted: 0,
      locationsComplete: 0,
      reviewsFetched: 0,
      reviewsInserted: 0,
      reviewsUpdated: 0,
      reviewsMarkedRemoved: 0,
      errorCode: "not_connected",
    },
  ],
}));

const CONFIGURED = {
  GOOGLE_OAUTH_CLIENT_ID: "client-id",
  GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
  GOOGLE_TOKEN_ENCRYPTION_KEY: "key",
  GOOGLE_REVIEWS_SYNC_ENABLED: "true",
};

const saved = new Map<string, string | undefined>();

function setEnv(values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) {
    if (!saved.has(name)) saved.set(name, process.env[name]);
    process.env[name] = value;
  }
}

afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  saved.clear();
  delete process.env.GOOGLE_REVIEWS_STALE_BANNER_ENABLED;
});

describe("an expired Google connection on the admin Google Reviews screen", () => {
  it("flag off: the existing wording", async () => {
    setEnv(CONFIGURED);
    const { readGoogleReviewsStatus } = await import("./status");
    const status = await readGoogleReviewsStatus();
    expect(status.blocker).toEqual({ code: "authorization_expired" });
    expect(blockerText(status.blocker!).title).toBe("Google no longer accepts the saved connection");
  });

  it("flag on: names invalid_grant and the consent screen setting", async () => {
    setEnv({ ...CONFIGURED, GOOGLE_REVIEWS_STALE_BANNER_ENABLED: "true" });
    const { readGoogleReviewsStatus } = await import("./status");
    const status = await readGoogleReviewsStatus();
    expect(status.blocker).toEqual({ code: "authorization_expired", refusedWith: "invalid_grant" });
    const text = blockerText(status.blocker!);
    expect(text.title).toBe("Google refused the saved connection (invalid_grant)");
    expect(text.body).toContain("Reconnect the Google account below");
    expect(text.body).toContain("set its publishing status to In production");
  });

  it("another refusal keeps the general wording", () => {
    expect(blockerText({ code: "authorization_expired", refusedWith: "unauthorized" }).title).toBe(
      "Google no longer accepts the saved connection",
    );
  });
});
