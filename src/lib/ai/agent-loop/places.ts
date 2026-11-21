import { authorizedLocationIds } from "@/lib/forms/location-scope";
import { readLocationMentions, rosterLocationName } from "@/lib/forms/location-mention";
import { labelledStoreIds } from "@/lib/forms/store-cue";
import { locationById } from "@/lib/locations";
import type { AccessScope } from "@/types";

/*
 * ============================================================================
 * THIS APP'S PLACES, IN THE SHAPE THE AGENT LOOP READS THEM (the loop port, QA 21 Nov 2026)
 * ============================================================================
 *
 * The loop's code is shared with the sibling app; its place reads go through this one module, so the code stays the
 * same and only this file is this app's. Here a place is a store (`lib/locations`), read with this app's store
 * resolver (`location-mention.ts`, `store-cue.ts`).
 *
 * Scope (Pau's decision 7, 21 Nov 2026): a district or region login covers all of its stores, as this app's forms do
 * (`authorizedLocationIds` expands them), so the loop reads and files for every store in it.
 */

/** A place a manager's words name: every place id it could be. */
export interface PlaceMention {
  readonly salonIds: readonly string[];
}

/** The places a manager's words name. */
export function readSalonMentions(text: string): PlaceMention[] {
  return readLocationMentions(text).map((mention) => ({ salonIds: mention.locationIds }));
}

/** A place's display name, by id. */
export function rosterSalonName(id: string): string | null {
  return rosterLocationName(id);
}

/** A place by id, with its display name. */
export function salonById(id: string): { readonly id: string; readonly name: string } | undefined {
  const location = locationById(id);
  return location ? { id: location.id, name: location.name } : undefined;
}

/** The places this login may file forms for: every place in its scope (a district or region: all of its stores). */
export function authorizedSalonIds(scope: AccessScope): string[] {
  return authorizedLocationIds(scope);
}

/** The level of a login that covers named places (a store manager), as this app's scope names it. */
export const PLACE_LEVEL = "location";

/** The place ids a turn labels as the form's place ("at the Midtown store"). */
export function labelledSalonIds(turn: string): string[] {
  return labelledStoreIds(turn);
}

/** One place named in the manager's own words, or null when it is not exactly one. */
export function salonIdNamedIn(text: string): string | null {
  const ids = [...new Set(readSalonMentions(text).flatMap((mention) => mention.salonIds))];
  return ids.length === 1 ? ids[0]! : null;
}
