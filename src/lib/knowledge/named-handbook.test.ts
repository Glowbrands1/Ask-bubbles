import { describe, expect, it } from "vitest";

import {
  buildHandbookNote,
  namesHandbook,
  resolveHandbook,
  selectHandbookCoverage,
  type HandbookChunk,
  type NamedHandbookConfig,
} from "./named-handbook";

/** A fictional handbook configuration — no company's real manual. */
const CONFIG: NamedHandbookConfig = {
  identity: { tag: "team-handbook", fallbackFilenames: ["Example-Team-Handbook"], fallbackTitles: ["Example Team Handbook"] },
  namedBy: [/\bhandbook\b/i],
  notATopic: ["example"],
};

const doc = (id: string, title: string, extra: Partial<{ tags: string[]; original_filename: string; source: string }> = {}) => ({
  id,
  title,
  original_filename: extra.original_filename ?? `${title}.pdf`,
  tags: extra.tags ?? [],
  source: extra.source ?? "upload",
});

const chunk = (index: number, content: string, sections: { heading: string; page: number }[] = []): HandbookChunk => ({
  chunkIndex: index,
  chunkId: `c${index}`,
  locator: `p. ${index + 1}`,
  page: index + 1,
  content,
  section: sections[0]?.heading ?? null,
  sections,
});

const CHUNKS = [
  chunk(0, "Table of Contents\nAttendance ....... 3\nBreaks ....... 4\nDress Code ....... 5"),
  chunk(1, "Attendance\nArrive on time for every shift.", [{ heading: "Attendance", page: 3 }]),
  chunk(2, "Text the manager on duty if you will be late."),
  chunk(3, "Breaks\nA ten-minute break every four hours.", [{ heading: "Breaks", page: 4 }]),
];

describe("which document is the handbook", () => {
  it("prefers the tag, then the file name, then the title", () => {
    expect(resolveHandbook([doc("a", "Other"), doc("b", "Anything", { tags: ["team-handbook"] })], CONFIG.identity)).toMatchObject({ ok: true, document: { id: "b" }, matchedBy: "tag" });
    expect(resolveHandbook([doc("a", "Example Team Handbook 2026")], CONFIG.identity)).toMatchObject({ ok: true, matchedBy: "fallback" });
  });
  it("two candidates resolve to nothing rather than to whichever came first", () => {
    expect(resolveHandbook([doc("a", "Example Team Handbook"), doc("b", "Example Team Handbook v2")], CONFIG.identity)).toEqual({ ok: false, problem: "ambiguous" });
  });
});

describe("what the question needs from it", () => {
  it("is off unless configured", () => {
    expect(namesHandbook("what's in the handbook?", null)).toBe(false);
    expect(namesHandbook("what's in the handbook?", CONFIG)).toBe(true);
  });

  it("an overview question pins the table of contents", () => {
    const coverage = selectHandbookCoverage({ question: "What policies are in the handbook?", documentId: "d", documentTitle: "Example Team Handbook", chunks: CHUNKS });
    expect(coverage).toMatchObject({ kind: "contents" });
    expect(coverage!.rows.map((row) => row.chunk_id)).toEqual(["c0"]);
  });

  it("a topic pins the section whose printed heading matches, and its continuation", () => {
    const coverage = selectHandbookCoverage({ question: "What does the handbook say about attendance?", documentId: "d", documentTitle: "Example Team Handbook", chunks: CHUNKS });
    expect(coverage).toMatchObject({ kind: "sections", sections: [{ heading: "Attendance", page: 3 }] });
    expect(coverage!.rows.map((row) => row.chunk_id)).toEqual(["c1", "c2"]);
  });

  it("a topic no heading matches falls back to the contents, flagged", () => {
    const coverage = selectHandbookCoverage({ question: "What does the handbook say about parking?", documentId: "d", documentTitle: "Example Team Handbook", chunks: CHUNKS });
    expect(coverage).toMatchObject({ kind: "contents", unmatchedTopic: true });
  });

  it("the note names only markers the rows landed on, and nothing when none did", () => {
    const coverage = selectHandbookCoverage({ question: "What does the handbook say about breaks?", documentId: "d", documentTitle: "Example Team Handbook", chunks: CHUNKS })!;
    expect(buildHandbookNote(coverage, [])).toBeNull();
    expect(buildHandbookNote(coverage, [2])).toContain("Breaks (page 4). They are sources [S2].");
  });
});
