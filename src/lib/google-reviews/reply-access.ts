import { approvedStoreByCode } from "@/config/company/google-reviews";
import { locationIdForCode } from "@/lib/locations";
import { DEFAULT_PERMISSION_MATRIX, hasPermission } from "@/lib/permissions";
import { admitsLocation, reportingScopeOf } from "@/lib/reporting/scope/authorized-locations";
import type { AccessScope, Role } from "@/types";

/**
 * WHO MAY ANSWER A GOOGLE REVIEW — one pure function, used by the page (to show or hide the
 * controls) AND by every route and service call (to refuse). The browser never decides.
 *
 *   1. The identity was VERIFIED by a real provider (a demo identity is never enough).
 *   2. The role holds `reply_to_reviews` in the SERVER's permission matrix.
 *   3. The review's salon is one of the seven approved Buff City Soap stores, AND the person's
 *      assignment covers it: global scope (admin, owner, developer) covers all seven; a
 *      location/district/region assignment covers exactly the roster locations it resolves to.
 *      A salon the roster cannot resolve is covered by nobody but global scope — it fails closed.
 *
 * Seeing a review is `view_reports`; answering it is this, additionally.
 */
export interface ReplyActor {
  /** Audit label, from the verified session: `user:<email>`. Never from a request body. */
  readonly label: string;
  readonly role: Role;
  readonly scope: AccessScope;
  readonly verified: boolean;
}

export function canReplyForStore(actor: ReplyActor | null | undefined, storeCode: string | null | undefined): boolean {
  if (!actor || !actor.verified || !storeCode) return false;
  if (!approvedStoreByCode(storeCode)) return false;
  if (!hasPermission(DEFAULT_PERMISSION_MATRIX, actor.role, "reply_to_reviews")) return false;
  return admitsLocation(reportingScopeOf(actor.scope), locationIdForCode(storeCode));
}

/** Whether the person may reply to ANY salon (decides if the controls render at all). */
export function mayReplyAnywhere(actor: ReplyActor | null | undefined): boolean {
  if (!actor || !actor.verified) return false;
  return hasPermission(DEFAULT_PERMISSION_MATRIX, actor.role, "reply_to_reviews");
}

export function replyActorLabel(identity: { email: string; subject: string }): string {
  return `user:${identity.email || identity.subject}`.slice(0, 120);
}
