import { allowedManagedFlags, pendingLinkReviews } from "@/lib/employees/woven/access/link-review";
import type { PlannedRow } from "@/lib/employees/woven/access/types";
import type { Role } from "@/types";

/**
 * ============================================================================
 * LINK AN EXISTING ACCOUNT BY ITS ONE EXACT EMAIL MATCH
 * ============================================================================
 *
 * Pau, 28 Nov 2026: "need lifecycle in bubble too". The sibling app's account
 * lifecycle creates accounts, links an existing account by its one exact email
 * match, and turns off the sign-in of someone Woven marks Terminated. In this
 * app:
 *   - accounts are created (and invited) by the hourly new-hire run
 *     (`new-hire-invites.ts`);
 *   - the Terminated disable is the Woven access sync's apply step
 *     (`src/lib/employees/woven/access/apply.ts`, WOVEN_ACCESS_MODE=apply with
 *     WOVEN_ACCESS_APPLY_ACTIONS=DISABLE_TERMINATED);
 *   - this module adds the link. It lives here, outside the Woven sync, which
 *     still never writes `app_users` (phase-one guarantees).
 *
 *   WOVEN_LINK_EXISTING_ENABLED  "true" to link. Anything else, or unset: off,
 *                                the default. Its own switch, so it never
 *                                changes what WOVEN_ACCESS_APPLY_ACTIONS means
 *                                to the apply step (which refuses any action
 *                                it does not apply).
 *   WOVEN_POSITION_SYNC_ACTOR    the active global admin the links are set by
 *                                (the same admin as the position sync).
 *
 * The link: an exact-email match the planner proposes for review (one Woven
 * employee, one unclassified account), where the employee is Active, the
 * account is not protected or disabled, and nothing else on the row is in
 * doubt. Stored as `email_discovery`; it manages status only for a General
 * Manager / Assistant General Manager account in a GM/AGM position at one
 * store, and never role or store. Linking changes nobody's access.
 *
 * Only while the access guards allow changes. Pure; `woven-lifecycle.server.ts`
 * runs it.
 */

export const WOVEN_LINK_EXISTING_ENABLED_ENV = "WOVEN_LINK_EXISTING_ENABLED";
/** At most this many links in one run; more waits for the next. */
export const MAX_LINKS_PER_RUN = 25;

export interface LifecycleConfig {
  linkExisting: boolean;
}

export function readLifecycleConfig(env: Record<string, string | undefined> = process.env): LifecycleConfig {
  return { linkExisting: (env[WOVEN_LINK_EXISTING_ENABLED_ENV] ?? "").trim().toLowerCase() === "true" };
}

/** The roles whose account Woven may manage the status of after an automatic link. */
const MANAGER_ROLES: readonly Role[] = ["location_manager", "assistant_manager"];

/** Anything on the row that means a person should look before it is linked. */
const IN_DOUBT = ["FLAG_DUPLICATE_EMAIL", "FLAG_STATUS_CONFLICT", "FLAG_UNKNOWN_STATUS", "FLAG_MISSING_FROM_WOVEN", "FLAG_PROTECTED_ACCOUNT"];

export interface LinkToInsert {
  app_user_id: string;
  management: "woven_linked";
  external_employee_id: string;
  link_method: "email_discovery";
  managed_status: boolean;
  managed_location: false;
  managed_role: false;
  reason: string;
  set_by: string;
}

export interface LifecyclePlan {
  links: LinkToInsert[];
}

export function decideLifecycle(rows: readonly PlannedRow[], config: LifecycleConfig, setBy: string): LifecyclePlan {
  const links: LinkToInsert[] = [];
  if (config.linkExisting) {
    for (const row of pendingLinkReviews(rows)) {
      const account = row.account!;
      if (row.wovenStatus !== "active" || account.isProtected || account.status === "disabled") continue;
      if (row.actions.some((a) => IN_DOUBT.includes(a))) continue;
      const allowed = allowedManagedFlags(account, account.isProtected);
      const manager =
        MANAGER_ROLES.includes(account.role) && account.scopeLevel === "location" && row.proposedRole !== null && MANAGER_ROLES.includes(row.proposedRole);
      links.push({
        app_user_id: account.appUserId,
        management: "woven_linked",
        external_employee_id: row.externalEmployeeId!,
        link_method: "email_discovery",
        managed_status: allowed.status && manager,
        managed_location: false,
        managed_role: false,
        reason: "Exact email match linked by the Woven account lifecycle",
        set_by: setBy,
      });
      if (links.length >= MAX_LINKS_PER_RUN) break;
    }
  }
  return { links };
}
