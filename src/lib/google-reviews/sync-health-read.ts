import "server-only";

import { staleBannerEnabled } from "./config";
import { syncNotice, type SyncNotice } from "./sync-health";
import { readConnectionState, readStoreSummaries } from "./views";

/**
 * The /reviews sync notice, or null. Null while GOOGLE_REVIEWS_STALE_BANNER_ENABLED
 * is off, when reviews are current, and when the state cannot be read (the
 * page already says when its own reads fail).
 */
export async function loadSyncNotice(canManage: boolean, now: Date = new Date()): Promise<SyncNotice | null> {
  if (!staleBannerEnabled()) return null;
  try {
    const [stores, connection] = await Promise.all([readStoreSummaries(), readConnectionState()]);
    return syncNotice({ stores, connection, now, canManage });
  } catch {
    return null;
  }
}
