import type { AccessScope, Role } from "@/types";

import { globalStoreAskEnabled } from "@/lib/config/chat-quality-flags";

/**
 * One non-blocking question for a global-scope account that does not cover
 * every store the way an admin does. The card stays ready either way.
 * Admin, owner, and developer keep the existing copy.
 */

export const GLOBAL_STORE_ASK_TAG = "Which store is this for?";

const COVERS_EVERY_STORE: ReadonlySet<Role> = new Set(["admin", "owner", "developer"]);

export function globalStoreAlreadyAsked(assistantMessages: readonly string[]): boolean {
  return assistantMessages.some((content) => content.includes(GLOBAL_STORE_ASK_TAG));
}

export function globalStoreAskLine(input: {
  readonly role: Role | null;
  readonly scope: AccessScope | null;
  readonly storeResolved: boolean;
  readonly employeeName: string | null;
  readonly assistantMessages: readonly string[];
}): string | null {
  if (!globalStoreAskEnabled()) return null;
  if (!input.role || COVERS_EVERY_STORE.has(input.role)) return null;
  if (input.scope?.level !== "global") return null;
  if (input.storeResolved) return null;
  if (!input.employeeName) return null;
  if (globalStoreAlreadyAsked(input.assistantMessages)) return null;
  return `I have **${input.employeeName}**. ${GLOBAL_STORE_ASK_TAG} Name it here or on the form — the card stays ready, and nothing is saved until you create the draft.`;
}
