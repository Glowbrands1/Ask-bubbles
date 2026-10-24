import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Doc 42b4a718 shares a superseded document's content hash. The live indexed
 * copy stays in search. A re-file of that hash whose own row is not indexed
 * stays off. No production query: the admin client is a fake.
 */

const HASH = "hash-shared-25eb4afd";
const LIVE_ID = "42b4a718";
const SUPERSEDED_ID = "25eb4afd";
const FLAG = "EDITION_SUPERSESSION_ENABLED";

type Filter = [string, unknown];

function query(table: string) {
  const filters: Filter[] = [];
  const builder = {
    select() {
      return builder;
    },
    eq(column: string, value: unknown) {
      filters.push([column, value]);
      return builder;
    },
    in() {
      return builder;
    },
    maybeSingle() {
      const id = filters.find(([column]) => column === "id")?.[1];
      if (table === "knowledge_documents" && id === LIVE_ID) {
        return Promise.resolve({ data: { status: "indexed", indexed: true }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    then(resolve: (value: { data: unknown; error: null }) => void, reject?: (reason: unknown) => void) {
      const supersededList =
        table === "knowledge_documents" && filters.some(([column, value]) => column === "status" && value === "superseded");
      const data = supersededList ? [{ id: SUPERSEDED_ID, content_hash: HASH }] : [];
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    },
  };
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => ({
    from(table: string) {
      return query(table);
    },
  }),
}));

const { createSupabaseKnowledgeSink } = await import("./sink");

afterEach(() => {
  delete process.env[FLAG];
});

describe("a live document may share a superseded hash", () => {
  it("keeps the indexed copy and holds a non-live re-file", async () => {
    process.env[FLAG] = "on";
    const sink = createSupabaseKnowledgeSink("woven");
    const keptOff = sink.keptOff;
    expect(keptOff).toBeTypeOf("function");
    expect(await keptOff!({ documentId: LIVE_ID, contentHash: HASH })).toBeNull();
    expect(await keptOff!({ documentId: "refiled-not-indexed", contentHash: HASH })).toBe("content");
  });
});
