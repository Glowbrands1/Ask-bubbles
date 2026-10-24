import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { RETRIEVAL } from "@/lib/config/models";

import {
  caPolicyMatchCount,
  caPolicyTargetSection,
  rerankCaPolicyChunks,
  type CaPolicyChunk,
} from "./ca-policy-retrieval";

/**
 * The insubordination prompt's Standards of Conduct chunk sits outside the
 * top 14 until the JBA boost runs. No embedder and no database.
 */

const INSUBORDINATION = "CA for insubordination, she did not acknowledge policies at onboarding";
const TOP = RETRIEVAL.topK;

function framework(index: number): CaPolicyChunk {
  return {
    document_title: "Ask Bubbles Performance Framework",
    section: `Framework section ${index}`,
  };
}

function manual(section: string): CaPolicyChunk {
  return { document_title: "JBA Policy Manual Edited 5.2025", section };
}

/** Fourteen framework chunks, then the JBA sections the synonym map names. */
function fixture(): CaPolicyChunk[] {
  return [
    ...Array.from({ length: TOP }, (_, index) => framework(index + 1)),
    manual("Standards of Conduct"),
    manual("Attendance"),
    manual("Dress Code for The Company"),
    manual("Late Opening"),
  ];
}

function titles(rows: readonly CaPolicyChunk[]): string[] {
  return rows.map((row) => row.section ?? "");
}

describe("CA policy retrieval", () => {
  it("keeps Standards of Conduct out of the top 14 before the boost", () => {
    expect(TOP).toBe(14);
    const unboosted = fixture().slice(0, TOP);
    expect(titles(unboosted)).not.toContain("Standards of Conduct");
    expect(caPolicyMatchCount(TOP, false)).toBe(TOP);
  });

  it("puts Standards of Conduct in the top 14 for the insubordination prompt", () => {
    expect(caPolicyTargetSection(INSUBORDINATION)).toBe("Standards of Conduct");
    const ranked = rerankCaPolicyChunks(fixture(), INSUBORDINATION, TOP);
    expect(ranked).toHaveLength(TOP);
    expect(titles(ranked)).toContain("Standards of Conduct");
    expect(ranked[0]?.section).toBe("Standards of Conduct");
    expect(titles(ranked).some((section) => section.startsWith("Framework"))).toBe(true);
    expect(caPolicyMatchCount(TOP, true)).toBe(TOP * 3);
  });

  it("maps the other plain-language cues onto their JBA sections", () => {
    const rows = fixture();
    expect(rerankCaPolicyChunks(rows, "write a CA for slippers and the wrong uniform", TOP)[0]?.section).toBe(
      "Dress Code for The Company",
    );
    expect(rerankCaPolicyChunks(rows, "employee was tardy, showed up late for shift again", TOP)[0]?.section).toBe(
      "Attendance",
    );
    expect(rerankCaPolicyChunks(rows, "I need a CA for someone opening the store late", TOP)[0]?.section).toBe(
      "Late Opening",
    );
    expect(rerankCaPolicyChunks(rows, "the store opened late", TOP)[0]?.section).toBe("Late Opening");
  });

  it("does not let a cell-phone CA promote Standards of Conduct over that section", () => {
    const rows = [manual("Cell Phone/Smart Watch Policy"), ...fixture()];
    const ranked = rerankCaPolicyChunks(rows, "CA for using her cell phone on the floor", TOP);
    expect(ranked[0]?.section).toBe("Cell Phone/Smart Watch Policy");
  });

  it("leaves a question with no cue and no corrective-action wording in its original order", () => {
    const ranked = rerankCaPolicyChunks(fixture(), "what time does the store open", TOP);
    expect(titles(ranked)).not.toContain("Standards of Conduct");
    expect(ranked[0]?.section).toBe("Framework section 1");
  });

  it("the retriever calls the boost only through the flag", () => {
    const source = readFileSync(new URL("./providers/supabase.ts", import.meta.url), "utf8");
    expect(source).toContain("caPolicyRetrievalEnabled()");
    expect(source).toContain("rerankCaPolicyChunks");
    expect(source).toContain("caPolicyMatchCount(limit, boost)");
  });
});
