import { typedNameEnabled } from "@/lib/config/chat-quality-flags";
import type { EmployeeVerification } from "@/types";

import { displayName, type RosterEmployee } from "./employee-match";

/**
 * ============================================================================
 * WHAT WOVEN SAYS ABOUT THE EMPLOYEE A FORM NAMES
 * ============================================================================
 *
 * The employee's job title on a form is a fact about a person on an HR record.
 * It comes from Woven's own position for them or from nowhere: never from how a
 * manager phrased the request ("Sarah, our shift lead…"), and never from a
 * model.
 *
 * READ-ONLY. This reads a roster row that was already scoped to the actor and
 * pinned to the one Woven company Ask Bubbles reads; it writes nothing, to
 * Woven or to the directory.
 *
 * VERIFIED needs all of: a single employee row, a Woven position on it, a
 * record the sync evaluated recently, and an employment status that is not
 * `terminated`. Anything less is `unverified` WITH THE REASON, and the title
 * the manager gave (if any) is left as theirs, flagged, not replaced.
 *
 * STORE. Where the manager named a store and Woven has the employee at stores
 * that do not include it, the mismatch is surfaced — never silently resolved
 * either way. Woven's stores are only counted where a person mapped them to a
 * registered store.
 *
 * Pure: the caller loads the roster.
 */

/** The daily sync can miss a day; three days old is no longer "current". */
export const STALE_AFTER_MS = 72 * 60 * 60 * 1000;

export interface VerificationOutcome {
  readonly verification: EmployeeVerification;
  /** A sentence for the reply, or null when there is nothing to add. */
  readonly note: string | null;
}

const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function verifyEmployee(input: {
  employee: RosterEmployee;
  /** Registered store ids the manager named, firm readings only. */
  namedStoreIds?: readonly string[];
  /** Registered store names for `storeIds`, for the sentence. */
  storeLabel?: (id: string) => string;
  /** The title the manager stated, if any. */
  managerTitle?: string | null;
  now?: number;
}): VerificationOutcome {
  const { employee } = input;
  const name = displayName(employee);
  const storeIds = [...employee.locationIds];
  const base = { storeIds } as const;

  const unverified = (reason: NonNullable<EmployeeVerification["reason"]>, note: string): VerificationOutcome => ({
    verification: { status: "unverified", title: null, reason, ...base },
    note,
  });

  if (employee.employmentStatus === "terminated") {
    return unverified(
      "not_active",
      `Woven lists **${name}** as no longer employed, so I haven't verified a job title for them.`,
    );
  }

  const synced = employee.lastSyncedAt ? Date.parse(employee.lastSyncedAt) : Number.NaN;
  if (!Number.isFinite(synced) || (input.now ?? Date.now()) - synced > STALE_AFTER_MS) {
    return unverified(
      "stale",
      `Woven's record for **${name}** hasn't been refreshed recently, so I couldn't verify their job title or store.${input.managerTitle ? ` The title on the form is the one you gave (${input.managerTitle}), not one from Woven.` : ""}`,
    );
  }

  const title = employee.positionName?.trim() || null;
  if (!title) {
    return unverified(
      "no_title",
      `Woven has no job title on record for **${name}**, so I couldn't verify one.${input.managerTitle ? ` The title on the form is the one you gave (${input.managerTitle}), not one from Woven.` : ""}`,
    );
  }

  const named = input.namedStoreIds ?? [];
  const label = input.storeLabel ?? ((id: string) => id);
  const mismatch = named.length > 0 && storeIds.length > 0 && !named.some((id) => storeIds.includes(id));

  const notes: string[] = [];
  if (input.managerTitle && squash(input.managerTitle) !== squash(title) && !typedNameEnabled()) {
    notes.push(
      `You described **${name}** as a ${input.managerTitle}, but Woven lists their job title as **${title}**, so the form uses **${title}**.`,
    );
  }
  if (mismatch) {
    notes.push(
      `Woven has **${name}** at ${storeIds.map((id) => `**${label(id)}**`).join(" and ")}, not ${named.map((id) => `**${label(id)}**`).join(" or ")}. The form uses the store you named — check that it's the right one before you file it.`,
    );
  }

  return {
    verification: { status: "verified", title, ...(mismatch ? { storeMismatch: true } : {}), ...base },
    note: notes.length > 0 ? notes.join("\n\n") : null,
  };
}

/** The reply when no roster row could be read or matched, so nothing was verified. */
export function unverifiedWithoutRecord(
  reason: "not_found" | "unavailable" | "not_checked" | "ambiguous",
  typedName: string,
): VerificationOutcome {
  const sentence: Record<typeof reason, string> = {
    unavailable: `I couldn't reach the Woven employee records just now, so I haven't verified **${typedName}**'s job title or store. Nothing has been filled in from Woven.`,
    not_found: `I couldn't verify **${typedName}** in Woven — no employee by that name at your stores — so the job title isn't filled in from Woven.`,
    not_checked: `Woven employee verification isn't available for your account, so **${typedName}**'s job title and store haven't been verified.`,
    ambiguous: `More than one Woven employee fits **${typedName}**, so I haven't verified a job title yet.`,
  };
  return { verification: { status: "unverified", title: null, reason }, note: sentence[reason] };
}
