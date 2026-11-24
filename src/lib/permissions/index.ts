import {
  ALL_PERMISSIONS,
  COMPANY_PERMISSION_MATRIX,
  ROLE_COPY,
} from "@/config/company/access";
import type { Permission, PermissionMatrix, Role } from "@/types";

/**
 * ============================================================================
 * ROLE -> PERMISSION, THE PLATFORM SIDE
 * ============================================================================
 *
 * What each role is called and what it may do is COMPANY configuration
 * (`src/config/company/access.ts`). This module is the platform around it:
 * the fixed list of role keys, labels for the permission keys, the admin
 * console rule, and the helpers every check goes through.
 *
 * `DEFAULT_PERMISSION_MATRIX` is what the SERVER enforces. The browser's
 * editable copy (demo mode only) never reaches an authorization decision.
 */

export const ROLES: Role[] = [
  "employee",
  "assistant_manager",
  "location_manager",
  "district_manager",
  "regional_manager",
  "admin",
  "owner",
  "developer",
];

export const ROLE_LABEL: Record<Role, string> = Object.fromEntries(
  ROLES.map((role) => [role, ROLE_COPY[role].label]),
) as Record<Role, string>;

export const ROLE_SHORT_LABEL: Record<Role, string> = Object.fromEntries(
  ROLES.map((role) => [role, ROLE_COPY[role].short]),
) as Record<Role, string>;

export const ROLE_DESCRIPTION: Record<Role, string> = Object.fromEntries(
  ROLES.map((role) => [role, ROLE_COPY[role].description]),
) as Record<Role, string>;

export const PERMISSIONS: Permission[] = [...ALL_PERMISSIONS];

export const PERMISSION_LABEL: Record<Permission, string> = {
  ask_questions: "Ask questions",
  view_overview: "View the Home dashboard",
  view_knowledge: "Read the knowledge base",
  manage_knowledge: "Manage the knowledge base",
  view_ai_training: "Open AI Training",
  view_forms_workspace: "Open the Forms workspace",
  create_forms: "Create forms",
  create_coaching_form: "Create coaching forms",
  create_corrective_action: "Create corrective action forms",
  create_policy_review: "Create policy reviews",
  create_epp: "Create performance plans (EPPs)",
  create_hiring_form: "Create hiring and interview forms",
  create_exit_form: "Create resignation/exit forms",
  create_employment_change_form: "Create demotion and transfer forms",
  view_form_monitoring: "View the forms register",
  manage_form_templates: "Manage form templates",
  manage_form_records: "Delete and archive filed forms",
  view_reports: "View reports",
  view_ai_usage: "View AI usage & spend",
  view_analytics: "View adoption analytics",
  manage_users: "Manage users",
  manage_integrations: "Manage integrations",
};

export const PERMISSION_GROUP: Record<Permission, string> = {
  ask_questions: "Assistant",
  view_overview: "Insights",
  view_reports: "Insights",
  view_knowledge: "Knowledge",
  manage_knowledge: "Knowledge",
  view_ai_training: "Knowledge",
  view_forms_workspace: "Forms",
  create_forms: "Forms",
  create_coaching_form: "Forms",
  create_corrective_action: "Forms",
  create_policy_review: "Forms",
  create_epp: "Forms",
  create_hiring_form: "Forms",
  create_exit_form: "Forms",
  create_employment_change_form: "Forms",
  view_form_monitoring: "Forms",
  manage_form_templates: "Forms",
  manage_form_records: "Forms",
  view_ai_usage: "Administration",
  view_analytics: "Administration",
  manage_users: "Administration",
  manage_integrations: "Administration",
};

export const DEFAULT_PERMISSION_MATRIX: PermissionMatrix = COMPANY_PERMISSION_MATRIX;

/**
 * Admin console access, and deliberately NOT editable from the permissions
 * matrix UI or from company configuration.
 *
 * Mirrored by the last-admin trigger in the `app_users` migration, which
 * counts exactly these three as administrative — a test asserts the two lists
 * match, because the trigger is what stops the app being left with nobody who
 * can administer it.
 */
export const ADMIN_CONSOLE_ROLES: Role[] = ["admin", "owner", "developer"];

export function canAccessAdminConsole(role: Role): boolean {
  return ADMIN_CONSOLE_ROLES.includes(role);
}

export function hasPermission(
  matrix: PermissionMatrix,
  role: Role,
  permission: Permission,
): boolean {
  return matrix[role]?.includes(permission) ?? false;
}

export function togglePermission(
  matrix: PermissionMatrix,
  role: Role,
  permission: Permission,
): PermissionMatrix {
  const current = matrix[role] ?? [];
  const next = current.includes(permission)
    ? current.filter((entry) => entry !== permission)
    : [...current, permission];
  return { ...matrix, [role]: next };
}

/** Permission keys that are locked to admin roles in the matrix UI. */
export const ADMIN_ONLY_PERMISSIONS: Permission[] = [
  "view_ai_usage",
  "view_analytics",
  "manage_users",
  "manage_integrations",
];

/**
 * Whether the matrix screen shows a cell as locked.
 *
 * Admin-console roles are locked in full (their access is fixed). For every
 * other role only the two administrative grants are locked off — NOT the
 * whole admin-only list, because a role may genuinely hold `view_ai_usage`
 * and the screen must describe its access accurately.
 */
export function isPermissionLockedFor(role: Role, permission: Permission) {
  if ((ADMIN_CONSOLE_ROLES as readonly Role[]).includes(role)) return true;
  return permission === "manage_users" || permission === "manage_integrations";
}

/**
 * Where a role lands after signing in: Home when it may open Home, otherwise
 * the assistant. Derived from the permission rather than listed by role, so a
 * role added later lands somewhere it can actually see. Client-safe; the
 * server page guards re-export it from `@/lib/auth/page`.
 */
export function defaultLandingForRole(role: Role): string {
  if (hasPermission(activePermissionMatrix(), role, "view_overview")) return "/";
  if (hasPermission(activePermissionMatrix(), role, "ask_questions")) return "/chat";
  /*
   * A role with neither is not something the matrix currently produces. Landing
   * on the login screen is the honest answer for it: there is no screen this
   * person can open, and pretending otherwise would be a loop.
   */
  return "/login";
}

export { asdNoFormMonitoringEnabled } from "./asd-no-form-monitoring";

/*
 * ============================================================================
 * SAVED CHANGES TO THE MATRIX (Pau, 23 Nov 2026)
 * ============================================================================
 *
 * An administrator ticks and unticks cells on the Permissions screen; what is
 * saved is an OVERRIDE per role, kept in `permission_overrides`. The matrix
 * that is ENFORCED (server) and used for `can()` (browser) is the defaults with
 * those overrides merged over them: `activePermissionMatrix()`.
 *
 * A role with no override uses the defaults, so an empty table changes nothing,
 * and an override replaces the flag-shaped defaults for that role (ASD under
 * `assistantManagerCreateEnabled` / `asdNoFormMonitoringEnabled`): somebody
 * saved it on purpose.
 *
 * WHAT AN OVERRIDE CAN NEVER DO, whatever is stored: change the administrator
 * roles (full access), or touch a cell that is not editable
 * (`isPermissionEditableFor`). `sanitizeOverrides` drops those and anything
 * unknown, so a hand-edited row cannot lock the administrators out or hand a
 * manager an administrator screen.
 */

/** Role -> the WHOLE permission list for that role. A role absent here uses the defaults. */
export type PermissionOverrides = Partial<Record<Role, Permission[]>>;

/**
 * Whether the matrix screen may change this cell.
 *
 * Not editable: anything for an administrator role; the locked cells
 * (`isPermissionLockedFor`); and the administrator-only permissions
 * (`ADMIN_ONLY_PERMISSIONS`) for a role that does not hold them by default —
 * the Regional Manager's `view_ai_usage` can be taken away, but nobody else can
 * be given spend or adoption analytics.
 */
export function isPermissionEditableFor(role: Role, permission: Permission): boolean {
  if (isPermissionLockedFor(role, permission)) return false;
  if (ADMIN_ONLY_PERMISSIONS.includes(permission) && !hasPermission(DEFAULT_PERMISSION_MATRIX, role, permission)) {
    return false;
  }
  return true;
}

const KNOWN_ROLES = new Set<string>(ROLES);
const KNOWN_PERMISSIONS = new Set<string>(PERMISSIONS);

/** Keeps only what may be enforced: known roles, known keys, editable cells. Never throws. */
export function sanitizeOverrides(raw: unknown): PermissionOverrides {
  const out: PermissionOverrides = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [role, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!KNOWN_ROLES.has(role) || !Array.isArray(list)) continue;
    const r = role as Role;
    if (canAccessAdminConsole(r)) continue;
    const kept = new Set<Permission>();
    for (const entry of list) {
      if (typeof entry === "string" && KNOWN_PERMISSIONS.has(entry) && isPermissionEditableFor(r, entry as Permission)) {
        kept.add(entry as Permission);
      }
    }
    out[r] = PERMISSIONS.filter((permission) => kept.has(permission));
  }
  return out;
}

/** The defaults with `overrides` merged over them. Fixed cells always keep their default. */
export function effectiveMatrix(
  overrides: unknown,
  defaults: PermissionMatrix = DEFAULT_PERMISSION_MATRIX,
): PermissionMatrix {
  const clean = sanitizeOverrides(overrides);
  const out = {} as PermissionMatrix;
  for (const role of ROLES) {
    const base = defaults[role] ?? [];
    const override = clean[role];
    if (!override) {
      out[role] = base;
      continue;
    }
    const fixed = base.filter((permission) => !isPermissionEditableFor(role, permission));
    out[role] = PERMISSIONS.filter((permission) => override.includes(permission) || fixed.includes(permission));
  }
  return out;
}

/**
 * What to store for a full matrix (the screen's draft): only roles whose
 * editable cells differ from the defaults, so a role ticked back to its default
 * goes back to following the defaults.
 */
export function overridesFromMatrix(
  matrix: PermissionMatrix,
  defaults: PermissionMatrix = DEFAULT_PERMISSION_MATRIX,
): PermissionOverrides {
  const out: PermissionOverrides = {};
  for (const role of ROLES) {
    if (canAccessAdminConsole(role)) continue;
    const editable = PERMISSIONS.filter((permission) => isPermissionEditableFor(role, permission));
    const chosen = editable.filter((permission) => matrix[role]?.includes(permission));
    const wanted = editable.filter((permission) => defaults[role]?.includes(permission));
    if (chosen.join() !== wanted.join()) out[role] = chosen;
  }
  return out;
}

let activeOverrides: PermissionOverrides = {};
let activeMatrix: PermissionMatrix = DEFAULT_PERMISSION_MATRIX;

/**
 * THE MATRIX IN FORCE RIGHT NOW. Synchronous, so the ~30 places that ask
 * "may this role?" stay synchronous. On the server `ensurePermissionsLoaded()`
 * (`store.ts`) refreshes it at the start of every authorized request and page;
 * in the browser the session loads it from `/api/admin/permissions`. Until
 * something has loaded it, it IS the defaults — never anything wider.
 */
export function activePermissionMatrix(): PermissionMatrix {
  return activeMatrix;
}

export function activePermissionOverrides(): PermissionOverrides {
  return activeOverrides;
}

/** Replaces the saved overrides (sanitized). Called by the loader and the session, and by tests. */
export function setActivePermissionOverrides(raw: unknown): void {
  activeOverrides = sanitizeOverrides(raw);
  activeMatrix = effectiveMatrix(activeOverrides);
}
