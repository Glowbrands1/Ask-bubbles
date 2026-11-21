import { WOVEN_KNOWLEDGE_OWNERSHIP_REVIEW } from "@/config/company/woven";
import type { SourceRecord } from "../../types";
import { BCS_COMPANY_WIDE_AUDIENCE, PROCEDURE_ALL_POSITIONS, PUBLIC_AUDIENCE, TEAM_POSITION_AUDIENCE } from "./contract";

/**
 * ============================================================================
 * BUFF CITY SOAP — WHO MAY SEE A SYNCED DOCUMENT, AND WHOSE IT IS
 * ============================================================================
 *
 * Ask Bubbles shows every knowledge document to everyone signed in: retrieval
 * does not filter by role, team, position or location (`../../access.ts`). So a
 * Woven audience maps to exactly one of three outcomes:
 *
 *   SHARED      "All Teams All Positions" on a FILE LIBRARY item — the one
 *               audience the owner approved for automatic company-wide
 *               ingestion at the Production launch.
 *   REVIEWABLE  "All Positions" (Procedures): no position limit, but whether a
 *               procedure can also be limited by team or location is
 *               UNVERIFIED. Held until an administrator decides it once.
 *   NEVER       anything narrower ("8 Teams 21 Positions", "All Teams 3
 *               Positions", a list of positions) → `audience_restricted`;
 *               anything unclear ("N/A", no audience stated, an unrecognised
 *               label) → `audience_unclear`; a label whose access meaning is
 *               not verified for this content type ("Public" anywhere, "All
 *               Teams All Positions" outside the File Library) →
 *               `audience_unverified`. EXCLUDED, and an administrator's
 *               audience decision cannot share it.
 *
 * ONE EXCEPTION, BY IDENTITY: a HANDBOOK the owner confirmed for Buff City
 * Soap (`WOVEN_KNOWLEDGE_OWNERSHIP_REVIEW.confirmedEntityIds`) whose audience
 * is "Public" is SHARED. "Public" is Woven's broadest audience, so sharing it
 * with everyone signed in to Ask Bubbles is no wider than Woven's own; and the
 * confirmation is a reviewed code change naming that one record.
 *
 * AND A POLICY LISTED FROM WOVEN'S MANAGEMENT TABLE (board f105,
 * WOVEN_BCS_POLICY_MANAGEMENT_LIST_ENABLED): Woven's policy audience setting
 * is `Public` or `Targeted` (verified in the sibling app), so a policy whose
 * Audience reads exactly "Public" is for everyone in the company. Pau's ruling
 * (22 Nov 2026, relayed by QA): "YES — Bubbles may quote any company-wide
 * ("Public") Woven policy, like Sunny." It is SHARED (`../sync.ts`,
 * `companyWideLabelsFor`). A Targeted policy's cell is a display summary
 * ("All Teams 8 Positions") and stays `audience_restricted`. Every other
 * "Public" item, of any type, stays `audience_unverified`.
 */

function norm(label: string): string {
  return label.replace(/\s+/g, " ").trim().toLowerCase();
}

const COMPANY_WIDE = norm(BCS_COMPANY_WIDE_AUDIENCE.label);

export function bcsAudienceRestriction(
  audience: readonly string[] | null,
  record: Pick<SourceRecord, "contentType" | "entityId"> & Partial<Pick<SourceRecord, "sourceMetadata">>,
): string | null {
  const labels = (audience ?? []).map(norm).filter(Boolean);
  if (labels.length === 0) return "audience_unclear";
  for (const label of labels) {
    if (label === COMPANY_WIDE) {
      if ((BCS_COMPANY_WIDE_AUDIENCE.contentTypes as readonly string[]).includes(record.contentType)) continue;
      return "audience_unverified";
    }
    if (PROCEDURE_ALL_POSITIONS.test(label)) {
      if (record.contentType === "procedure") continue;
      return "audience_unverified";
    }
    if (PUBLIC_AUDIENCE.test(label)) {
      if (record.contentType === "handbook" && isConfirmed(record.entityId)) continue;
      if (record.contentType === "policy" && listedFromPolicyManagement(record)) continue;
      return "audience_unverified";
    }
    if (/^n\/?a$/.test(label)) return "audience_unclear";
    if (TEAM_POSITION_AUDIENCE.test(label)) return "audience_restricted";
    /* A named position (or anything else not verified as company-wide): narrower than everyone. */
    return "audience_restricted";
  }
  return null;
}

/**
 * Records INSIDE Midwest Soap Makers whose titles name another company:
 * held as NEEDS_REVIEW (`ownership_review`) until its id is confirmed in
 * `WOVEN_KNOWLEDGE_OWNERSHIP_REVIEW.confirmedEntityIds`.
 */
export function bcsOwnershipHold(record: Pick<SourceRecord, "entityId" | "title">): string | null {
  if (isConfirmed(record.entityId)) return null;
  return WOVEN_KNOWLEDGE_OWNERSHIP_REVIEW.titlePatterns.some((pattern) => pattern.test(record.title)) ? "ownership_review" : null;
}

/** Whether the owner confirmed this Woven record for Buff City Soap in a reviewed code change. */
function isConfirmed(entityId: string): boolean {
  return WOVEN_KNOWLEDGE_OWNERSHIP_REVIEW.confirmedEntityIds.some((id) => id.toLowerCase() === entityId.toLowerCase());
}

/** A policy read from `GET /Policy` (whose audience cell is Woven's Public/Targeted setting), not from a Knowledge Center card. */
function listedFromPolicyManagement(record: Partial<Pick<SourceRecord, "sourceMetadata">>): boolean {
  return record.sourceMetadata?.listedFrom === "policy_management";
}
