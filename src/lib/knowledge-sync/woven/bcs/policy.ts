import { WOVEN_KNOWLEDGE_OWNERSHIP_REVIEW } from "@/config/company/woven";
import type { SourceRecord } from "../../types";
import { BCS_COMPANY_WIDE_AUDIENCE_LABELS, PROCEDURE_ALL_POSITIONS, TEAM_POSITION_AUDIENCE } from "./contract";

/**
 * ============================================================================
 * BUFF CITY SOAP — WHO MAY SEE A SYNCED DOCUMENT, AND WHOSE IT IS
 * ============================================================================
 *
 * Ask Bubbles shows every knowledge document to everyone signed in: retrieval
 * does not filter by role, team, position or location (`../../access.ts`). So a
 * Woven audience maps to exactly one of three outcomes:
 *
 *   SHARED      the audience is company-wide in Woven — "Public" (Handbooks)
 *               or "All Teams All Positions" (File Library).
 *   REVIEWABLE  "All Positions" (Procedures): no position limit, but whether a
 *               procedure can also be limited by team or location is
 *               UNVERIFIED. Held until an administrator decides it once.
 *   NEVER       anything narrower ("8 Teams 21 Positions", "All Teams 3
 *               Positions", a list of positions) → `audience_restricted`;
 *               anything unclear ("N/A", no audience stated, an unrecognised
 *               label) → `audience_unclear`. EXCLUDED, and an administrator's
 *               audience decision cannot share it: Ask Bubbles cannot honour a
 *               narrower audience, so it does not pretend to.
 */

function norm(label: string): string {
  return label.replace(/\s+/g, " ").trim().toLowerCase();
}

const SHARED = new Set(BCS_COMPANY_WIDE_AUDIENCE_LABELS.map(norm));

export function bcsAudienceRestriction(audience: readonly string[] | null): string | null {
  const labels = (audience ?? []).map(norm).filter(Boolean);
  if (labels.length === 0) return "audience_unclear";
  for (const label of labels) {
    if (SHARED.has(label) || PROCEDURE_ALL_POSITIONS.test(label)) continue;
    if (/^n\/?a$/.test(label)) return "audience_unclear";
    if (TEAM_POSITION_AUDIENCE.test(label)) return "audience_restricted";
    /* A named position (or anything else not verified as company-wide): narrower than everyone. */
    return "audience_restricted";
  }
  return null;
}

/**
 * Content that may belong to another company (JB & Associates / Sun Tan City):
 * held as NEEDS_REVIEW (`ownership_review`) until its id is confirmed in
 * `WOVEN_KNOWLEDGE_OWNERSHIP_REVIEW.confirmedEntityIds`.
 */
export function bcsOwnershipHold(record: Pick<SourceRecord, "entityId" | "title">): string | null {
  const confirmed = WOVEN_KNOWLEDGE_OWNERSHIP_REVIEW.confirmedEntityIds.some((id) => id.toLowerCase() === record.entityId.toLowerCase());
  if (confirmed) return null;
  return WOVEN_KNOWLEDGE_OWNERSHIP_REVIEW.titlePatterns.some((pattern) => pattern.test(record.title)) ? "ownership_review" : null;
}
