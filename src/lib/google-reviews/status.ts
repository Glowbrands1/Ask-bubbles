import "server-only";

import { readGoogleReviewsConfig, resolveRedirectUri } from "./config";
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
  return {
    enabled: config.enabled,
    writesEnabled: config.writesEnabled,
    scheduleEnabled: config.scheduleEnabled,
    credentialsReady: config.credentialsReady,
    missingCredentials: config.missingCredentials,
    redirectUri: resolveRedirectUri(process.env, requestOrigin),
    connection,
    runs,
    blocker: deriveBlocker({ enabled: config.enabled, credentialsReady: config.credentialsReady, missingCredentials: config.missingCredentials, connection, lastRun }),
  };
}
