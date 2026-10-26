import "server-only";

import { readGoogleReviewsConfig, resolveRedirectUri, staleBannerEnabled } from "./config";
import { deriveBlocker, readConnectionState, readRecentRuns, type Blocker, type ConnectionState, type RunRow } from "./views";

/**
 * THE INTEGRATION'S STATUS — measured, never declared.
 *
 * Configuration comes from the environment by NAME; the connection and the runs
 * come from the database; the blocker is derived from those facts. Nothing here
 * contains a secret value, a token, a review or a reviewer.
 */

export interface GoogleReviewsStatus {
  enabled: boolean;
  writesEnabled: boolean;
  scheduleEnabled: boolean;
  credentialsReady: boolean;
  missingCredentials: string[];
  /** The redirect URI the Google Cloud OAuth client must list. Not secret. Null when it cannot be determined. */
  redirectUri: string | null;
  connection: ConnectionState;
  runs: RunRow[];
  blocker: Blocker;
}

export async function readGoogleReviewsStatus(requestOrigin?: string): Promise<GoogleReviewsStatus> {
  const config = readGoogleReviewsConfig();
  const [connection, runs] = await Promise.all([readConnectionState(), readRecentRuns(10)]);
  const lastRun = runs.find((r) => r.status !== "running") ?? null;
  const derived = deriveBlocker({ enabled: config.enabled, credentialsReady: config.credentialsReady, missingCredentials: config.missingCredentials, connection, lastRun });
  /*
   * GOOGLE_REVIEWS_STALE_BANNER_ENABLED: an ended connection says what Google
   * refused it with, so the screen can name the cause (QA, 25 Oct 2026: an
   * invalid_grant exactly seven days after connecting). Off, as before.
   */
  const blocker: Blocker =
    staleBannerEnabled() && derived?.code === "authorization_expired" && connection.state !== "none" && connection.state !== "active"
      ? { code: "authorization_expired", refusedWith: connection.errorCode }
      : derived;
  return {
    enabled: config.enabled,
    writesEnabled: config.writesEnabled,
    scheduleEnabled: config.scheduleEnabled,
    credentialsReady: config.credentialsReady,
    missingCredentials: config.missingCredentials,
    redirectUri: resolveRedirectUri(process.env, requestOrigin),
    connection,
    runs,
    blocker,
  };
}
