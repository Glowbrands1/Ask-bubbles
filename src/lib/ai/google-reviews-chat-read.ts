import "server-only";

import { supabaseReadiness } from "@/lib/config/server-env";
import { readGoalData, readStoreSummaries, type StoreSummary } from "@/lib/google-reviews/views";
import { codeOfLocationId } from "@/lib/locations";
import { hasPermission, DEFAULT_PERMISSION_MATRIX } from "@/lib/permissions";
import { reportingScopeOf } from "@/lib/reporting/scope/authorized-locations";
import type { AccessScope, Role } from "@/types";

import {
  formatGoogleReviewsBlock,
  isGoogleReviewQuestion,
  reviewsNotPermittedBlock,
  reviewsUnavailableBlock,
  storeCodesNamedIn,
} from "./google-reviews-chat";

export interface GoogleReviewsChatBlock {
  readonly text: string;
  /** True when the block carries review figures, not only a decline. */
  readonly figures: boolean;
}

/** When reviews were last saved: the newest store sync that completed, in full or in part. */
function lastSavedAt(stores: readonly StoreSummary[] | null): string | null {
  const saved = (stores ?? [])
    .filter((store) => store.lastSyncAt && (store.lastSyncStatus === "complete" || store.lastSyncStatus === "incomplete"))
    .map((store) => store.lastSyncAt!)
    .sort();
  return saved.at(-1) ?? null;
}

/**
 * The Google review block for one chat turn, or null when the question is not
 * about Google reviews.
 *
 * View reports (the Google Reviews page's permission) is checked first:
 * without it nothing is read. The rows are the ones /reviews shows this
 * caller (every store; the page does not narrow by assignment), narrowed to
 * any store the question names, with the caller's own stores marked. The
 * figures come from `readGoalData`, the read the page renders, and the last
 * sync from the stores' own sync times.
 */
export async function loadGoogleReviewsChatBlock(input: {
  readonly question: string;
  readonly role: Role | null;
  readonly scope: AccessScope | null;
  readonly now?: Date;
}): Promise<GoogleReviewsChatBlock | null> {
  if (!isGoogleReviewQuestion(input.question)) return null;

  if (input.role === null || !hasPermission(DEFAULT_PERMISSION_MATRIX, input.role, "view_reports")) {
    return { text: reviewsNotPermittedBlock(), figures: false };
  }

  if (!supabaseReadiness().ready) {
    return { text: reviewsUnavailableBlock("This deployment cannot read the Google review records."), figures: false };
  }

  const scope = reportingScopeOf(input.scope);
  const own = new Set(scope.unrestricted ? [] : scope.locationIds.map((id) => codeOfLocationId(id)).filter((code): code is string => code !== null));
  const named = storeCodesNamedIn(input.question);

  try {
    const [goals, stores] = await Promise.all([readGoalData(), readStoreSummaries().catch(() => null)]);
    const rows = goals.rows.filter((row) => named.length === 0 || named.includes(row.storeCode));
    return {
      text: formatGoogleReviewsBlock({
        context: goals.context,
        rows,
        ownStoreCodes: own,
        lastSyncAt: lastSavedAt(stores),
        now: input.now ?? new Date(),
      }),
      figures: rows.length > 0,
    };
  } catch {
    return { text: reviewsUnavailableBlock("The Google review figures could not be read just now."), figures: false };
  }
}
