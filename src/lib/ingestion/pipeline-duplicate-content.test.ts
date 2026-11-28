import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EMBEDDING_DIMENSIONS } from "@/lib/config/models";

/**
 * WOVEN_DUPLICATE_CONTENT_HOLD_ENABLED. Ported from the sibling app (QA, 10 Nov 2026): two live Woven documents with
 * different titles had identical content, all indexed, so a question about one got the other's answer. A Woven file
 * whose text matches another live document with a different title is not indexed; the first one stays. The titles here
 * are invented. Supabase, extraction and embeddings are faked.
 */
const ORIGINAL = { ...process.env };
const FLAG = "WOVEN_DUPLICATE_CONTENT_HOLD_ENABLED";

interface Op {
  table: string;
  verb: string;
  payload: unknown;
}

async function load(options: { sameContent?: { id: string; title: string }[] } = {}) {
  vi.resetModules();
  const ops: Op[] = [];
  const inserted: unknown[] = [];
  vi.doMock("./extract", () => ({
    extractDocument: async () => ({ segments: [{ text: "Shift Checklist. Count the drawer before opening. ".repeat(20), locator: "Page 1", page: 1, section: null }], characterCount: 1000, pageCount: 1 }),
  }));
  vi.doMock("@/lib/embeddings", () => ({
    getEmbeddingProvider: () => ({
      name: "fake",
      model: "gte-small",
      dimensions: EMBEDDING_DIMENSIONS,
      configured: true,
      embedDocuments: async (texts: string[]) => texts.map(() => Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0)),
      embedQuery: async () => [],
    }),
  }));
  vi.doMock("@/lib/supabase/server", () => ({
    KNOWLEDGE_BUCKET: "knowledge-documents",
    getSupabaseAdmin: () => ({
      from(table: string) {
        let verb = "select";
        let payload: unknown = null;
        let filteredByHash = false;
        const settle = async () => {
          ops.push({ table, verb, payload });
          if (table === "knowledge_chunks" && verb === "insert") inserted.push(...(payload as unknown[]));
          if (verb === "select" && table === "knowledge_documents") return { data: filteredByHash ? (options.sameContent ?? []) : null, error: null };
          return { data: verb === "update" ? { id: "doc-copy", ...(payload as object) } : null, error: null };
        };
        const builder: Record<string, unknown> = {};
        Object.assign(builder, {
          select: () => builder,
          eq: (column: string) => ((filteredByHash ||= column === "content_hash"), builder),
          neq: () => builder,
          ilike: () => builder,
          order: () => builder,
          limit: () => builder,
          upsert: (values: unknown) => ((verb = "upsert"), (payload = values), builder),
          update: (values: unknown) => ((verb = "update"), (payload = values), builder),
          insert: (values: unknown) => ((verb = "insert"), (payload = values), builder),
          delete: () => ((verb = "delete"), builder),
          single: () => settle(),
          maybeSingle: () => settle(),
          then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => settle().then(resolve, reject),
        });
        return builder;
      },
      storage: { from: () => ({ upload: async (path: string) => ({ data: { path }, error: null }) }) },
    }),
  }));
  vi.doMock("@/lib/knowledge/mappers", () => ({ rowToDocument: (row: unknown) => row }));
  const { ingestDocument } = await import("./pipeline");
  return { ops, inserted, ingestDocument };
}

const woven = (title: string) => ({
  file: new Blob(["%PDF-1.4"], { type: "application/pdf" }),
  fileName: `${title}.pdf`,
  mimeType: "application/pdf",
  title,
  category: "operations" as never,
  scopeId: "bcs-core",
  uploadedByName: "Woven sync",
  source: "woven" as const,
  documentId: "doc-copy",
});

const verdict = (ops: Op[]) =>
  ops.filter((op) => op.table === "knowledge_documents" && op.verb === "update" && typeof (op.payload as { status?: unknown }).status === "string").at(-1)
    ?.payload as Record<string, unknown>;

beforeEach(() => {
  process.env.NEXT_PUBLIC_DEMO_MODE = "false";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_SECRET_KEY = ["sb", "secret", "TESTFIXTURE"].join("_");
});
afterEach(() => {
  process.env = { ...ORIGINAL };
  for (const name of ["./extract", "@/lib/embeddings", "@/lib/supabase/server", "@/lib/knowledge/mappers"]) vi.doUnmock(name);
  vi.resetModules();
});

describe('"Opening Checklist Copy" with the same content as the live "Shift Checklist"', () => {
  const SAME = [{ id: "doc-shift", title: "Shift Checklist" }];

  it("off (production today): indexed a second time (the bug)", async () => {
    process.env[FLAG] = "";
    const { ops, inserted, ingestDocument } = await load({ sameContent: SAME });
    await ingestDocument(woven("Opening Checklist Copy"));
    expect(verdict(ops)).toMatchObject({ status: "indexed" });
    expect(inserted.length).toBeGreaterThan(0);
  });

  it("on: not indexed; fails naming the live document, with no chunk written", async () => {
    process.env[FLAG] = "true";
    const { ops, inserted, ingestDocument } = await load({ sameContent: SAME });
    await expect(ingestDocument(woven("Opening Checklist Copy"))).rejects.toMatchObject({
      code: "duplicate_content",
      message: 'Same file as "Shift Checklist"; not indexed a second time.',
    });
    expect(inserted).toEqual([]);
    expect(verdict(ops)).toMatchObject({ status: "failed", indexed: false });
  });

  it("on: the same content under the SAME title (an edition of itself) is indexed as before", async () => {
    process.env[FLAG] = "true";
    const { ops, ingestDocument } = await load({ sameContent: [{ id: "doc-other", title: "Opening Checklist Copy" }] });
    await ingestDocument(woven("Opening Checklist Copy"));
    expect(verdict(ops)).toMatchObject({ status: "indexed" });
  });

  it("on: an upload is never held", async () => {
    process.env[FLAG] = "true";
    const { ops, ingestDocument } = await load({ sameContent: SAME });
    await ingestDocument({ ...woven("Opening Checklist Copy"), source: "upload" as const, documentId: undefined });
    expect(verdict(ops)).toMatchObject({ status: "indexed" });
  });
});
