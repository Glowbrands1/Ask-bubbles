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
 *                        WOVEN_TEAM_COMPANY and WOVEN_TEAM_COMPANY_ID
 *                        (required — a login can see several companies; the
 *                        id must equal WOVEN_KNOWLEDGE_TENANT below)
 * Everything is off until WOVEN_SYNC_ENABLED / WOVEN_KNOWLEDGE_SYNC_ENABLED
 * are set. See docs/woven.md.
 */

/** Approved mapped roles the access preview may PROPOSE an account for. */
export const WOVEN_AUTO_PROVISION_ROLES: readonly Role[] = ["location_manager", "assistant_manager"];

/** Roles whose primary location and role the preview may propose following Woven. */
export const WOVEN_LOCATION_MANAGED_ROLES: readonly Role[] = ["location_manager", "assistant_manager"];

/**
 * ============================================================================
 * THE WOVEN KNOWLEDGE TENANT — pinned
 * ============================================================================
 *
 * The one Woven company Ask Bubbles' knowledge sync may read. VERIFIED in the
 * Woven browser investigation of 6 October 2026 (Codex handoff): the Company
 * settings page shows Brand "Buff City Soap", Company "Midwest Soap Makers"
 * and this Company ID.
 *
 * WHY IT IS PINNED IN CODE. The same Woven login can also open JB & Associates
 * (Sun Tan City), and Woven's content requests carry no company id — the
 * company lives only in the server-side session. So the sync proves the
 * session's company by its ID before every run and after every listing, and
 * `WOVEN_TEAM_COMPANY_ID` must equal this value or the sync refuses to start.
 * Pointing this deployment at another company takes a code change here, not
 * an environment variable.
 */
export const WOVEN_KNOWLEDGE_TENANT = {
  brand: "Buff City Soap",
  companyName: "Midwest Soap Makers",
  companyId: "55839F24-9241-418C-8405-37BAF9A42A87",
} as const;

/**
 * ============================================================================
 * CONTENT THAT MAY BELONG TO ANOTHER COMPANY — held for a person
 * ============================================================================
 *
 * The investigation found records in the Buff City Soap company whose titles
 * name JB & Associates (Sun Tan City): "JBA Policy Manual 2025", "NE Sick
 * Time" and the handbook "2025 JBA Policy Manual - Edited 5-2025". Nothing in
 * Woven's metadata proves they are meant for Buff City Soap team members.
 *
 * A published record whose title matches one of these patterns is held as
 * NEEDS_REVIEW (`ownership_review`): never ingested, never offered as an
 * audience choice, and withdrawn if it was ever in Ask Bubbles. To release
 * one, a person confirms it belongs to Buff City Soap and its Woven id (the
 * GUID in the sync's dry-run report) is added to `confirmedEntityIds`.
 */
export const WOVEN_KNOWLEDGE_OWNERSHIP_REVIEW: {
  readonly titlePatterns: readonly RegExp[];
  readonly confirmedEntityIds: readonly string[];
} = {
  titlePatterns: [
    /\bJBA\b/i,
    /\bJB\s*(?:&|and)\s*A(?:ssociates)?\b/i,
    /\bSun\s*Tan\s*City\b/i,
    /\bSTC\b/,
    /^\s*NE\s+Sick\s+Time\s*$/i,
  ],
  confirmedEntityIds: [],
};
