import { canAccessAdminConsole } from "@/lib/permissions";
import type { AccessScope, Role } from "@/types";

/**
 * ============================================================================
 * WHICH STORES' FORMS A PERSON MAY READ — DECIDED HERE, ONCE
 * ============================================================================
 *
 * THE DEFECT. Form Monitoring, the Overview queue and the rail's badge read
 * `form_instance_overview` with no store filter, so anybody holding
 * `view_form_monitoring` saw every store's HR forms. The API route already
 * narrowed by the actor's scope, but the scope itself could not be trusted for
 * this purpose: every `app_users` row can carry `scope_level = 'global'`, and a
 * Store or District Manager with that value read the whole company.
 *
 * THE RULE. Reading forms is NOT governed by the stored scope level alone:
 *
 *   all stores     an administrator role (`canAccessAdminConsole`), or a user
 *                  id on `FORMS_ALL_STORES_USER_IDS` — never a name or email
 *   home store     a `location` scope: exactly the stores it names
 *   area scopes    district/region keep resolving through the roster, as before
 *   anyone else    NOTHING. A `global` scope on a non-listed account, or a
 *                  scope naming no store, reads no store's forms.
 *
 * This is the VISIBILITY scope only. Creating a form is still authorized
 * against the account's stored scope (`authorizeLocation`) and is unchanged.
 */

/**
 * Supabase Auth user ids (`auth.users.id` = `app_users.id`, Ask Bubbles
 * project) of the non-administrators approved to read forms across all stores:
 * Colene Schildt (district_manager) and DJ Wade (regional_manager). These are
 * the Ask Bubbles ids, which differ from their ids in the sister app.
 */
export const FORMS_ALL_STORES_USER_IDS: readonly string[] = [
  // INTENTIONALLY EMPTY. All-store access for non-administrators is to come from Woven
  // location assignments, not from user ids. Pending design approval.
];

/** The scope that reads no store at all: a location scope naming no location. */
const NO_STORES: AccessScope = { level: "location", primaryAreaId: null, alsoCoversAreaIds: [] };

const ALL_STORES: AccessScope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };

export interface VisibilityIdentity {
  subject: string;
  role: Role;
  scope: AccessScope;
}

/** The scope this verified identity may READ forms under. Fails closed. */
export function formsVisibilityScope(identity: VisibilityIdentity): AccessScope {
  if (canAccessAdminConsole(identity.role)) return ALL_STORES;
  if (FORMS_ALL_STORES_USER_IDS.includes(identity.subject)) return ALL_STORES;
  if (identity.scope.level === "global") return NO_STORES;
  return identity.scope;
}
