import type { Permission, PermissionMatrix, Role } from "@/types";

/**
 * ============================================================================
 * BUFF CITY SOAP — ROLES AND PERMISSIONS (COMPANY CONFIGURATION)
 * ============================================================================
 *
 * The role KEYS are platform (`Role` in `src/types`, mirrored by the
 * `app_user_role` enum). What each key is CALLED here and what it may DO is
 * Buff configuration, and this file is the one place both are decided.
 *
 * PROVISIONAL. Buff City Soap has not confirmed its title structure. The
 * labels below are neutral retail titles, and the grants follow Ask Bubbles'
 * proven least-privilege shape: frontline staff read, managers create, district
 * and above administer. Replace the labels when Buff's Woven positions are
 * known; tighten or widen the grants here and nowhere else.
 *
 * THE SERVER ENFORCES THIS MATRIX. `authorizeRequest()` reads
 * `DEFAULT_PERMISSION_MATRIX` (re-exported from `src/lib/permissions`) — never
 * a browser copy — so editing a matrix in the browser grants nothing.
 */

export interface RoleCopy {
  readonly label: string;
  readonly short: string;
  readonly description: string;
}

export const ROLE_COPY: Readonly<Record<Role, RoleCopy>> = {
  employee: {
    label: "Team Member",
    short: "Team",
    description:
      "Frontline team member. Ask Bubbles and the knowledge base — no forms, reporting or administration.",
  },
  assistant_manager: {
    label: "Assistant Manager",
    short: "AM",
    description:
      "Supports the location manager. Ask Bubbles, knowledge, reports and the forms register for their location.",
  },
  location_manager: {
    label: "Location Manager",
    short: "LM",
    description: "Runs a single location. Forms, knowledge and location reporting.",
  },
  district_manager: {
    label: "District Manager",
    short: "DM",
    description:
      "Owns a district. Everything a location manager has across the district, plus template and knowledge management.",
  },
  regional_manager: {
    label: "Regional Manager",
    short: "RM",
    description: "Owns a region. District Manager access across every district they cover.",
  },
  admin: {
    label: "Admin",
    short: "Admin",
    description:
      "The company administrator. Full platform access including user management and integrations.",
  },
  owner: {
    label: "Owner",
    short: "Owner",
    description: "Full platform access including AI spend, user management and integrations.",
  },
  developer: {
    label: "Developer",
    short: "Dev",
    description: "Full platform access for build and support work.",
  },
};

/**
 * THE FRONTLINE ROLE, AND THE ONLY ROLE DEFINED AS A CLOSED LIST. Everything
 * else is denied by ABSENCE, so a permission added next month is denied to
 * frontline staff automatically.
 */
const EMPLOYEE: Permission[] = ["ask_questions", "view_knowledge"];

const ASSISTANT_MANAGER: Permission[] = [
  ...EMPLOYEE,
  "view_overview",
  "view_forms_workspace",
  "view_form_monitoring",
  "view_reports",
];

const LOCATION_MANAGER: Permission[] = [...ASSISTANT_MANAGER, "create_forms"];

const DISTRICT_MANAGER: Permission[] = [
  ...LOCATION_MANAGER,
  "manage_form_templates",
  "manage_form_records",
  "manage_knowledge",
];

const REGIONAL_MANAGER: Permission[] = [...DISTRICT_MANAGER, "view_ai_usage"];

/** Every platform permission, for the administrative roles. */
export const ALL_PERMISSIONS: readonly Permission[] = [
  "ask_questions",
  "view_overview",
  "view_knowledge",
  "manage_knowledge",
  "view_forms_workspace",
  "create_forms",
  "view_form_monitoring",
  "manage_form_templates",
  "manage_form_records",
  "view_reports",
  "view_ai_usage",
  "view_analytics",
  "manage_users",
  "manage_integrations",
];

export const COMPANY_PERMISSION_MATRIX: PermissionMatrix = {
  employee: EMPLOYEE,
  assistant_manager: ASSISTANT_MANAGER,
  location_manager: LOCATION_MANAGER,
  district_manager: DISTRICT_MANAGER,
  regional_manager: REGIONAL_MANAGER,
  admin: [...ALL_PERMISSIONS],
  owner: [...ALL_PERMISSIONS],
  developer: [...ALL_PERMISSIONS],
};

/** Roles a demo presenter may switch between. Demo builds only. */
export const DEMO_SWITCHABLE_ROLES: readonly Role[] = [
  "employee",
  "assistant_manager",
  "location_manager",
  "district_manager",
  "regional_manager",
  "owner",
];
