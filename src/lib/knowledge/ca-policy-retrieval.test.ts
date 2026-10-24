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

  /**
   * Plain-language regression set. research/reports/full-validation-2026-10-24.md
   * was not in this checkout, so these 17 are the stakeholder validation cues,
   * the Sunny rewrite questions with salon wording adapted to a store, and
   * the two phrases Git named ("store opened late", "policy acknowledgements").
   */
  it.each([
    ["I need a CA for someone opening the store late", "Late Opening"],
    ["CA for late opening is a verbal warning", "Late Opening"],
    ["write a CA for slippers and the wrong uniform", "Dress Code for The Company"],
    ["employee was tardy, showed up late for shift again", "Attendance"],
    ["CA for insubordination, she did not acknowledge policies at onboarding", "Standards of Conduct"],
    ["store opened late", "Late Opening"],
    ["policy acknowledgements", "Standards of Conduct"],
    ["the store opened late today", "Late Opening"],
    ["tardy twice this week", "Attendance"],
    ["She wore slippers on shift today.", "Dress Code for The Company"],
    ["wrong shoes on the sales floor", "Dress Code for The Company"],
    ["she came in wearing the wrong uniform", "Dress Code for The Company"],
    ["she has been tardy three times this month", "Attendance"],
    ["she missed her policy acknowledgements at onboarding", "Standards of Conduct"],
    ["she refused to follow a manager's direction", "Standards of Conduct"],
    ["insubordination during the shift", "Standards of Conduct"],
    ["create verbal ca for pat rivera for opening store late on 10-1-26", "Late Opening"],
  ])("ranks %j to %s", (question, section) => {
    const rows = fixture();
    expect(caPolicyTargetSection(question)).toBe(section);
    const ranked = rerankCaPolicyChunks(rows, question, TOP);
    expect(ranked[0]?.section).toBe(section);
    expect(titles(ranked)).toContain(section);
  });

  it("shows Dress Code and Standards of Conduct ranks before and after the boost", () => {
    const before = fixture();
    const rank = (rows: readonly CaPolicyChunk[], section: string) =>
      rows.findIndex((row) => row.section === section) + 1;

    expect(rank(before, "Standards of Conduct")).toBe(15);
    expect(rank(before, "Dress Code for The Company")).toBe(17);
    expect(rank(before.slice(0, TOP), "Standards of Conduct")).toBe(0);
    expect(rank(before.slice(0, TOP), "Dress Code for The Company")).toBe(0);

    const dress = "write a CA for slippers and the wrong uniform";
    const afterDress = rerankCaPolicyChunks(before, dress, before.length);
    expect(rank(afterDress, "Dress Code for The Company")).toBe(1);
    expect(rank(afterDress, "Standards of Conduct")).toBe(2);
    expect(rerankCaPolicyChunks(before, dress, TOP)[0]?.section).toBe("Dress Code for The Company");

    const conduct = "CA for insubordination, she did not acknowledge policies at onboarding";
    const afterConduct = rerankCaPolicyChunks(before, conduct, before.length);
    expect(rank(afterConduct, "Standards of Conduct")).toBe(1);
    expect(rank(afterConduct, "Dress Code for The Company")).toBe(3);
    expect(titles(rerankCaPolicyChunks(before, conduct, TOP))).toContain("Standards of Conduct");

    const acknowledgements = rerankCaPolicyChunks(before, "policy acknowledgements", before.length);
    expect(rank(acknowledgements, "Standards of Conduct")).toBe(1);

    const late = rerankCaPolicyChunks(before, "store opened late", before.length);
    expect(rank(late, "Late Opening")).toBe(1);
    expect(rank(before, "Late Opening")).toBe(18);
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
