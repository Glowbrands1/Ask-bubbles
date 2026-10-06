import type { KnowledgeDocumentRole } from "@/lib/knowledge/document-roles";
import type { NamedHandbookConfig } from "@/lib/knowledge/named-handbook";

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

/**
 * ============================================================================
 * A HANDBOOK THE QUESTION NAMES — read whole by identity, not by similarity
 * ============================================================================
 *
 * When a question names the company's handbook ("what's in the Buff team
 * handbook?", "what does the handbook say about breaks?"), the platform pins
 * its table of contents or the sections whose printed headings match, instead
 * of hoping one of its many chunks ranks. See `lib/knowledge/named-handbook.ts`.
 *
 *   identity   how the document is recognised: a tag (preferred), then a
 *              file-name or title prefix
 *   namedBy    patterns that must ALL match for a question to name it
 *   notATopic  the company's own words that are never a section topic
 *
 * NULL FOR BUFF CITY SOAP. No Buff handbook has been supplied. When one is,
 * tag it (e.g. "team-handbook") and fill this in; nothing else needs to change.
 */
export const NAMED_HANDBOOK: NamedHandbookConfig | null = null;
