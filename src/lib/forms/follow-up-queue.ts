import "server-only";

import { businessToday } from "@/lib/business-date";

import type { FormsActor } from "./access";
import { attentionSummary, followUpState, type AttentionSummary } from "./follow-up";
import { visibleInstances } from "./instance-scope";
import { listAllOutstandingFollowUps, type InstanceRow } from "./instances";
import { configuredExcludedNames, isProductionRecord } from "./production-records";

/**
 * ============================================================================
 * THE FOLLOW-UP QUEUE: ONE SET OF FORMS, ONE OVERDUE COUNT, FOR EVERY SCREEN
 * ============================================================================
 *
 * Port from the sibling app (QA, 24 Nov 2026: "The Overview, the sidebar and the Form Monitoring banner say 19 overdue.
 * Form Monitoring's Overdue filter says 8 and Open says 6."). Every screen used the same rule (`followUpState`) over a
 * different set of forms: the rail, Home and the Forms Register banner over the first 50 outstanding follow-ups (with
 * Home alone leaving out test records), the pills over the 200 most recently created forms.
 *
 * Now there is one set: every outstanding follow-up this reader may open (`visibleInstances`: their stores, their own
 * forms elsewhere, restricted families, HR-pending and private forms), minus the non-production records Home already
 * held back (`production-records.ts`), read WITHOUT A CAP (`listAllOutstandingFollowUps`). The rail badge, Home, the
 * Forms Register's banner and its Open and Overdue pills, and the AI (read_follow_ups), all count it.
 */
export interface FollowUpQueue {
  /** Every outstanding follow-up this reader may open, soonest first: open and overdue, test records left out. */
  readonly forms: readonly InstanceRow[];
  /** Overdue, due this week and the two together, over `forms`. */
  readonly attention: AttentionSummary;
  /** Every open follow-up (date today or later), not only this week's: the Open pill. */
  readonly open: number;
  /** Outstanding follow-ups on test / non-production records, not counted (they stay in the register's list). */
  readonly excluded: number;
}

export const EMPTY_FOLLOW_UP_QUEUE: FollowUpQueue = {
  forms: [],
  attention: { overdue: 0, dueThisWeek: 0, needsAttention: 0 },
  open: 0,
  excluded: 0,
};

/** The pure half: which of the outstanding rows count, and their counts. */
export function followUpQueueOf(
  outstanding: readonly InstanceRow[],
  options: { readonly actor: FormsActor; readonly today?: string; readonly excludedNames?: Set<string> },
): FollowUpQueue {
  const today = options.today ?? businessToday();
  const readable = visibleInstances(options.actor, [...outstanding]);
  const excludedNames = options.excludedNames ?? configuredExcludedNames();
  const forms = readable.filter((instance) =>
    isProductionRecord(
      { employeeName: instance.employeeName, locationName: instance.locationName, locationId: instance.locationId },
      { excludedNames },
    ),
  );
  return {
    forms,
    attention: attentionSummary(forms, today),
    open: forms.filter((form) => followUpState(form, today) === "open").length,
    excluded: readable.length - forms.length,
  };
}

/** The read every screen calls, with the reader's forms access as the page resolves it (`pageFormsAccess`). */
export async function readFollowUpQueue(
  access: {
    readonly actor: FormsActor;
    readonly locationIds: readonly string[] | null;
    readonly ownCreatedBy: string | null;
    readonly noStore: boolean;
  },
  options: { readonly today?: string } = {},
  read: typeof listAllOutstandingFollowUps = listAllOutstandingFollowUps,
): Promise<FollowUpQueue> {
  if (access.noStore) return EMPTY_FOLLOW_UP_QUEUE;
  const outstanding = await read(access.locationIds, access.ownCreatedBy);
  return followUpQueueOf(outstanding, { actor: access.actor, today: options.today });
}
