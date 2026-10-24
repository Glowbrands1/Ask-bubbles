import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A superseded document is `status = superseded` and `indexed = false`.
 * Every retrieval function requires both `indexed = true` and
 * `status = 'indexed'`, and the table check refuses indexed=true on any
 * other status. Chunks of a superseded or unindexed document are not
 * candidates. This locks that in so a later migration cannot drop the filter.
 * The test reads the migration files. It does not apply them.
 */
const RETRIEVAL_SQL = [
  "supabase/migrations/20260831000800_embedding_dimensions_384.sql",
  "supabase/migrations/20261023001200_knowledge_section_trgm.sql",
  "supabase/migrations/20261023001000_knowledge_hybrid_search.sql",
];

describe("retrieval excludes superseded and unindexed documents", () => {
  it("every match function requires an indexed document", () => {
    for (const file of RETRIEVAL_SQL) {
      const sql = readFileSync(join(process.cwd(), file), "utf8");
      const bodies = [...sql.matchAll(/create or replace function public\.(match_knowledge_\w+)\s*\([\s\S]*?\$\$;/gi)];
      expect(bodies.length, file).toBeGreaterThan(0);
      for (const body of bodies) {
        expect(body[0], `${file} ${body[1]}`).toMatch(/d\.indexed\s*=\s*true/);
        expect(body[0], `${file} ${body[1]}`).toMatch(/d\.status\s*=\s*'indexed'/);
        expect(body[0], `${file} ${body[1]}`).toMatch(/c\.version\s*=\s*d\.version/);
      }
    }
  });

  it("a document cannot be indexed unless its status is indexed", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260829000200_knowledge_schema.sql"), "utf8");
    expect(sql).toMatch(/indexed = false or \(status = 'indexed'/);
  });

  it("search dedupes identical sections only when the edition flag is on", () => {
    const provider = readFileSync(join(process.cwd(), "src/lib/knowledge/providers/supabase.ts"), "utf8");
    const hybrid = readFileSync(join(process.cwd(), "src/lib/knowledge/hybrid-match.ts"), "utf8");
    expect(provider).toContain("editionSupersessionEnabled() ? dedupeIdenticalSections(ranked) : ranked");
    expect(hybrid).toContain("editionSupersessionEnabled() ? dedupeIdenticalSections(ranked) : ranked");
  });
});
