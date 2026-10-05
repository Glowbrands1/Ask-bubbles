import type { KnowledgeDocumentRole } from "@/lib/knowledge/document-roles";

/**
 * ============================================================================
 * BUFF CITY SOAP — KNOWLEDGE CONFIGURATION
 * ============================================================================
 *
 * WHERE KNOWLEDGE COMES FROM. Every source feeds the same ingestion pipeline
 * (extract → chunk → embed → pgvector) and the same retrieval, so a document
 * from Woven and one uploaded by hand are indistinguishable when an answer
 * cites them. The source list is descriptive: whether a source is LIVE is
 * decided by its own environment switches, and the Integrations screen reports
 * that honestly.
 */
export const KNOWLEDGE_SOURCES = [
  {
    id: "upload",
    label: "Uploaded documents",
    description: "PDF, DOCX, TXT and Markdown uploaded by a knowledge manager.",
  },
  {
    id: "woven",
    label: "Woven",
    description:
      "Published, company-wide Woven policies, handbooks, procedures, files and knowledge elements. Off until WOVEN_KNOWLEDGE_SYNC_ENABLED and the Woven Team credentials are set.",
  },
] as const;

/**
 * ============================================================================
 * PINNED DOCUMENTS — reasoning rules that must not be left to similarity
 * ============================================================================
 *
 * Some documents are RULES rather than evidence — an escalation policy, an
 * approved progression — and an answer that needs them must have them, not
 * merely whichever chunk ranked. A pinned role names the document (by tag,
 * with filename/title fallbacks), the sections that must all be present, and
 * the questions that need it:
 *
 *   triggers         questions that pin this document
 *   onUnavailable    "refuse": the turn is answered with `unavailableMessage`
 *                    and the model is never called; "degrade": the answer
 *                    proceeds without it
 *
 * EMPTY FOR BUFF CITY SOAP. No Buff document has been identified as a rule
 * document yet. Add one here when it is; nothing else needs to change.
 */
export interface PinnedKnowledgeRole {
  readonly role: KnowledgeDocumentRole;
  readonly triggers: readonly RegExp[];
  readonly onUnavailable: "refuse" | "degrade";
  readonly unavailableMessage: string;
}

export const PINNED_KNOWLEDGE_ROLES: readonly PinnedKnowledgeRole[] = [];
