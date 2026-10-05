import type { Role } from "@/types";

/**
 * ============================================================================
 * BUFF CITY SOAP — WOVEN ADAPTER POLICY
 * ============================================================================
 *
 * The Woven integration is platform code (src/lib/employees/woven,
 * src/lib/knowledge-sync/woven). What is Buff's to decide lives here.
 *
 * NOT YET CONFIRMED BY BUFF CITY SOAP. These values are the conservative
 * defaults carried over from the reference platform's access planner. They
 * only shape the ACCESS PREVIEW: WOVEN_ACCESS_MODE has no apply mode, so no
 * account is created, disabled, re-scoped or re-roled from Woven by this
 * build, whatever these say. Confirm them before any apply stage is built.
 *
 * Credentials and the tenant are environment variables, never source:
 *   employee directory   WOVEN_API_BASE_URL, WOVEN_SUBSCRIPTION_KEY,
 *                        WOVEN_USERNAME, WOVEN_PASSWORD, WOVEN_COMPANY_ID
 *   knowledge sync       WOVEN_TEAM_USERNAME, WOVEN_TEAM_PASSWORD,
 *                        WOVEN_TEAM_COMPANY (required — a login can see
 *                        several companies)
 * Everything is off until WOVEN_SYNC_ENABLED / WOVEN_KNOWLEDGE_SYNC_ENABLED
 * are set. See docs/woven.md.
 */

/** Approved mapped roles the access preview may PROPOSE an account for. */
export const WOVEN_AUTO_PROVISION_ROLES: readonly Role[] = ["location_manager", "assistant_manager"];

/** Roles whose primary location and role the preview may propose following Woven. */
export const WOVEN_LOCATION_MANAGED_ROLES: readonly Role[] = ["location_manager", "assistant_manager"];
