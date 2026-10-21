import "server-only";

import type { AuthenticatedIdentity } from "@/lib/auth/types";

import type { FormsActor } from "./access";
import { resolveFormsVisibility } from "./forms-visibility";
import { authorizedLocationIds } from "./location-scope";

/**
 * What a SERVER-RENDERED page may read from the forms record: the same visibility
 * the API routes apply through `authorizeForms`, resolved from the VERIFIED
 * identity, so a page and its API cannot disagree.
 *
 *   locationIds   store ids the read must be narrowed to; null = unrestricted
 *                 (administrators, designated accounts, and unverified preview,
 *                 whose scope the browser asserted about itself)
 *   noStore       a verified reader with no resolvable home store: nothing is
 *                 read at all and the page says why
 *   ownCreatedBy  a restricted reader's account id, so their own forms at
 *                 other stores are read too (then re-checked per row by
 *                 `visibleInstances`, which keeps only the stores their stored
 *                 scope still covers)
 */
export interface PageFormsAccess {
  actor: FormsActor;
  locationIds: string[] | null;
  noStore: boolean;
  ownCreatedBy: string | null;
}

export async function pageFormsAccess(
  identity: AuthenticatedIdentity | null,
): Promise<PageFormsAccess> {
  const visibility =
    identity?.verified === true ? await resolveFormsVisibility(identity) : null;
  const actor: FormsActor = {
    id: identity?.subject ?? "preview",
    role: identity?.role ?? null,
    verified: identity?.verified === true,
    scope: identity?.scope ?? null,
    visibility,
  };
  if (!visibility || visibility.level === "global") {
    return { actor, locationIds: null, noStore: false, ownCreatedBy: null };
  }
  const locationIds = authorizedLocationIds(visibility);
  return { actor, locationIds, noStore: locationIds.length === 0, ownCreatedBy: actor.id };
}
