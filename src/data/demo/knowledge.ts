import type {
  DocumentFileType,
  DocumentStatus,
  KnowledgeCategory,
  KnowledgeChunk,
  KnowledgeDocument,
} from "@/types";
import { estimateCharacterCount } from "@/lib/utils/format";

/**
 * Seeded knowledge corpus — DEMO CONTENT.
 *
 * Scale and shape mirror the corpus JBA runs today (~56 focused documents
 * across ~11 categories), NOT the full Woven library (600+ documents, much of
 * it maintenance and SDS material they explicitly do not want ingested).
 *
 * IMPORTANT: no real company policy language appears anywhere in this file.
 * Every excerpt is deliberately generic placeholder prose and is labelled
 * "Demo content" in the UI. Real documents arrive via upload or, later, a
 * SharePoint / Woven sync.
 */

/*
 * THE TAXONOMY LIVES IN `data/knowledge-taxonomy.ts` NOW, and is re-exported
 * here so every existing importer keeps working. It is production
 * configuration rather than seeded content, and keeping it in this file meant
 * that importing a category label also shipped every seeded document below it
 * into the production bundle.
 */
export type { KnowledgeCategoryMeta } from "@/data/knowledge-taxonomy";
export {
  KNOWLEDGE_CATEGORIES,
  KNOWLEDGE_CATEGORY_LABEL,
  DOCUMENT_STATUS_LABEL,
} from "@/data/knowledge-taxonomy";

interface Seed {
  id: string;
  title: string;
  description: string;
  category: KnowledgeCategory;
  fileType?: DocumentFileType;
  sizeKb: number;
  status?: DocumentStatus;
  uploadedBy?: string;
  uploadedAt: string;
  version?: number;
  tags: string[];
  priorVersions?: { version: number; uploadedAt: string; uploadedBy: string; sizeKb: number }[];
}

const EXTENSION: Record<DocumentFileType, string> = {
  pdf: "pdf",
  docx: "docx",
  xlsx: "xlsx",
  txt: "txt",
  md: "md",
  pptx: "pptx",
  image: "png",
  other: "dat",
};

function slug(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function expand(seed: Seed): KnowledgeDocument {
  const fileType = seed.fileType ?? "pdf";
  const sizeBytes = Math.round(seed.sizeKb * 1024);
  const status = seed.status ?? "ready";
  return {
    id: seed.id,
    title: seed.title,
    description: seed.description,
    category: seed.category,
    fileName: `${slug(seed.title)}.${EXTENSION[fileType]}`,
    fileType,
    sizeBytes,
    characterCount: estimateCharacterCount(sizeBytes),
    status,
    source: "system",
    version: seed.version ?? 1,
    previousVersions: (seed.priorVersions ?? []).map((prior) => ({
      version: prior.version,
      uploadedAt: prior.uploadedAt,
      uploadedBy: prior.uploadedBy,
      sizeBytes: Math.round(prior.sizeKb * 1024),
      note: "Superseded by a newer upload",
    })),
    uploadedBy: seed.uploadedBy ?? "Demo Owner",
    uploadedAt: seed.uploadedAt,
    updatedAt: seed.uploadedAt,
    indexed: status === "ready",
    tags: seed.tags,
  };
}

/**
 * DEMO DOCUMENTS — PLACEHOLDERS, NOT BUFF CITY SOAP POLICY.
 *
 * Demo builds only. Every title says "(Demo)" and every excerpt opens with
 * "Demo content.", and the UI labels them as demo content wherever they are
 * shown. They exist so the knowledge, citation and chat flows can be
 * demonstrated without any real company document. Replace them by uploading
 * Buff's real documents to a live deployment; nothing here is ever ingested.
 */
const SEEDS: Seed[] = [
  {
    id: "kb-demo-001",
    title: "Store Opening Checklist (Demo)",
    description: "Placeholder opening routine used to demonstrate grounded answers.",
    category: "operations",
    sizeKb: 84,
    uploadedAt: "2026-09-15T14:00:00.000Z",
    tags: ["opening", "checklist", "demo"],
  },
  {
    id: "kb-demo-002",
    title: "Guest Experience Basics (Demo)",
    description: "Placeholder guidance on greeting guests and answering product questions.",
    category: "sales_client_experience",
    sizeKb: 120,
    uploadedAt: "2026-09-15T14:05:00.000Z",
    tags: ["guests", "service", "demo"],
  },
  {
    id: "kb-demo-003",
    title: "Attendance Expectations (Demo)",
    description: "Placeholder attendance guidance used to demonstrate policy citations.",
    category: "policies_compliance",
    sizeKb: 96,
    uploadedAt: "2026-09-15T14:10:00.000Z",
    tags: ["attendance", "demo"],
  },
];

export const DEMO_KNOWLEDGE_DOCUMENTS: KnowledgeDocument[] = SEEDS.map(expand);

/** Retrievable chunks for the demo documents. Placeholder prose only. */
export const DEMO_KNOWLEDGE_CHUNKS: KnowledgeChunk[] = [
  {
    id: "chunk-demo-001",
    documentId: "kb-demo-001",
    locator: "Section 1",
    content:
      "Demo content. Arrive before opening, unlock and disarm, walk the floor for anything out of place, count the opening drawer, and confirm displays are stocked and tidy before the doors open.",
  },
  {
    id: "chunk-demo-002",
    documentId: "kb-demo-002",
    locator: "Greeting guests",
    content:
      "Demo content. Greet every guest within a minute of arriving, ask what brings them in, and offer to let them smell or try a product. When a guest asks about an ingredient, point them to the product label and never guess.",
  },
  {
    id: "chunk-demo-003",
    documentId: "kb-demo-003",
    locator: "Section 2",
    content:
      "Demo content. Team members are expected to be ready to work at the start of their scheduled shift and to call their manager as early as possible if they cannot make it.",
  },
];

export function chunksForDocument(documentId: string): KnowledgeChunk[] {
  return DEMO_KNOWLEDGE_CHUNKS.filter((chunk) => chunk.documentId === documentId);
}
