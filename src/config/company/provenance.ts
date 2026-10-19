/**
 * ============================================================================
 * KNOWLEDGE PROVENANCE REGISTRY — SHADOW MODE ONLY
 * ============================================================================
 *
 * Which authority each pinned knowledge document speaks with. Read by the
 * shadow diagnostic only; no drafting prompt, guard or retrieval consults it.
 *
 *   buff_official        approved Buff City Soap content
 *   company_multi_brand  company-wide JBA content (brand-scoped elsewhere)
 *   legacy_stc           Sun Tan City methodology adopted verbatim
 *
 * NOTHING HERE IS BUSINESS-APPROVED. The Framework's `legacy_stc` origin is an
 * engineering classification for Buff HR and Operations to confirm or change.
 */

import { PERFORMANCE_MANAGEMENT_FRAMEWORK } from "@/config/company/knowledge";

export type KnowledgeOrigin = "buff_official" | "company_multi_brand" | "legacy_stc";

export const PROVENANCE_REGISTRY_VERSION = 1;

export const PROVENANCE_BY_ROLE: Readonly<Record<string, KnowledgeOrigin>> = {
  [PERFORMANCE_MANAGEMENT_FRAMEWORK.id]: "legacy_stc",
};

export function originForRole(roleId: string): KnowledgeOrigin | null {
  return PROVENANCE_BY_ROLE[roleId] ?? null;
}
