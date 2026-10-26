import type { ConnectionState, StoreSummary } from "./views";

/**
 * WHETHER THE GOOGLE REVIEWS PAGE IS SHOWING CURRENT FIGURES.
 *
 * QA, 25 Oct 2026: the sync failed "not_connected" every six hours from
 * 21 Oct, and nothing outside the admin Google Reviews screen said so. The
 * page kept showing 21 Oct's reviews as if they were today's. Behind
 * GOOGLE_REVIEWS_STALE_BANNER_ENABLED, this is the notice /reviews shows
 * saying when reviews were last saved, sending an administrator to
 * reconnect. Drawing it on the page is a UI edit that waits on the owner's
 * flags-off-parity approval; until then `loadSyncNotice` has no caller.
 *
 * LAST SAVED is the newest store sync that completed, in full or in part
 * (`google_review_locations.last_sync_at` with status complete or
 * incomplete). A run that fails before reading any store, as a missing
 * connection does, never moves it, which is exactly why it is the right
 * clock.
 *
 * Client-safe: types only from `views`.
 */

/** Older than this, the figures are called out as not current. */
export const STALE_AFTER_MS = 2 * 24 * 60 * 60 * 1000;

export interface SyncNotice {
  readonly title: string;
  readonly body: string;
  /** The reconnect screen, for somebody who can act on it. */
  readonly href: string | null;
}

export const RECONNECT_PATH = "/admin/integrations/google-reviews";

const INSTANT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Chicago",
});

export function lastSavedAt(stores: readonly Pick<StoreSummary, "lastSyncAt" | "lastSyncStatus">[]): string | null {
  const saved = stores
    .filter((store) => store.lastSyncAt && (store.lastSyncStatus === "complete" || store.lastSyncStatus === "incomplete"))
    .map((store) => store.lastSyncAt!)
    .sort();
  return saved.at(-1) ?? null;
}

/**
 * The notice, or null when reviews are current: the connection is active and
 * something was saved within the last two days.
 */
export function syncNotice(input: {
  readonly stores: readonly Pick<StoreSummary, "lastSyncAt" | "lastSyncStatus">[];
  readonly connection: ConnectionState;
  readonly now: Date;
  readonly canManage: boolean;
}): SyncNotice | null {
  const saved = lastSavedAt(input.stores);
  const savedAt = saved ? new Date(saved) : null;
  const old = !savedAt || input.now.getTime() - savedAt.getTime() > STALE_AFTER_MS;
  const connected = input.connection.state === "active";
  if (connected && !old) return null;

  const since = savedAt ? `Google reviews have not synced since ${INSTANT.format(savedAt)} (Central time).` : "No Google review sync has completed yet.";
  const why = connected ? "" : " The Google account connection is no longer active.";
  const body = input.canManage
    ? `${since}${why} The figures below are as of then. Reconnect the Google account on the Google Reviews integration screen.`
    : `${since}${why} The figures below are as of then. An administrator needs to reconnect the Google account.`;
  return { title: "Google reviews are not up to date", body, href: input.canManage ? RECONNECT_PATH : null };
}
