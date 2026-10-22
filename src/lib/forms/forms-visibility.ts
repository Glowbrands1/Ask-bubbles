import "server-only";

import { businessToday } from "@/lib/business-date";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { canAccessAdminConsole } from "@/lib/permissions";
import { authorizedLocationIds } from "./location-scope";
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
 *                to the account id; one District Manager and one Regional Manager). Independent of Woven
 *                verification.
 *   their stores everyone else, whatever their role: the stores on a `location`
 *                scope, PLUS every store Woven assigns them — the primary, and
 *                each active additional or unexpired temporary location that
 *                Woven's location map has resolved to a store (`mapped`). A
 *                manager covering several stores reads all of them (21 Oct
 *                2026); one covering one reads one.
 *   nothing      no resolvable store. Fails closed, never to "all".
 *
 * A row of mode `woven_affiliations` (#58, Amber: her home store plus her other
 * Woven stores) is what everybody now gets, so it grants nothing further; it is
 * still read, and it is still not all-store access.
 *
 * Every lookup failure resolves to LESS access: an unmapped or `ignored` Woven
 * location (Corporate) names no store, and a failed lookup adds nothing. This is
 * the VISIBILITY scope only: creating a form is still authorized against the
 * stored scope.
 */

const ALL_STORES: AccessScope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
const NO_STORES: AccessScope = { level: "location", primaryAreaId: null, alsoCoversAreaIds: [] };

export interface VisibilityIdentity {
  subject: string;
  role: Role;
  scope: AccessScope;
}

/**
 * What an unrevoked designation row grants. `all` reads every store;
 * `woven_affiliations` reads the stores Woven lists for this person, which the
 * ordinary rule now reads for everyone. No row, a revoked row or a failed
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

interface WovenPerson {
  employeeId: string | null;
  /** The primary store Woven maps to this account, as a location id. */
  homeStore: string | null;
}

/** The Woven employee behind this account, and the primary store it maps to. */
async function wovenPerson(subject: string): Promise<WovenPerson | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("employee_access_preview")
      .select("employee_id, mapped_primary_location_id")
      .eq("app_user_id", subject)
      .limit(2);
    if (error || !data || data.length !== 1) return null;
    const row = data[0] as { employee_id: unknown; mapped_primary_location_id: unknown };
    return {
      employeeId: typeof row.employee_id === "string" && row.employee_id.length > 0 ? row.employee_id : null,
      homeStore:
        typeof row.mapped_primary_location_id === "string" && row.mapped_primary_location_id.length > 0
          ? row.mapped_primary_location_id
          : null,
    };
  } catch {
    return null;
  }
}

/**
 * The stores Woven lists for this employee: each ACTIVE affiliation, not past
 * its ExpiresOn (business day), that Woven's location map has resolved to a
 * company store. A location the map leaves `unmapped` or marks `ignored` (an
 * office, Corporate) contributes nothing, and any failure returns nothing, so
 * the reader keeps their home store. Reads Woven data already synced; writes
 * nothing.
 */
async function wovenAffiliatedStores(employeeId: string): Promise<string[]> {
  try {
    const db = getSupabaseAdmin();
    const { data: affiliations, error: affiliationError } = await db
      .from("employee_location_affiliations")
      .select("woven_location_id, expires_on")
      .eq("employee_id", employeeId)
      .eq("active", true);
    if (affiliationError || !affiliations) return [];
    const today = businessToday();
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

/** The scope this verified identity may READ forms under. */
export async function resolveFormsVisibility(identity: VisibilityIdentity): Promise<AccessScope> {
  if (canAccessAdminConsole(identity.role)) return ALL_STORES;
  if ((await designationOf(identity.subject)) === "all") return ALL_STORES;

  /*
   * A `location` scope IS a store assignment, so its stores are honoured as
   * assigned, and they lead. Every other level (global, district, region) names
   * no store. In both cases Woven's stores for the person are added: the
   * primary, then each further store they are assigned to.
   */
  const { scope } = identity;
  const assigned = scope?.level === "location" ? authorizedLocationIds(scope) : [];
  const woven = await wovenPerson(identity.subject);
  const affiliated = woven?.employeeId ? await wovenAffiliatedStores(woven.employeeId) : [];
  const stores = [...new Set([...assigned, ...(woven?.homeStore ? [woven.homeStore] : []), ...affiliated])];
  if (stores.length === 0) return NO_STORES;
  return { level: "location", primaryAreaId: stores[0]!, alsoCoversAreaIds: stores.slice(1) };
}
