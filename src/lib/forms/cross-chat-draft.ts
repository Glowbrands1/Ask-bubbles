/**
 * An open draft for the same employee, the same template, and the same
 * incident date.
 *
 * The card-id match and DRAFT_DEDUPE_ENABLED stay as they are. This picker
 * does not care which chat created the draft. A different date does not
 * match. A finalized form does not match.
 *
 * Which manager created it matters only with DRAFT_REUSE_OWN_DRAFTS_ONLY_ENABLED
 * (`ownDraftsOnly`): then only a row whose `createdBy` is the caller's
 * matches, and a row whose creator was not read does not. Off (the default),
 * any manager's draft matches, as before.
 */

export interface CrossChatDraftRow {
  readonly id: string;
  readonly templateKey: string;
  readonly employeeName: string;
  readonly formDate: string | null;
  readonly status: string;
  readonly createdAt: string;
  readonly createdBy?: string;
}

export interface CrossChatDraftWanted {
  readonly templateKey: string;
  readonly employeeName: string;
  readonly formDate: string | null;
  /** DRAFT_REUSE_OWN_DRAFTS_ONLY_ENABLED: only a draft `createdBy` made. */
  readonly ownDraftsOnly?: boolean;
  readonly createdBy?: string;
}

function sameEmployee(left: string, right: string): boolean {
  return left.trim().replace(/\s+/g, " ").toLowerCase() === right.trim().replace(/\s+/g, " ").toLowerCase();
}

/** The newest open draft for that employee, template, and incident date. */
export function pickCrossChatOpenDraft(
  rows: readonly CrossChatDraftRow[],
  wanted: CrossChatDraftWanted,
): string | null {
  if (!wanted.formDate || !/^\d{4}-\d{2}-\d{2}$/.test(wanted.formDate)) return null;
  const matches = rows.filter((row) => {
    if (wanted.ownDraftsOnly && (!wanted.createdBy || row.createdBy !== wanted.createdBy)) return false;
    if (row.status !== "draft") return false;
    if (row.templateKey !== wanted.templateKey) return false;
    if (row.formDate !== wanted.formDate) return false;
    return sameEmployee(row.employeeName, wanted.employeeName);
  });
  if (matches.length === 0) return null;
  const newest = [...matches].sort((left, right) => (left.createdAt < right.createdAt ? 1 : -1))[0]!;
  return newest.id;
}
