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
  view_forms_workspace: "Open the Forms workspace",
  create_forms: "Create forms",
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
  view_forms_workspace: "Forms",
  create_forms: "Forms",
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
