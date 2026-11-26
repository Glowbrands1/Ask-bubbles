import { ADMIN_CONSOLE_ROLES } from "@/lib/permissions";
import type { Role } from "@/types";

/**
 * ============================================================================
 * WHO MAY SEE AN EMPLOYEE'S HOME ADDRESS FROM WOVEN (Pau, 26 Nov 2026, approved by Curt)
 * ============================================================================
 *
 * "only Admins and Managers", both apps. Managers are District Managers, Regional Managers and Store Directors
 * (`location_manager`) — not assistant managers.
 *
 *   admins (the admin console roles)   the Employee Directory's "Show address" (its own permissions)
 *   DM · RM · Store Director           the exit form's Permanent Address only, for people at stores they cover
 *
 * The address is always read live from Woven and never stored.
 */

export const HOME_ADDRESS_MANAGER_ROLES: readonly Role[] = ["district_manager", "regional_manager", "location_manager"];

/** May this role ever see a Woven home address (the exit form's Permanent Address included)? */
export function mayReadHomeAddress(role: Role | null | undefined): boolean {
  if (!role) return false;
  return ADMIN_CONSOLE_ROLES.includes(role) || HOME_ADDRESS_MANAGER_ROLES.includes(role);
}

