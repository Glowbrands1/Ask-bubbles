import { afterEach, describe, expect, it, vi } from "vitest";

import manual151 from "@/test/fixtures/jba-manual-production-151.json";
import { citePolicyAnswer, planFullManualContext, type FullManualDocument } from "@/lib/ai/full-manual-context";
import { remapCitations } from "@/lib/ai/remap-incident";
import { manualChunkFromRow, type ManualChunkRow } from "@/lib/knowledge/full-manual-load";

import { excerptTextForDisplay, withoutBrandLines } from "./excerpt-brand-filter";
import { rowToCitation, type MatchedChunkRow } from "./mappers";

/**
 * QA, Ask Bubbles production, 25 Oct 2026 — cited source excerpts showed the
 * sibling company's wording (EXCERPT_BRAND_FILTER_ENABLED):
 *
 *   B22-4   PTO payout answer (correct, p.42) — the excerpt contains
 *           "Sun Tan City – February 1 and June 1 o Buff…".
 *   T-R1-6  Late Opening source text says "the manager of the salon".
 *
 * B22-4 is the whole-manual reading (a question that names no brand) cut into
 * an excerpt without the brand filter. T-R1-6 names no brand: "salon" is the
 * JBA Policy Manual's own shared wording, kept by every brand reading, and
 * this app has no salon → store mapping for answers or quoted manual text,
 * so the excerpt stays the manual's verbatim text (pinned below).
 */

const FLAG = "EXCERPT_BRAND_FILTER_ENABLED";
const TITLE = "2025 JBA Policy Manual - Edited 5-2025";
const SIBLING = /Sun\s+Tan\s+City|\bSTC\b/i;

// The production excerpt QA saw under the B22-4 answer, as the app built it.
const B22_4_EXCERPT =
  "Qualified salaried Employees must schedule PTO in half day (4 hours), or full day (8 hours) increments only. No PTO is permitted during peak business seasons as listed below: o Sun Tan City – February 1 and June 1 o Buff";
const LATE_OPENING_EXCERPT =
  "When an employee assigned to open a location is unable to open the location at the proper time, the employee must notify the manager as soon as possible. The manager of the salon will be required to open the salon and wo";

const PTO_PAYOUT_QUESTION = "What is the PTO payout policy when someone leaves?";
const PTO_PAYOUT_ANSWER =
  "All State and Federal guidelines will be followed regarding paying out accrued PTO upon termination of employment [p.42].";
const LATE_OPENING_ANSWER =
  "The manager of the location will be required to open and work until the person originally assigned arrives, or a replacement is found [p.12].";

function productionManual(): FullManualDocument {
  return {
    id: manual151.document_ids["ask-bubbles"],
    title: TITLE,
    category: "policies_compliance",
    status: "indexed",
    indexed: true,
    chunks: (manual151.chunks as ManualChunkRow[]).map(manualChunkFromRow),
  };
}

function citedSource(question: string, answer: string) {
  const plan = planFullManualContext({ question, documents: [productionManual()], budget: 10_000_000 });
  const cited = citePolicyAnswer(answer, plan);
  expect(cited.ok).toBe(true);
  expect(cited.sources).toHaveLength(1);
  return { plan, source: cited.sources[0]! };
}

function row(content: string, title = TITLE): MatchedChunkRow {
  return {
    chunk_id: "chunk-91",
    document_id: "doc-jba",
    document_title: title,
    category: "policies_compliance",
    locator: "Page 42 — Usage",
    page: 42,
    section: "Usage",
    content,
    similarity: 0.8,
  } as MatchedChunkRow;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("B22-4: the PTO payout excerpt (p.42) never quotes the sibling company", () => {
  it("on, the excerpt under the cited p.42 source has no sibling-company bullet; page and section are unchanged", () => {
    vi.stubEnv(FLAG, "true");
    const { plan, source } = citedSource(PTO_PAYOUT_QUESTION, PTO_PAYOUT_ANSWER);
    expect(source.excerpt).not.toMatch(SIBLING);
    expect(source.excerpt).not.toContain("February 1 and June 1");
    expect(source.excerpt).toContain("No PTO is permitted during peak business seasons as listed below:");
    expect(source.excerpt).toContain("o Buff City Soap – November 1 and December 31");
    expect(source.locator).toBe("Page 42 — Usage");
    expect(source.printedPage).toBe(42);
    expect(source.documentTitle).toBe(TITLE);
    // The prompt still carries the whole manual: only the excerpt is read for display.
    expect(plan.cachedBlock).toContain("o Sun Tan City – February 1 and June 1");
  });

  it("on, QA's exact excerpt text loses the sibling bullet and keeps the rest verbatim", () => {
    vi.stubEnv(FLAG, "true");
    expect(excerptTextForDisplay(B22_4_EXCERPT, TITLE)).toBe(
      "Qualified salaried Employees must schedule PTO in half day (4 hours), or full day (8 hours) increments only. No PTO is permitted during peak business seasons as listed below: o Buff",
    );
    expect(excerptTextForDisplay("Sun Tan City – February 1 and June 1 o Buff…", TITLE)).toBe("o Buff…");
  });

  it("off, the excerpt is the one production showed", () => {
    vi.stubEnv(FLAG, "");
    const { source } = citedSource(PTO_PAYOUT_QUESTION, PTO_PAYOUT_ANSWER);
    expect(source.excerpt).toBe(B22_4_EXCERPT);
    expect(excerptTextForDisplay(B22_4_EXCERPT, TITLE)).toBe(B22_4_EXCERPT);
  });
});

describe("T-R1-6: the Late Opening excerpt is the manual's own text", () => {
  it("on or off, the excerpt names no brand and is kept verbatim (no salon → store mapping exists for manual text)", () => {
    for (const value of ["true", ""]) {
      vi.stubEnv(FLAG, value);
      const { source } = citedSource("What is the late opening policy?", LATE_OPENING_ANSWER);
      expect(source.locator).toBe("Page 15 — Late Opening");
      expect(source.excerpt).toBe(LATE_OPENING_EXCERPT);
    }
  });
});

describe("the retrieval and remap source cards", () => {
  const CHUNK_91 = (manual151.chunks as ManualChunkRow[]).find((chunk) =>
    chunk.content.includes("o Sun Tan City – February 1 and June 1"),
  )!.content;

  it("on, a retrieved manual chunk's excerpt drops the sibling bullet line and keeps every other line verbatim", () => {
    vi.stubEnv(FLAG, "true");
    const excerpt = rowToCitation(row(CHUNK_91)).excerpt;
    expect(excerpt).not.toMatch(SIBLING);
    expect(excerpt).toBe(CHUNK_91.replace("o Sun Tan City – February 1 and June 1\n", ""));
  });

  it("on, a bullet printed inline after a colon is dropped with the lines it wrapped onto", () => {
    vi.stubEnv(FLAG, "true");
    const text =
      "No PTO is permitted during peak business seasons as listed below: o Sun Tan City – February 1 and\nJune 1 o Buff City Soap – November 1 and December 31\nEmployee discounts:\no Sun Tan City: 50% off all non-\ntanning products.\no Buff City Soap: 30% off all products.";
    expect(withoutBrandLines(text, [String.raw`Sun\s+Tan\s+City`, "STC"])).toBe(
      "No PTO is permitted during peak business seasons as listed below:\nJune 1 o Buff City Soap – November 1 and December 31\nEmployee discounts:\no Buff City Soap: 30% off all products.",
    );
  });

  it("on, a brand label and the block it opens are dropped up to the next label", () => {
    vi.stubEnv(FLAG, "true");
    const text = "Dress Code\nSun Tan City:\nShirts\nBlack tops only.\nBuff City Soap:\nShirts\nCompany t-shirt.";
    expect(excerptTextForDisplay(text, TITLE)).toBe("Dress Code\nBuff City Soap:\nShirts\nCompany t-shirt.");
  });

  it("on, a sentence that names the sibling initials is dropped and the next sentence kept", () => {
    vi.stubEnv(FLAG, "true");
    expect(excerptTextForDisplay("Tanning rules apply at STC locations. Employees must clock in on time.", TITLE)).toBe(
      "Employees must clock in on time.",
    );
  });

  it("on, the remap path's source card drops the sibling bullet", () => {
    vi.stubEnv(FLAG, "true");
    const citations = remapCitations(
      {
        documentId: "doc-jba",
        documentTitle: TITLE,
        chunks: [{ chunkIndex: 91, page: 42, section: "Usage", content: CHUNK_91 }],
      },
      [{ heading: "Usage", page: 42, chunkIndex: 91, foundBy: "page_heading" }],
    );
    expect(citations[0]!.excerpt).not.toMatch(SIBLING);
    expect(citations[0]!.locator).toBe("Page 42");
  });

  it("off, both cards show the chunk exactly as before", () => {
    vi.stubEnv(FLAG, "");
    expect(rowToCitation(row(CHUNK_91)).excerpt).toBe(CHUNK_91);
    const citations = remapCitations(
      { documentId: "doc-jba", documentTitle: TITLE, chunks: [{ chunkIndex: 91, page: 42, section: "Usage", content: CHUNK_91 }] },
      [{ heading: "Usage", page: 42, chunkIndex: 91, foundBy: "page_heading" }],
    );
    expect(citations[0]!.excerpt).toBe(`Usage. ${CHUNK_91}`.slice(0, 500));
  });
});

describe("a normal excerpt is untouched", () => {
  it("on, text that names no sibling brand comes back identical", () => {
    vi.stubEnv(FLAG, "true");
    const text = "Employees must clock in at the start of every shift.\no Buff City Soap – November 1 and December 31\no Crunch – January 1 and February 28";
    expect(excerptTextForDisplay(text, TITLE)).toBe(text);
    expect(rowToCitation(row(text)).excerpt).toBe(text);
  });

  it("on, a document that is not the multi-brand manual is not read", () => {
    vi.stubEnv(FLAG, "true");
    const text = "o Sun Tan City – February 1 and June 1";
    expect(excerptTextForDisplay(text, "Store Opening Checklist")).toBe(text);
  });
});

/*
 * Register rule (Pau): the excerpt text all lowercase, and in sentence case
 * with the brand names typed lowercase or Capitalized. The hidden brand is
 * left out in every one, and this company's own lines are kept.
 */
describe("the sibling brand is left out in any case", () => {
  const lower = (text: string) => text.toLowerCase();
  const sentenceCase = (text: string) =>
    text.toLowerCase().replace(/(^|[.!?]\s+)(?!o\s)(\p{Ll})/gu, (_m, lead: string, first: string) => `${lead}${first.toUpperCase()}`);
  const brandsCapitalized = (text: string) =>
    sentenceCase(text)
      .replace(/sun(\s+)tan(\s+)city/gi, "Sun$1Tan$2City")
      .replace(/\bstc\b/gi, "STC")
      .replace(/buff(\s+)city(\s+)soap/gi, "Buff$1City$2Soap")
      .replace(/\bcrunch\b/gi, "Crunch");
  const REGISTERS = [
    ["all lowercase", lower],
    ["sentence case, brands lowercase", sentenceCase],
    ["sentence case, brands Capitalized", brandsCapitalized],
  ] as const;
  const HIDDEN = [String.raw`Sun\s+Tan\s+City`, "STC"];

  it.each(REGISTERS)("%s: QA's B22-4 excerpt loses the sibling bullet and keeps the rest verbatim", (_label, recase) => {
    vi.stubEnv(FLAG, "true");
    const out = excerptTextForDisplay(recase(B22_4_EXCERPT), TITLE);
    expect(out).not.toMatch(SIBLING);
    expect(out).toBe(
      recase(
        "Qualified salaried Employees must schedule PTO in half day (4 hours), or full day (8 hours) increments only. No PTO is permitted during peak business seasons as listed below: o Buff",
      ),
    );
  });

  it.each(REGISTERS)("%s: a retrieved p.42 chunk drops the sibling bullet line only", (_label, recase) => {
    vi.stubEnv(FLAG, "true");
    const chunk = (manual151.chunks as ManualChunkRow[]).find((entry) =>
      entry.content.includes("o Sun Tan City – February 1 and June 1"),
    )!.content;
    const excerpt = rowToCitation(row(recase(chunk))).excerpt;
    expect(excerpt).not.toMatch(SIBLING);
    expect(excerpt).toBe(recase(chunk).replace(/o sun tan city – february 1 and june 1\n/i, ""));
  });

  it.each(REGISTERS)("%s: an inline bullet and its wrapped line go; this company's bullets stay", (_label, recase) => {
    const text = recase(
      "No PTO is permitted during peak business seasons as listed below: o Sun Tan City – February 1 and\nJune 1 o Buff City Soap – November 1 and December 31\nEmployee discounts:\no Sun Tan City: 50% off all non-\ntanning products.\no Buff City Soap: 30% off all products.",
    );
    const out = withoutBrandLines(text, HIDDEN);
    expect(out).not.toMatch(SIBLING);
    expect(out).not.toMatch(/february 1 and/i);
    expect(out).not.toMatch(/tanning products/i);
    expect(out).toMatch(/^no pto is permitted during peak business seasons as listed below:\n/i);
    expect(out).toMatch(/\no buff city soap – november 1 and december 31\nemployee discounts:\no buff city soap: 30% off all products\.$/i);
  });

  it.each(REGISTERS)("%s: a brand label's block goes up to the next label", (_label, recase) => {
    vi.stubEnv(FLAG, "true");
    const text = "Dress Code\nSun Tan City:\nShirts\nBlack tops only.\nBuff City Soap:\nShirts\nCompany t-shirt.";
    const out = excerptTextForDisplay(recase(text), TITLE);
    expect(out).not.toMatch(SIBLING);
    expect(out).toMatch(/^dress code\nbuff city soap:\nshirts\ncompany t-shirt\.$/i);
  });

  it.each(REGISTERS)("%s: a sentence naming the initials goes and the next sentence stays", (_label, recase) => {
    vi.stubEnv(FLAG, "true");
    expect(excerptTextForDisplay(recase("Tanning rules apply at STC locations. Employees must clock in on time."), TITLE)).toBe(
      recase("Employees must clock in on time."),
    );
  });

  it.each(REGISTERS)("%s: text that names no hidden brand comes back identical", (_label, recase) => {
    vi.stubEnv(FLAG, "true");
    const text = recase(
      "Employees must clock in at the start of every shift.\no Buff City Soap – November 1 and December 31\no Crunch – January 1 and February 28",
    );
    expect(excerptTextForDisplay(text, TITLE)).toBe(text);
  });

  it.each(REGISTERS)("%s: off, the text is returned as it came", (_label, recase) => {
    vi.stubEnv(FLAG, "");
    expect(excerptTextForDisplay(recase(B22_4_EXCERPT), TITLE)).toBe(recase(B22_4_EXCERPT));
  });
});
