import { allowedManagedFlags, pendingLinkReviews } from "@/lib/employees/woven/access/link-review";
import type { PlannedRow } from "@/lib/employees/woven/access/types";
import type { Role } from "@/types";

/**
 * ============================================================================
 * THE ACCOUNT LIFECYCLE — what Ask Sunny's Woven access sync applies, here too
 * ============================================================================
 *
 * Pau, 28 Nov 2026: "need lifecycle in bubble too". Ask Sunny applies three
 * outcomes of the access plan after each Woven sync: create the account of an
 * eligible manager, link an existing account by its one exact email match, and
 * turn off the sign-in of someone Woven marks Terminated. In this app accounts
 * are already created (and invited) by the hourly new-hire run
 * (`new-hire-invites.ts`); this adds the other two. It lives here, outside the
 * Woven sync, which still never writes `app_users` (phase-one guarantees).
 *
 *   WOVEN_ACCESS_APPLY_ACTIONS  the outcomes to apply, any of
 *                               LINK_EXISTING, DISABLE_TERMINATED
 *                               (Ask Sunny's switch name). Empty or unset: none,
 *                               the default. Anything else named: ignored, and
 *                               the run says so.
 *   WOVEN_POSITION_SYNC_ACTOR   the active global admin the changes are made by
 *                               (the same admin as the position sync).
 *
 *   DISABLE_TERMINATED  the planner proposes it only for a Woven-linked,
 *                       status-managed, unprotected account whose employee
 *                       Woven's own Terminated read returned in the latest run.
 *                       Applied with `patchUser` → disabled: the profile, the
 *                       Supabase Auth ban and every session (`revokeAuthAccess`),
 *                       audited. An account already disabled is done.
 *   LINK_EXISTING       an exact-email match the planner proposes for review
 *                       (one Woven employee, one unclassified account), where
 *                       the employee is Active, the account is not protected or
 *                       disabled, and nothing else on the row is in doubt. The
 *                       link is stored as `email_discovery`; it manages status
 *                       only for a General Manager / Assistant General Manager
 *                       account in a GM/AGM position at one store, and never
 *                       role or store. Linking changes nobody's access.
 *
 * Only while the access guards allow changes. Pure; `woven-lifecycle.server.ts`
 * runs it.
 */

export const WOVEN_ACCESS_APPLY_ACTIONS_ENV = "WOVEN_ACCESS_APPLY_ACTIONS";
export type LifecycleAction = "LINK_EXISTING" | "DISABLE_TERMINATED";
const KNOWN: readonly LifecycleAction[] = ["LINK_EXISTING", "DISABLE_TERMINATED"];
/** At most this many links in one run; more waits for the next. */
export const MAX_LINKS_PER_RUN = 25;

export interface LifecycleConfig {
  actions: LifecycleAction[];
  ignored: string[];
}

export function readLifecycleConfig(env: Record<string, string | undefined> = process.env): LifecycleConfig {
  const named = [...new Set((env[WOVEN_ACCESS_APPLY_ACTIONS_ENV] ?? "").split(",").map((a) => a.trim().toUpperCase()).filter(Boolean))];
  return {
    actions: named.filter((a): a is LifecycleAction => (KNOWN as readonly string[]).includes(a)),
    ignored: named.filter((a) => !(KNOWN as readonly string[]).includes(a)),
  };
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
  disables: { appUserId: string; externalEmployeeId: string }[];
  links: LinkToInsert[];
}

export function decideLifecycle(rows: readonly PlannedRow[], config: LifecycleConfig, setBy: string): LifecyclePlan {
  const disables = config.actions.includes("DISABLE_TERMINATED")
    ? rows
        .filter((r) => r.actions.includes("DISABLE_TERMINATED") && r.account && !r.account.isProtected && r.account.status !== "disabled" && r.externalEmployeeId)
        .map((r) => ({ appUserId: r.account!.appUserId, externalEmployeeId: r.externalEmployeeId! }))
    : [];

  const links: LinkToInsert[] = [];
  if (config.actions.includes("LINK_EXISTING")) {
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
  return { disables, links };
}
