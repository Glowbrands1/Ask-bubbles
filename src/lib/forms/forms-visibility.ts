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
 *   all stores   an administrator role, or an account with an unrevoked row in
 *                `forms_all_store_access` (admin-managed, keyed to the account
 *                id; Colene and DJ). Independent of Woven verification.
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

/** Whether an admin-managed designation grants this account all stores. Fails closed. */
async function isDesignatedAllStores(subject: string): Promise<boolean> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("forms_all_store_access")
      .select("app_user_id")
      .eq("app_user_id", subject)
      .is("revoked_at", null)
      .maybeSingle();
    return !error && data !== null;
  } catch {
    return false;
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
  if (await isDesignatedAllStores(identity.subject)) return ALL_STORES;

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
