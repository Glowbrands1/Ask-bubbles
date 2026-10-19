import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";
import { canAccessAdminConsole } from "@/lib/permissions";
import type { AccessScope, Role } from "@/types";

/**
 * ============================================================================
 * WHICH STORES' FORMS A PERSON MAY READ — DECIDED HERE, ONCE
 * ============================================================================
 *
 * THE DEFECT. Form Monitoring, the Overview queue and the rail's badge read
 * `form_instance_overview` with no store filter, so anybody holding
 * `view_form_monitoring` saw every store's HR forms. The API route narrowed by
 * the actor's stored scope, but that scope cannot be trusted for this: every
 * `app_users` row can carry `scope_level = 'global'` (all seven do), and a
 * manager with that value read the whole company.
 *
 * THE RULE, by role and role alone — the stored scope level is not consulted:
 *
 *   all stores   an administrator role, or an account with an unrevoked
 *                `forms_all_store_access` row of mode `all` (admin-managed, keyed
 *                to the account id; Colene and DJ). Independent of Woven
 *                verification.
 *   Woven stores a row of mode `woven_affiliations` (Amber): the home store plus
 *                the other stores Woven lists for the person, and no others.
 *   home store   everyone else, whatever their role: the stores on a `location`
 *                scope, else the primary store Woven maps to their account.
 *   nothing      no resolvable home store. Fails closed, never to "all".
 *
 * Every lookup failure resolves to LESS access. This is the VISIBILITY scope
 * only: creating a form is still authorized against the stored scope.
 */

const ALL_STORES: AccessScope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
const NO_STORES: AccessScope = { level: "location", primaryAreaId: null, alsoCoversAreaIds: [] };

const wovenStore = (locationId: string): AccessScope => ({
  level: "location",
  primaryAreaId: locationId,
  alsoCoversAreaIds: [],
});

export interface VisibilityIdentity {
  subject: string;
  role: Role;
  scope: AccessScope;
}

/**
 * What an unrevoked designation row grants. `all` reads every store;
 * `woven_affiliations` reads the stores Woven lists for this person (their home
 * store plus their additional mapped stores). No row, a revoked row or a failed
 * lookup is `null` — which grants nothing.
 */
type Designation = "all" | "woven_affiliations" | null;

async function designationOf(subject: string): Promise<Designation> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("forms_all_store_access")
      .select("visibility_mode")
      .eq("app_user_id", subject)
      .is("revoked_at", null)
      .maybeSingle();
    if (error || !data) return null;
    const mode = (data as { visibility_mode: unknown }).visibility_mode;
    return mode === "all" || mode === "woven_affiliations" ? mode : null;
  } catch {
    return null;
  }
}

/**
 * The stores Woven lists for this person: each ACTIVE, unexpired affiliation
 * that Woven's location map has resolved to a company store. An affiliation
 * Woven lists that is not a store (Corporate) is ignored by the map and so
 * contributes nothing. Reads Woven data already synced; writes nothing.
 */
async function wovenAffiliatedStores(subject: string): Promise<string[]> {
  try {
    const db = getSupabaseAdmin();
    const { data: people, error } = await db
      .from("employee_access_preview")
      .select("employee_id")
      .eq("app_user_id", subject)
      .limit(2);
    if (error || !people || people.length !== 1) return [];
    const employeeId = (people[0] as { employee_id: unknown }).employee_id;

    const { data: affiliations, error: affiliationError } = await db
      .from("employee_location_affiliations")
      .select("woven_location_id, expires_on")
      .eq("employee_id", employeeId)
      .eq("active", true);
    if (affiliationError || !affiliations) return [];
    const today = new Date().toISOString().slice(0, 10);
    const wovenIds = affiliations
      .filter((row) => {
        const expires = (row as { expires_on: string | null }).expires_on;
        return !expires || expires >= today;
      })
      .map((row) => (row as { woven_location_id: string }).woven_location_id);
    if (wovenIds.length === 0) return [];

    const { data: mapped, error: mapError } = await db
      .from("woven_location_map")
      .select("location_id")
      .eq("status", "mapped")
      .in("woven_location_id", wovenIds);
    if (mapError || !mapped) return [];
    return [
      ...new Set(
        mapped
          .map((row) => (row as { location_id: unknown }).location_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    ];
  } catch {
    return [];
  }
}

/** The primary store Woven maps to this account, for people whose stored scope is not a store. */
async function wovenHomeStore(subject: string): Promise<string | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("employee_access_preview")
      .select("mapped_primary_location_id")
      .eq("app_user_id", subject)
      .limit(2);
    if (error || !data || data.length !== 1) return null;
    const id = (data[0] as { mapped_primary_location_id: unknown }).mapped_primary_location_id;
    return typeof id === "string" && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

/** The scope this verified identity may READ forms under. */
export async function resolveFormsVisibility(identity: VisibilityIdentity): Promise<AccessScope> {
  if (canAccessAdminConsole(identity.role)) return ALL_STORES;
  const designation = await designationOf(identity.subject);
  if (designation === "all") return ALL_STORES;

  /*
   * A Woven-affiliation designation reads the home store AND the person's other
   * Woven stores, and nothing beyond them. The home store is always included,
   * and an empty answer falls through to the ordinary home-store rule below.
   */
  if (designation === "woven_affiliations") {
    const home = await wovenHomeStore(identity.subject);
    const stores = [...new Set([...(home ? [home] : []), ...(await wovenAffiliatedStores(identity.subject))])];
    if (stores.length > 0) {
      return { level: "location", primaryAreaId: stores[0]!, alsoCoversAreaIds: stores.slice(1) };
    }
  }

  /*
   * A `location` scope IS a store assignment, so it is honoured as assigned —
   * the primary store plus any store the account was explicitly given. Every
   * other level (global, district, region) names no store, so the store comes
   * from Woven's mapping instead.
   */
  const { scope } = identity;
  if (scope?.level === "location" && scope.primaryAreaId) return scope;

  const woven = await wovenHomeStore(identity.subject);
  return woven ? wovenStore(woven) : NO_STORES;
}
