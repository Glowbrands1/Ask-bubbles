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
 * THE TENANT IS NOT AN ENVIRONMENT VARIABLE. Both Woven integrations read
 * exactly one Woven company, `WOVEN_TENANT` below, and prove it on every run.
 * Credentials are environment variables:
 *   employee directory   WOVEN_API_BASE_URL, WOVEN_SUBSCRIPTION_KEY,
 *                        WOVEN_USERNAME, WOVEN_PASSWORD; WOVEN_COMPANY_ID is
 *                        a confirmation that must equal WOVEN_TENANT.companyId
 *   knowledge sync       WOVEN_BCS_USERNAME, WOVEN_BCS_PASSWORD;
 *                        WOVEN_BCS_COMPANY_ID (required) and
 *                        WOVEN_BCS_COMPANY_NAME (optional) are confirmations
 *                        that must equal WOVEN_TENANT
 * Everything is off until WOVEN_SYNC_ENABLED / WOVEN_KNOWLEDGE_SYNC_ENABLED
 * are set. See docs/woven.md.
 */

/** Approved mapped roles the access preview may PROPOSE an account for. */
export const WOVEN_AUTO_PROVISION_ROLES: readonly Role[] = ["location_manager", "assistant_manager"];

/** Roles whose primary location and role the preview may propose following Woven. */
export const WOVEN_LOCATION_MANAGED_ROLES: readonly Role[] = ["location_manager", "assistant_manager"];

/**
 * ============================================================================
 * THE WOVEN TENANT — Buff City Soap / Midwest Soap Makers, and nothing else
 * ============================================================================
 *
 * The ONE Woven company Ask Bubbles may operate against, for both Woven
 * integrations (knowledge sync and employee directory). VERIFIED in the Woven
 * browser investigation of 6 October 2026: the Company settings page shows
 * Brand "Buff City Soap", Company "Midwest Soap Makers" and this Company ID.
 *
 * THE COMPANY ID IS THE IDENTITY. The name is checked too, but a session is
 * accepted only when Woven shows THIS id.
 *
 * WHY IT IS IN CODE. The integration login can also open other Woven
 * companies, and Woven's content requests carry no company id — the company
 * lives only in the server-side session. So there is no tenant setting, no
 * default and no fallback: Ask Bubbles selects this company by its id, proves
 * it before reading, after every re-sign-in and before anything is written,
 * and fails otherwise. Environment variables can only CONFIRM these values;
 * any other value disables the integration. Pointing Ask Bubbles at another
 * Woven company would take a code change here, reviewed like any other.
 */
export const WOVEN_TENANT = {
  brand: "Buff City Soap",
  companyName: "Midwest Soap Makers",
  companyId: "55839F24-9241-418C-8405-37BAF9A42A87",
} as const;

/**
 * ============================================================================
 * CONTENT THAT MAY BELONG TO ANOTHER COMPANY — held for a person
 * ============================================================================
 *
 * The investigation found records INSIDE the Midwest Soap Makers company whose
 * titles name another company ("JBA Policy Manual 2025", "NE Sick Time" and
 * the handbook "2025 JBA Policy Manual - Edited 5-2025"). Their presence is
 * not a reason to read any other Woven company — Ask Bubbles never does — and
 * nothing in Woven's metadata proves they are meant for Buff City Soap team
 * members. So these patterns only HOLD such records; they select nothing.
 *
 * A published record whose title matches one of these patterns is held as
 * NEEDS_REVIEW (`ownership_review`): never ingested, never offered as an
 * audience choice, and withdrawn if it was ever in Ask Bubbles. There is no
 * automatic release: one is released only when Buff City Soap explicitly
 * approves it and its Woven id (from the dry-run report) is added to
 * `confirmedEntityIds` in a reviewed code change.
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
  confirmedEntityIds: [
    /*
     * The handbook "2025 JBA Policy Manual - Edited 5-2025" (Published,
     * audience Public), confirmed for Buff City Soap by the owner on 8 Oct
     * 2026. Released only when this change is merged and the next sync runs;
     * the content verification the owner asked for is recorded in the PR.
     * The policy record "JBA Policy Manual 2025" and "NE Sick Time" stay held.
     */
    "42486200-20b0-415c-9bad-c4425bc096ce",
  ],
};
