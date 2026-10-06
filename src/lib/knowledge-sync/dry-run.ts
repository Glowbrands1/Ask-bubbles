import { manifestKey, type ReconcileOutput } from "./reconcile";
import type { ContentType, DryRunPlan, ListingResult, ManifestItem, PlanEntry } from "./types";

/**
 * ============================================================================
 * THE DRY-RUN PLAN — "what WOULD this sync do?", item by item
 * ============================================================================
 *
 * PURE, and built from the very `reconcile` output a real sync saves and
 * applies, so the plan cannot disagree with what a sync would do. It reads
 * nothing and writes nothing; the engine attaches it to a preview's report.
 *
 * WHAT IS IN IT: identities, titles, status labels and reason codes. Never a
 * body of text, a locator, a URL, a fingerprint or a person's data.
 *
 * Lists are capped at `PLAN_LIST_LIMIT` entries each (`truncated` says so);
 * the counts beside them are always complete.
 */

export const PLAN_LIST_LIMIT = 500;

/** Parts whose content is the page's own text; every other part is a file download. */
const TEXT_PART_KEYS = new Set(["content"]);

function entry(item: ManifestItem): PlanEntry {
  return {
    contentType: item.contentType,
    entityId: item.entityId,
    partKey: item.partKey,
    title: item.title,
    status: item.status,
    reason: item.reason,
  };
}

export function buildDryRunPlan(listings: readonly ListingResult[], scan: ReconcileOutput): DryRunPlan {
  let truncated = false;
  const capped = (items: ManifestItem[]): PlanEntry[] => {
    if (items.length > PLAN_LIST_LIMIT) truncated = true;
    return items.slice(0, PLAN_LIST_LIMIT).map(entry);
  };

  const sourceCounts: DryRunPlan["sourceCounts"] = {};
  const publishedRecords: DryRunPlan["publishedRecords"] = {};
  const errors: DryRunPlan["errors"] = [];
  for (const listing of listings) {
    if (!listing.ok) {
      errors.push({ contentType: listing.contentType, code: listing.code, message: listing.message });
      continue;
    }
    sourceCounts[listing.contentType] = {
      records: listing.records.length,
      parts: listing.records.reduce((sum, r) => sum + r.parts.length, 0),
    };
    publishedRecords[listing.contentType] = listing.records.filter((r) => r.publication === "published").length;
  }

  /* Only what this run listed: carried-over rows of a failed type are not a plan. */
  const listed = new Set<ContentType>(listings.filter((l) => l.ok).map((l) => l.contentType));
  const items = scan.items.filter((i) => listed.has(i.contentType));
  const blockedEligible = new Set(scan.blockedEligible);
  const held = new Set(scan.held);

  const excludedByReason: Record<string, number> = {};
  for (const item of items) {
    if (item.pendingAction === "ingest") continue;
    if (item.state === "UNCHANGED" && item.inKnowledgeBase) continue;
    const reason = item.reason ?? item.state.toLowerCase();
    excludedByReason[reason] = (excludedByReason[reason] ?? 0) + 1;
  }

  const ingest = items.filter((i) => i.pendingAction === "ingest" && i.reason !== "recheck_bytes");
  return {
    sourceCounts,
    publishedRecords,
    excludedByReason,
    new: capped(items.filter((i) => i.state === "NEW")),
    changed: capped(items.filter((i) => i.state === "UPDATED")),
    unchanged: items.filter((i) => i.state === "UNCHANGED").length,
    removals: capped(items.filter((i) => i.state === "REMOVED" && (i.pendingAction === "retire" || i.reason === "removal_held" || i.reason === "removal_held_incomplete"))),
    permissionChanges: capped(items.filter((i) => i.state === "PERMISSION_CHANGED")),
    wouldIngest: capped(ingest),
    wouldDownload: capped(ingest.filter((i) => !TEXT_PART_KEYS.has(i.partKey))),
    wouldDownloadOnceEnabled: capped(items.filter((i) => blockedEligible.has(manifestKey(i)))),
    flaggedOwnership: capped(items.filter((i) => held.has(manifestKey(i)))),
    errors,
    truncated,
  };
}
