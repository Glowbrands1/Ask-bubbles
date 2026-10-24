import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { POLICY_MANUAL_BRAND_SCOPE } from "@/config/company/knowledge";
import { citationLocatorFromKeptTextEnabled } from "@/lib/config/chat-quality-flags";
import fixture from "@/test/fixtures/jba-manual-brand-chunks.json";

import { readManualForBrand } from "./brand-sections";
import { locatorsAfterBrandFilter } from "./citation-locator";
import { rowToCitation, type MatchedChunkRow } from "./mappers";

/**
 * Production chunks 48–52 of the 2025 JBA Policy Manual (document
 * 81622d77-ee6c-55f6-904d-dee057907a13, ingested 8 Oct 2026). Stored locators
 * are the ones the 24 Oct citation trace read off knowledge_chunks. The
 * sentences are that file's own lines, from the same day's export.
 *
 * Chunk 49 is stored as "Page 16 — Pants" and holds Crunch pants plus Buff
 * City Soap shirts. Chunk 50 is stored as "Page 17 — Shirts" and holds the
 * last Buff City Soap shirt line, Buff City Soap pants, and Sun Tan City
 * shirts. Shoes on printed page 15 and Important Notes on printed page 40
 * already name the heading that opens them.
 */

const manual = fixture.chunks.map((chunk) => chunk.c).join("\n");

function slice(start: string, end: string): string {
  const from = manual.indexOf(start);
  const to = manual.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`missing slice ${start} .. ${end}`);
  return manual.slice(from, to).trim();
}

interface StoredChunk {
  readonly index: number;
  readonly locator: string;
  readonly section: string;
  readonly content: string;
  readonly sections: readonly { readonly heading: string; readonly page: number }[];
}

const crunchShirts = slice("Crunch Fitness Specific Dress Code:", " Pants\no Yoga pants");
const crunchPants = slice("o Yoga pants, joggers, or sweats are approved for Instructors ONLY", "\n\nBuff City Soap:");
const buffShirts = slice("Buff City Soap:\nShirts", "17 | P a g e");
const buffPants = slice(
  "o No patches, rips, or holes are to be noticeable on the shirt. Pants\no Full length black or blue jean-colored pants",
  " Sun Tan City:",
);
const sunShirts = slice("Sun Tan City:\nShirts", "\nPants\no Full length khaki/black");
const sunPants = slice("Pants\no Full length khaki/black pants", " JB & Associates Office:");
const office = slice("JB & Associates Office:", "o Shorts that sit at or below the knee are acceptable: i.e., Bermuda shorts or Capris.");
const shoes = slice("Shoes\no Tennis shoes", " Hair\n");

const stored: readonly StoredChunk[] = [
  {
    index: 45,
    locator: "Page 15 — Shoes",
    section: "Shoes",
    content: shoes,
    sections: [
      { heading: "Shoes", page: 15 },
      { heading: "Belts", page: 15 },
    ],
  },
  {
    index: 48,
    locator: "Page 16 — Crunch Fitness Specific Dress Code",
    section: "Crunch Fitness Specific Dress Code",
    content: crunchShirts,
    sections: [
      { heading: "Crunch Fitness Specific Dress Code", page: 16 },
      { heading: "Shirts", page: 16 },
    ],
  },
  {
    index: 49,
    locator: "Page 16 — Pants",
    section: "Pants",
    content: `Pants\n${crunchPants}\n\n${buffShirts}`,
    sections: [
      { heading: "Pants", page: 16 },
      { heading: "Buff City Soap", page: 16 },
      { heading: "Shirts", page: 16 },
    ],
  },
  {
    index: 50,
    locator: "Page 17 — Shirts",
    section: "Shirts",
    content: `${buffPants}\n${sunShirts}`,
    sections: [
      { heading: "Pants", page: 17 },
      { heading: "Sun Tan City", page: 17 },
      { heading: "Shirts", page: 17 },
    ],
  },
  {
    index: 51,
    locator: "Page 17 — Pants",
    section: "Pants",
    content: sunPants,
    sections: [
      { heading: "Pants", page: 17 },
      { heading: "Tanning", page: 17 },
    ],
  },
  {
    index: 52,
    locator: "Page 17 — Shirts",
    section: "Shirts",
    content: office,
    sections: [
      { heading: "JB & Associates Office", page: 17 },
      { heading: "Shirts", page: 17 },
      { heading: "Pants", page: 17 },
    ],
  },
  {
    index: 133,
    locator: "Page 40 — Important Notes",
    section: "Important Notes",
    content:
      "Important Notes\nExempt employees are directed to the Paid Time Off (PTO) section for the accrual rules, and the citation keeps this sentence whole.",
    sections: [{ heading: "Important Notes", page: 40 }],
  },
];

function keptChunks(): { chunk: StoredChunk; kept: string }[] {
  const kept = readManualForBrand(
    stored.map((chunk) => ({
      content: chunk.content,
      headings: chunk.sections.map((section) => section.heading),
    })),
    POLICY_MANUAL_BRAND_SCOPE,
  );
  return stored.map((chunk, index) => ({ chunk, kept: kept[index] ?? "" }));
}

function labelled(enabled: boolean): Map<number, { locator: string; kept: string; content: string }> {
  const rows = keptChunks();
  const locators = locatorsAfterBrandFilter(
    enabled,
    rows.map(({ chunk, kept }) => ({
      locator: chunk.locator,
      section: chunk.section,
      kept,
      sections: chunk.sections,
    })),
    POLICY_MANUAL_BRAND_SCOPE,
  );
  return new Map(
    rows.map(({ chunk, kept }, index) => [
      chunk.index,
      { locator: locators[index] ?? chunk.locator, kept, content: chunk.content },
    ]),
  );
}

describe("citation locator from the text the brand filter kept", () => {
  it("uses the manual's own dress-code sentences", () => {
    const flat = manual.replace(/\s+/g, " ");
    for (const chunk of stored) {
      if (chunk.index === 133) continue;
      for (const line of chunk.content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed) expect(flat).toContain(trimmed.replace(/\s+/g, " "));
      }
    }
  });

  it("leaves the stored locator in place when the flag is off", () => {
    const off = labelled(false);
    for (const chunk of stored) {
      expect(off.get(chunk.index)?.locator).toBe(chunk.locator);
      expect(off.get(chunk.index)?.content).toBe(chunk.content);
    }
    expect(off.get(49)?.locator).toBe("Page 16 — Pants");
    expect(off.get(50)?.locator).toBe("Page 17 — Shirts");
  });

  it("labels chunk 49 from the Buff City Soap shirts that remain, and chunk 50 from the pants", () => {
    const on = labelled(true);
    const shirts = on.get(49)!;
    const pants = on.get(50)!;

    expect(shirts.kept).toContain("Buff City Soap:");
    expect(shirts.kept).toContain("Any BCS Employee can wear any plain black, white, or gray t-shirt");
    expect(shirts.kept).not.toContain("Instructors ONLY");
    expect(shirts.kept).not.toContain("Front Desk and Management");
    expect(shirts.locator).toBe("Page 16 — Buff City Soap: Shirts");

    expect(pants.kept.startsWith("o No patches, rips, or holes are to be noticeable on the shirt.")).toBe(true);
    expect(pants.kept).toContain("Full length black or blue jean-colored pants are acceptable.");
    expect(pants.kept).not.toContain("Any STC Employee");
    expect(pants.locator).toBe("Page 17 — Buff City Soap: Pants");

    const card = rowToCitation({
      chunk_id: "49",
      document_id: "81622d77-ee6c-55f6-904d-dee057907a13",
      document_title: "2025 JBA Policy Manual - Edited 5-2025",
      category: "policies_compliance",
      locator: shirts.locator,
      page: 17,
      section: "Pants",
      content: shirts.kept,
      similarity: 0.8,
    } satisfies MatchedChunkRow);
    expect(card.locator).toBe("Page 16 — Buff City Soap: Shirts");
    expect(card.excerpt).toBe(shirts.kept);
  });

  it("keeps Buff City Soap shirts and the office shirts as two citations", () => {
    const on = labelled(true);
    const kept = [...on.values()].filter((row) => row.kept.trim() !== "");
    const shirtRules = kept.filter((row) => row.kept.includes("\nShirts\n") || row.kept.startsWith("Shirts\n"));
    expect(shirtRules.map((row) => row.locator)).toEqual([
      "Page 16 — Buff City Soap: Shirts",
      "Page 17 — JB & Associates Office: Shirts",
    ]);
    expect(on.get(52)?.kept).toContain("Any JBA franchise Branded top");
    expect(on.get(48)?.kept).toBe("");
    expect(on.get(51)?.kept).toBe("");
  });

  it("leaves Shoes on printed page 15 and Important Notes on printed page 40", () => {
    const on = labelled(true);
    const shoesChunk = on.get(45)!;
    const notes = on.get(133)!;
    expect(shoesChunk.locator).toBe("Page 15 — Shoes");
    expect(shoesChunk.kept).toContain("Tennis shoes or other full coverage closed toe shoes are to be worn.");
    expect(shoesChunk.kept).toContain("Belts");
    expect(notes.locator).toBe("Page 40 — Important Notes");
    expect(notes.kept).toBe(notes.content);
    expect(notes.kept.endsWith("whole.")).toBe(true);
  });

  it("defaults the flag off, and the retriever applies it only after the brand filter", () => {
    const previous = process.env.CITATION_LOCATOR_FROM_KEPT_TEXT;
    delete process.env.CITATION_LOCATOR_FROM_KEPT_TEXT;
    expect(citationLocatorFromKeptTextEnabled()).toBe(false);
    if (previous === undefined) delete process.env.CITATION_LOCATOR_FROM_KEPT_TEXT;
    else process.env.CITATION_LOCATOR_FROM_KEPT_TEXT = previous;

    const provider = readFileSync("src/lib/knowledge/providers/supabase.ts", "utf8");
    const filter = provider.slice(provider.indexOf("function readChunksForBrand"));
    expect(filter).toContain("readManualForBrand(");
    expect(filter).toContain("citationLocatorFromKeptTextEnabled()");
    expect(filter).toContain("locatorsAfterBrandFilter(");
    expect(provider).toContain("locator: text.locator");
  });
});
