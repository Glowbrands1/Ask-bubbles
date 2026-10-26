import "server-only";

import { supabaseReadiness } from "@/lib/config/server-env";
import { readGoalData } from "@/lib/google-reviews/views";
import { locationIdForCode } from "@/lib/locations";
import { hasPermission, DEFAULT_PERMISSION_MATRIX } from "@/lib/permissions";
import { admitsLocation, reportingScopeOf } from "@/lib/reporting/scope/authorized-locations";
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

/**
 * The Google review block for one chat turn, or null when the question is not
 * about Google reviews.
 *
 * View reports (the Google Reviews page's permission) is checked first:
 * without it nothing is read. The stores are the caller's (the same scope the
 * report reads use), narrowed to any store the question names. The figures
 * come from `readGoalData`, the read /reviews renders.
 */
export async function loadGoogleReviewsChatBlock(input: {
  readonly question: string;
  readonly role: Role | null;
  readonly scope: AccessScope | null;
}): Promise<GoogleReviewsChatBlock | null> {
  if (!isGoogleReviewQuestion(input.question)) return null;

  if (input.role === null || !hasPermission(DEFAULT_PERMISSION_MATRIX, input.role, "view_reports")) {
    return { text: reviewsNotPermittedBlock(), figures: false };
  }

  const scope = reportingScopeOf(input.scope);
  const mayRead = (code: string) => admitsLocation(scope, locationIdForCode(code));
  const named = storeCodesNamedIn(input.question);
  const outOfScope = named.filter((code) => !mayRead(code));
  const wanted = named.length > 0 ? named.filter(mayRead) : null;

  if (wanted !== null && wanted.length === 0) {
    return { text: formatGoogleReviewsBlock({ context: null, rows: [], outOfScopeStoreCodes: outOfScope }), figures: false };
  }

  if (!supabaseReadiness().ready) {
    return { text: reviewsUnavailableBlock("This deployment cannot read the Google review records."), figures: false };
  }

  try {
    const goals = await readGoalData();
    const rows = goals.rows.filter(
      (row) => mayRead(row.storeCode) && (wanted === null || wanted.includes(row.storeCode)),
    );
    return {
      text: formatGoogleReviewsBlock({ context: goals.context, rows, outOfScopeStoreCodes: outOfScope }),
      figures: rows.length > 0,
    };
  } catch {
    return { text: reviewsUnavailableBlock("The Google review figures could not be read just now."), figures: false };
  }
}
