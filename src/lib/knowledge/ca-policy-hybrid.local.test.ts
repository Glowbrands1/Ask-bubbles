import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { RETRIEVAL } from "@/lib/config/models";

import { caPolicyMatchCount, rerankCaPolicyChunks } from "./ca-policy-retrieval";
import { selectHybridMatches, type HybridCandidate } from "./hybrid-rank";

/**
 * Local harness only. Candidates are built in memory. This file does not
 * import the hybrid matcher, so it never opens a database connection or
 * asks for an embedding.
 *
 * research/reports/full-validation-2026-10-24.md was not in this checkout.
 * The two prompts below are the Dress Code and Standards of Conduct cases
 * from the plain-language set, scored on the same 18-row fixture.
 */

const TOP = RETRIEVAL.topK;
const DRESS = "write a CA for slippers and the wrong uniform";
const CONDUCT = "CA for insubordination, she did not acknowledge policies at onboarding";

function candidate(index: number, title: string, section: string): HybridCandidate {
  return {
    row: {
      chunk_id: `chunk-${index + 1}`,
      document_id: "manual-fixture",
      document_title: title,
      category: "policies_compliance",
      locator: `s-${index + 1}`,
      page: null,
      section,
      content: section,
      similarity: 0.9 - index * 0.001,
    },
    vectorRank: index + 1,
    keywordRank: null,
    sectionExact: false,
  };
}

/** Fourteen framework chunks, then the JBA sections the synonym map names. */
function fixture(): HybridCandidate[] {
  const framework = Array.from({ length: TOP }, (_, index) =>
    candidate(index, "Ask Bubbles Performance Framework", `Framework section ${index + 1}`),
  );
  const manual = ["Standards of Conduct", "Attendance", "Dress Code for The Company", "Late Opening"].map(
    (section, offset) => candidate(TOP + offset, "JBA Policy Manual Edited 5.2025", section),
  );
  return [...framework, ...manual];
}

function rank(rows: readonly { section: string | null }[], section: string): number {
  return rows.findIndex((row) => row.section === section) + 1;
}

describe("CA policy hybrid rerank, local harness", () => {
  it("keeps Dress Code and Standards of Conduct outside a top-14 hybrid slice", () => {
    const rows = fixture();
    for (const question of [DRESS, CONDUCT, "policy acknowledgements"]) {
      const sliced = selectHybridMatches(rows, question, {
        vectorFloor: RETRIEVAL.minSimilarity,
        limit: TOP,
      });
      expect(sliced).toHaveLength(TOP);
      expect(rank(sliced, "Standards of Conduct")).toBe(0);
      expect(rank(sliced, "Dress Code for The Company")).toBe(0);
    }
  });

  it("records Dress Code and Standards of Conduct ranks before and after the boost", () => {
    const rows = fixture();
    const widened = caPolicyMatchCount(TOP, true);
    expect(widened).toBe(TOP * 3);

    const beforeDress = selectHybridMatches(rows, DRESS, {
      vectorFloor: RETRIEVAL.minSimilarity,
      limit: widened,
    });
    expect(rank(beforeDress, "Standards of Conduct")).toBe(15);
    expect(rank(beforeDress, "Dress Code for The Company")).toBe(17);
    const afterDress = rerankCaPolicyChunks(beforeDress, DRESS, rows.length);
    expect(rank(afterDress, "Dress Code for The Company")).toBe(1);
    expect(rank(afterDress, "Standards of Conduct")).toBe(2);
    expect(rerankCaPolicyChunks(beforeDress, DRESS, TOP)[0]?.section).toBe("Dress Code for The Company");

    const beforeConduct = selectHybridMatches(rows, CONDUCT, {
      vectorFloor: RETRIEVAL.minSimilarity,
      limit: widened,
    });
    expect(rank(beforeConduct, "Standards of Conduct")).toBe(15);
    expect(rank(beforeConduct, "Dress Code for The Company")).toBe(17);
    const afterConduct = rerankCaPolicyChunks(beforeConduct, CONDUCT, rows.length);
    expect(rank(afterConduct, "Standards of Conduct")).toBe(1);
    expect(rank(afterConduct, "Dress Code for The Company")).toBe(3);
    expect(rerankCaPolicyChunks(beforeConduct, CONDUCT, TOP)[0]?.section).toBe("Standards of Conduct");

    const acknowledgements = selectHybridMatches(rows, "policy acknowledgements", {
      vectorFloor: RETRIEVAL.minSimilarity,
      limit: widened,
    });
    expect(rerankCaPolicyChunks(acknowledgements, "policy acknowledgements", TOP)[0]?.section).toBe(
      "Standards of Conduct",
    );

    const latePool = selectHybridMatches(rows, "store opened late", {
      vectorFloor: RETRIEVAL.minSimilarity,
      limit: widened,
    });
    expect(rerankCaPolicyChunks(latePool, "store opened late", TOP)[0]?.section).toBe("Late Opening");
  });

  it("the hybrid matcher widens and reranks only through the flag", () => {
    const source = readFileSync(new URL("./hybrid-match.ts", import.meta.url), "utf8");
    expect(source).toContain("caPolicyRetrievalEnabled()");
    expect(source).toContain("caPolicyMatchCount(limit, boost)");
    expect(source).toContain("rerankCaPolicyChunks(pool, trimmed, limit)");
  });
});
