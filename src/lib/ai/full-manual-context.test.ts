import { afterEach, describe, expect, it, vi } from "vitest";

import fixture from "@/test/fixtures/jba-manual-brand-chunks.json";
import storedChunks from "@/test/fixtures/jba-manual-chunks-44-62.json";
import productionRows from "@/test/fixtures/jba-manual-chunks-50-53-62.json";
import { CHAT_QUALITY_FLAG_NAMES, fullManualContextEnabled } from "@/lib/config/chat-quality-flags";

import { claudeSystemPayload } from "./call-claude";
import {
  FULL_MANUAL_TOKEN_BUDGET,
  alignSourceMarkers,
  brandChoice,
  brandsCovered,
  citePolicyAnswer,
  isPolicyQuestion,
  planFullManualContext,
  validateManualCitations,
  type FullManualDocument,
} from "./full-manual-context";
import { noteModelCall } from "./model-failure";

const BCS_SHIRTS = "Any BCS Employee can wear any plain black, white, or gray t-shirt";
const CRUNCH_PANTS = "Yoga pants, joggers, or sweats are approved for Instructors ONLY";
const STC_SHIRTS = "Any STC Employee can wear any Branded top or black collared or black t-shirt";

/**
 * Printed pages the manual records for a fixture chunk.
 *
 * `chunk.p` is the printed page. Crunch Fitness Specific Dress Code, its
 * Shirts and Pants, and Buff City Soap Shirts all start on printed page 16.
 * Company dress code and Hair stay on 15. The next sheet's footer is 17.
 */
function sectionsFor(chunk: { p: string; h: string[]; c: string }): { heading: string; page: number }[] {
  const printed = Number(chunk.p);
  const sections = chunk.h.map((heading) => ({ heading, page: printed }));
  if (chunk.c.includes("All Locations Dress Code:")) {
    sections.push({ heading: "All Locations Dress Code", page: printed });
  }
  if (chunk.c.includes("approved for Instructors ONLY")) {
    sections.push(
      { heading: "Crunch Fitness Specific Dress Code", page: printed },
      { heading: "Shirts", page: printed },
      { heading: "Pants", page: printed },
    );
  }
  if (chunk.c.includes("Any BCS Employee can wear any plain black")) {
    sections.push({ heading: "Buff City Soap", page: printed }, { heading: "Shirts", page: printed });
  }
  return sections;
}

function manual(overrides: Partial<FullManualDocument> = {}): FullManualDocument {
  return {
    id: "81622d77-ee6c-55f6-904d-dee057907a13",
    title: "2025 JBA Policy Manual - Edited 5-2025",
    category: "policies_compliance",
    status: "indexed",
    indexed: true,
    chunks: fixture.chunks.map((chunk) => ({
      chunkIndex: chunk.i,
      content: chunk.c,
      locator: `Page ${chunk.p} — ${chunk.h[0] ?? "Pants"}`,
      page: Number(chunk.p) + 1,
      printedPage: Number(chunk.p),
      section: chunk.h[0] ?? null,
      headings: chunk.h,
      sections: sectionsFor(chunk),
    })),
    ...overrides,
  };
}

const retired: FullManualDocument = {
  id: "retired-manual",
  title: "2024 JBA Policy Manual",
  status: "retired",
  indexed: false,
  chunks: [
    {
      chunkIndex: 1,
      content: "RETIRED EDITION ONLY sentence about purple hats.",
      printedPage: 4,
      headings: ["Purple Hats"],
    },
  ],
};

const superseded: FullManualDocument = {
  id: "old-manual",
  title: "2023 JBA Policy Manual",
  status: "superseded",
  indexed: false,
  chunks: [
    {
      chunkIndex: 1,
      content: "SUPERSEDED EDITION ONLY sentence about capes.",
      printedPage: 3,
      headings: ["Capes"],
    },
  ],
};

const framework: FullManualDocument = {
  id: "framework",
  title: "Employee Performance Framework",
  status: "indexed",
  indexed: true,
  chunks: [
    {
      chunkIndex: 1,
      content: "FRAMEWORK ONLY escalation ladder.",
      printedPage: 2,
      headings: ["Escalation"],
    },
  ],
};

const documents = [retired, framework, superseded, manual()];

describe("FULL_MANUAL_CONTEXT_ENABLED", () => {
  afterEach(() => {
    delete process.env.FULL_MANUAL_CONTEXT_ENABLED;
    delete process.env.PROMPT_CACHE_ENABLED;
  });

  it("defaults off and is one of the chat-quality flags", () => {
    delete process.env.FULL_MANUAL_CONTEXT_ENABLED;
    expect(fullManualContextEnabled()).toBe(false);
    expect(CHAT_QUALITY_FLAG_NAMES).toContain("FULL_MANUAL_CONTEXT_ENABLED");
    process.env.FULL_MANUAL_CONTEXT_ENABLED = "1";
    expect(fullManualContextEnabled()).toBe(true);
    delete process.env.FULL_MANUAL_CONTEXT_ENABLED;
  });

  it("treats the dress-code and PTO wordings as policy, and a form request as not", () => {
    expect(isPolicyQuestion("what's the dress code?")).toBe(true);
    expect(isPolicyQuestion("how much PTO do I get?")).toBe(true);
    expect(isPolicyQuestion("Paid time off accrues after 90 days")).toBe(true);
    expect(isPolicyQuestion("what's the cell phone policy?")).toBe(true);
    expect(isPolicyQuestion("can staff use cell phones on the floor?")).toBe(true);
    expect(isPolicyQuestion("create a coaching form for Dana Moss")).toBe(false);
  });

  it("keeps every brand on an unbranded dress-code question", () => {
    expect(brandChoice("what's the dress code?")).toBe("all");
    const plan = planFullManualContext({
      question: "what's the dress code?",
      documents,
    });
    expect(plan.ready).toBe(true);
    expect(plan.reason).toBe("ready");
    expect(plan.tokens).toBeLessThanOrEqual(FULL_MANUAL_TOKEN_BUDGET);
    expect(FULL_MANUAL_TOKEN_BUDGET).toBe(120_000);
    const text = plan.cachedBlock ?? "";
    expect(text).toContain("[p.16]");
    expect(text).toContain("[p.15]");
    expect(text).toContain(BCS_SHIRTS);
    expect(text).toContain(CRUNCH_PANTS);
    expect(text).toContain("Buff City Soap:");
    expect(text).toContain("Crunch Fitness Specific Dress Code:");
    expect(brandsCovered(text)).toEqual(["Buff City Soap", "Crunch", "Sun Tan City"]);
    expect(text).not.toContain("RETIRED EDITION ONLY");
    expect(text).not.toContain("SUPERSEDED EDITION ONLY");
    expect(text).not.toContain("FRAMEWORK ONLY");
    expect(plan.cachedBlock).toContain("Cover Buff City Soap and Crunch");
    expect(plan.sources).toEqual([]);
    expect(text).not.toContain("[S1]");
  });

  it("uses the Crunch manual when the question names Crunch, and still keeps company-wide rules", () => {
    const plan = planFullManualContext({
      question: "what's the Crunch dress code?",
      documents,
    });
    expect(plan.choice).toBe("crunch");
    expect(plan.ready).toBe(true);
    const text = plan.cachedBlock ?? "";
    expect(text).toContain(CRUNCH_PANTS);
    expect(text).toContain("All Locations Dress Code:");
    expect(text).not.toContain(BCS_SHIRTS);
  });

  it("keeps Sun Tan City when that brand is named, including its shirt rule", () => {
    const plan = planFullManualContext({
      question: "what's the STC dress code?",
      documents,
    });
    expect(plan.choice).toBe("stc");
    const text = plan.cachedBlock ?? "";
    expect(text).toContain(STC_SHIRTS);
    expect(text).not.toContain(BCS_SHIRTS);
  });

  it("falls back when the manual is over the token budget and does not return the block", () => {
    const plan = planFullManualContext({
      question: "what's the dress code?",
      documents,
      budget: 30,
    });
    expect(plan.ready).toBe(false);
    expect(plan.reason).toBe("over_budget");
    expect(plan.cachedBlock).toBeNull();
    expect(plan.tokens).toBeGreaterThan(30);
    expect(plan.index?.pages.has(16)).toBe(true);
  });

  it("does not build a block for a question that is not about policy", () => {
    const plan = planFullManualContext({
      question: "create a coaching form for Dana Moss",
      documents,
    });
    expect(plan.reason).toBe("not_policy");
    expect(plan.cachedBlock).toBeNull();
  });

  it("reads a follow-up as policy when the earlier turn was the dress code", () => {
    const plan = planFullManualContext({
      question: "what about pants?",
      policyText: "what about pants?\nwhat's the dress code?",
      documents,
    });
    expect(plan.ready).toBe(true);
    expect(plan.choice).toBe("all");
    expect(plan.cachedBlock).toContain(BCS_SHIRTS);
    expect(plan.cachedBlock).toContain(CRUNCH_PANTS);
  });
});

describe("citation check after the answer", () => {
  const plan = planFullManualContext({
    question: "what's the dress code?",
    documents,
  });

  it("drops [S11] when eight sources are shown, the PTO wording", () => {
    const shown = [1, 2, 3, 4, 5, 6, 7, 8];
    const text = validateManualCitations("Paid time off accrues after 90 days [S11].", {
      shownMarkers: shown,
      index: plan.index,
    });
    expect(text).not.toContain("[S11]");
    expect(text).toContain("Paid time off accrues after 90 days");
  });

  it("drops [S10] and [S8] when seven sources are shown, the dress-code wording", () => {
    const text = validateManualCitations("Wear a black shirt [S10] and full length pants [S8].", {
      shownMarkers: [1, 2, 3, 4, 5, 6, 7],
      index: plan.index,
    });
    expect(text).not.toContain("[S10]");
    expect(text).not.toContain("[S8]");
    expect(text).toContain("Wear a black shirt and full length pants.");
  });

  it("renumbers a marker to the source card it belongs to and drops one that is not shown", () => {
    const text = alignSourceMarkers("See the manual [S11] and the note [S2].", [2, 11]);
    expect(text).toBe("See the manual [S2] and the note [S1].");
  });

  it("drops a grouped marker that is outside the sources shown", () => {
    const text = alignSourceMarkers("Black shirt [S10, S8].", [1, 2, 3, 4, 5, 6, 7]);
    expect(text).not.toContain("[S");
    expect(text).toContain("Black shirt.");
  });

  it("keeps a heading on its printed page and drops a heading that is not on that page", () => {
    const text = validateManualCitations(
      "Buff City Soap shirts are plain black (Page 16 — Shirts). Crunch pants are not Page 15 — Pants.",
      { shownMarkers: [1], index: plan.index },
    );
    expect(text).toContain("Page 16 — Shirts");
    expect(text).not.toContain("Page 15 — Pants");
    expect(text).not.toContain("[S");
  });

  it("moves a heading to the one page where it is printed, and drops an unknown page", () => {
    const notes = planFullManualContext({
      question: "how much PTO do I get?",
      documents: [
        {
          id: "notes",
          title: "2025 JBA Policy Manual - Edited 5-2025",
          status: "indexed",
          indexed: true,
          chunks: [
            {
              chunkIndex: 1,
              content: "Important Notes\nUnused PTO is carried over from one calendar year to the next.",
              printedPage: 40,
              headings: ["Important Notes"],
            },
          ],
        },
      ],
    });
    const text = validateManualCitations(
      "See Page 16 — Important Notes and also page 99 and [p.99] and [p.40].",
      { shownMarkers: [1], index: notes.index },
    );
    expect(text).toContain("Page 40 — Important Notes");
    expect(text).not.toContain("Page 16");
    expect(text).not.toContain("page 99");
    expect(text).not.toContain("[p.99]");
    expect(text).toContain("[p.40]");
  });
});

describe("cached system block", () => {
  afterEach(() => {
    delete process.env.PROMPT_CACHE_ENABLED;
    delete process.env.FULL_MANUAL_CONTEXT_ENABLED;
    vi.restoreAllMocks();
  });

  it("puts the manual on a cache breakpoint after the instructions", () => {
    const system = "Instructions stay cached.\n\n---DYNAMIC---\nListener line";
    delete process.env.PROMPT_CACHE_ENABLED;
    const manual = "FULL POLICY MANUAL\n\n[p.16]\nShirts";
    const uncached = claudeSystemPayload(system, manual);
    expect(Array.isArray(uncached)).toBe(true);
    const blocks = uncached as { text: string; cache_control?: { type: string } }[];
    expect(blocks[1]?.text).toContain("[p.16]");
    expect(blocks[1]?.cache_control).toEqual({ type: "ephemeral" });

    process.env.PROMPT_CACHE_ENABLED = "1";
    const cached = claudeSystemPayload(system, manual) as { text: string; cache_control?: { type: string } }[];
    expect(cached[0]?.cache_control).toEqual({ type: "ephemeral" });
    expect(cached[1]?.text).toContain("FULL POLICY MANUAL");
    expect(cached[1]?.cache_control).toEqual({ type: "ephemeral" });
    expect(cached[2]?.text).toContain("Listener line");
    expect(cached[2]?.cache_control).toBeUndefined();
  });

  it("logs cache creation and cache read tokens when the flag is on", () => {
    delete process.env.FULL_MANUAL_CONTEXT_ENABLED;
    const quiet = vi.spyOn(console, "info").mockImplementation(() => {});
    noteModelCall({
      model: "claude-test",
      maxTokens: 10,
      stopReason: "end_turn",
      latencyMs: 1,
      usage: { cache_creation_input_tokens: 12, cache_read_input_tokens: 34 },
    });
    expect(quiet).not.toHaveBeenCalled();

    process.env.FULL_MANUAL_CONTEXT_ENABLED = "1";
    noteModelCall({
      model: "claude-test",
      maxTokens: 10,
      stopReason: "end_turn",
      latencyMs: 1,
      usage: { cache_creation_input_tokens: 12, cache_read_input_tokens: 34 },
    });
    const line = quiet.mock.calls.map((call) => String(call[0])).join("\n");
    expect(line).toContain("full_manual_context_cache");
    expect(line).toContain("cache_creation_input_tokens");
    expect(line).toContain("cache_read_input_tokens");
    expect(line).toContain("34");
  });
});

/**
 * Production chats from 24 Oct 2026.
 *
 * conv_mvmkij8h2vdogs9 opened at 15:42:55Z (dress code, both brands).
 * conv_mvmkj5v72w5x3l5 opened at 15:43:24Z (cell phone). Both turns loaded
 * the full manual. The message rows are not readable with the key this
 * session can use, so the questions are the ones those chats asked.
 */
const DRESS_CODE_QUESTION = "what's the dress code for Buff City Soap and Crunch?";
const CELL_PHONE_QUESTION = "what's the cell phone policy?";

const DRESS_CODE_ANSWER = [
  "Anyone violating their brand's dress code policy will be sent home to change into proper work attire.",
  "Hair of all lengths and colors is acceptable when it is clean, groomed, and kept out of the employee's face and eyes.",
  "Jewelry that does not interfere with work is acceptable.",
  "Large, inappropriate, or offensive tattoos must be covered.",
  "Buff City Soap employees can wear any plain black, white, or gray t-shirt.",
  "The Crunch Fitness specific dress code applies at Crunch.",
  "Crunch provides two uniform shirts, and yoga pants, joggers, or sweats are approved for instructors only.",
].join(" ");

const CELL_PHONE_ANSWER =
  "Personal Employee cell phones are permitted in the workplace but must be kept out of sight. Texting or phone calls during the shift is not allowed under the Cell Phone/Smart Watch Policy.";

function contentsChunk(printed: number) {
  const body =
    printed === 3
      ? "Table of Contents\nDress Code ................ 16\nCell Phone ................ 19\nJewelry ................ 16"
      : "Attendance .......... 14\nLate Opening .......... 15";
  return {
    chunkIndex: printed,
    content: `${printed} | P a g e\n${body}\nCONTENTS ROW ONLY page ${printed}`,
    page: printed + 1,
    printedPage: printed + 1,
    locator: `Page ${printed + 1} — Table of Contents`,
    headings: ["Table of Contents"],
    section: "Table of Contents",
  };
}

function productionManual(): FullManualDocument {
  const base = manual();
  return manual({
    chunks: [
      {
        chunkIndex: 0,
        content: "1 | P a g e\n2025 JB & Associates Employment Policy Manual. This page is the cover.",
        page: 2,
        printedPage: 2,
        locator: "Page 2",
        headings: [],
      },
      contentsChunk(3),
      contentsChunk(4),
      contentsChunk(5),
      contentsChunk(6),
      ...base.chunks,
      {
        chunkIndex: 61,
        content:
          "19 | P a g e\nCell Phone/Smart Watch Policy\nPersonal Employee cell phones are permitted in the workplace but must be kept out of sight. It is the Employee's personal responsibility to protect the customer's experience and doing things such as texting, making phone calls or using social media jeopardizes the customer's experience.",
        page: 20,
        printedPage: 20,
        locator: "Page 20 — Cell Phone/Smart Watch Policy",
        headings: ["Cell Phone/Smart Watch Policy"],
        section: "Cell Phone/Smart Watch Policy",
      },
    ],
  });
}

function citedPages(text: string): number[] {
  return [...text.matchAll(/\[p\.(\d{1,3})\]/gi)].map((match) => Number(match[1]));
}

describe("production chats cite printed pages", () => {
  const documents = [productionManual()];

  it("marks the footer page, not the PDF page, and skips contents pages 3-6", () => {
    const plan = planFullManualContext({ question: DRESS_CODE_QUESTION, documents });
    expect(plan.ready).toBe(true);
    expect(brandChoice(DRESS_CODE_QUESTION)).toBe("all");
    const text = plan.cachedBlock ?? "";
    const slice = (start: string, end: string) => {
      const from = text.indexOf(start);
      const to = text.indexOf(end, from + start.length);
      return text.slice(from, to);
    };
    const company = slice("[p.15]", "[p.16]");
    const page16 = slice("[p.16]", "[p.17]");
    expect(company).toContain("All Locations Dress Code:");
    expect(company).toContain("Hair");
    expect(company).not.toContain("Jewelry/Accessories");
    expect(page16).toContain("Jewelry/Accessories");
    expect(page16).toContain("Crunch Fitness Specific Dress Code:");
    expect(page16).toContain("Two uniform shirts");
    expect(page16).toContain("approved for Instructors ONLY");
    expect(page16).toContain("Buff City Soap:");
    expect(page16).toContain(BCS_SHIRTS);
    expect(page16).not.toContain("never to be worn");
    expect(text).toContain("[p.19]");
    expect(text).not.toContain("[p.20]");
    expect(text).not.toContain("[p.3]");
    expect(text).not.toContain("[p.4]");
    expect(text).not.toContain("[p.5]");
    expect(text).not.toContain("[p.6]");
    expect(text).not.toContain("CONTENTS ROW ONLY");
    expect(text).not.toContain("Table of Contents");
    expect(plan.index?.pages.has(15)).toBe(true);
    expect(plan.index?.pages.has(16)).toBe(true);
    expect(plan.index?.pages.has(17)).toBe(true);
    expect(plan.index?.pages.has(19)).toBe(true);
    expect(plan.index?.pages.has(3)).toBe(false);
    expect(plan.index?.pages.has(6)).toBe(false);
    expect(plan.index?.pages.has(20)).toBe(false);
  });

  it("does not cite the PDF sheet when the footer repeats it and the headings record page 15", () => {
    const plan = planFullManualContext({
      question: DRESS_CODE_QUESTION,
      documents: [
        manual({
          chunks: [
            {
              chunkIndex: 44,
              page: 16,
              printedPage: 16,
              locator: "Page 16 — Dress Code for The Company",
              content:
                "16 | P a g e\nDress Code for The Company\nThe Company Employees are to keep a neat, clean, professional appearance. Anyone violating their Brand’s Dress code policy will be sent home.\nHair\no Hair of all lengths and colors are acceptable as long as it is clean, groomed, and kept out of the employee’s face and eyes.",
              headings: ["Dress Code for The Company", "Hair"],
              sections: [
                { heading: "Dress Code for The Company", page: 15 },
                { heading: "Hair", page: 15 },
              ],
            },
          ],
        }),
      ],
    });
    const text = plan.cachedBlock ?? "";
    expect(text).toContain("[p.15]");
    expect(text).not.toContain("[p.16]");
    expect(text).not.toContain("[p.17]");
    expect(text.indexOf("[p.15]")).toBeLessThan(text.indexOf("Hair"));
  });

  it("conv_mvmkij8h2vdogs9 cites p.15 and p.16, and p.17 only for other brands", () => {
    const plan = planFullManualContext({ question: DRESS_CODE_QUESTION, documents });
    /*
     * Sun Tan City's dress code and the other brands' pants are printed on
     * page 17. Citing that page is allowed. Crunch shirts and pants are not.
     */
    const withOtherBrands = [
      DRESS_CODE_ANSWER,
      "Any STC Employee can wear any Branded top or black collared or black t-shirt.",
      "Yoga pants, joggers or sweats are never to be worn while at work.",
    ].join(" ");
    const cited = citePolicyAnswer(withOtherBrands, plan);
    expect(cited.ok).toBe(true);
    expect(cited.text).toMatch(/buff city soap/i);
    expect(cited.text).toMatch(/crunch/i);
    expect(cited.text).toMatch(/tattoo/i);
    expect(cited.text).toMatch(/jewelry/i);
    expect(cited.text).toMatch(/hair/i);
    expect(cited.text).toContain("approved for instructors only");
    expect(cited.text).toContain("plain black, white, or gray t-shirt");
    const pages = new Set(cited.sources.map((source) => source.printedPage));
    const marked = new Set(citedPages(cited.text));
    expect(pages.has(15)).toBe(true);
    expect(pages.has(16)).toBe(true);
    expect(marked.has(15)).toBe(true);
    expect(marked.has(16)).toBe(true);
    for (const page of [...pages, ...marked]) {
      expect(page === 15 || page === 16 || page === 17).toBe(true);
    }
    expect(cited.sources.some((source) => source.printedPage === 15 && /Hair|Dress Code|All Locations/i.test(`${source.locator} ${source.excerpt}`))).toBe(true);
    expect(cited.sources.some((source) => /Page 16 — Jewelry/.test(source.locator))).toBe(true);
    expect(cited.sources.some((source) => source.printedPage === 16 && /plain black, white, or gray t-shirt/i.test(source.excerpt))).toBe(true);
    expect(cited.sources.some((source) => source.printedPage === 17)).toBe(true);
    for (const source of cited.sources) {
      const body = `${source.locator}\n${source.excerpt}`;
      const crunchShirtsOrPants =
        /Instructors ONLY|Two uniform shirts/i.test(body) ||
        (/Shirts|Pants/.test(source.locator) && /Crunch Fitness/i.test(body));
      if (!crunchShirtsOrPants) continue;
      expect(source.printedPage).toBe(16);
    }
    const crunchSentence = cited.text.split(/(?<=[.!?])\s+/).find((sentence) => /instructors only/i.test(sentence));
    expect(crunchSentence).toMatch(/\[p\.16\]/);
    expect(crunchSentence).not.toMatch(/\[p\.17\]/);
    expect(cited.sources.map((source) => source.locator).join("\n")).not.toMatch(/Full manual|Page 1\b|p\.1/);
    expect(cited.text).not.toContain("[S");
  });

  it("keeps the sentence when a sub-heading is the citation label", () => {
    const sentence = "Tattoos — large, inappropriate, or offensive tattoos must be covered";
    const label = "Tattoos, JBA Policy Manual p.16";
    const answer = `${sentence} (${label}).`;
    const plan = planFullManualContext({ question: DRESS_CODE_QUESTION, documents });
    const cited = citePolicyAnswer(answer, plan);
    const marked = validateManualCitations(cited.text, { shownMarkers: [], index: plan.index });
    for (const text of [cited.text, marked]) {
      expect(text).toContain(sentence);
      expect(text).toContain(label);
      expect(text).not.toContain("Tattoos — large,Tattoos, JBA Policy Manual p.16)");
    }
    const tattoos = cited.sources.find((source) => /Tattoos/.test(source.locator));
    expect(tattoos?.locator).toBe("Page 16 — Tattoos");
    expect(tattoos?.excerpt).toContain("inappropriate, or offensive tattoos must be covered");
    expect(tattoos?.printedPage).toBe(16);
  });

  it("conv_mvmkj5v72w5x3l5 cites p.19, and [S9] is not left without a source", () => {
    const plan = planFullManualContext({ question: CELL_PHONE_QUESTION, documents });
    const cited = citePolicyAnswer(`${CELL_PHONE_ANSWER} [S9]`, plan, [1]);
    expect(cited.ok).toBe(true);
    expect(cited.text).not.toContain("[S9]");
    expect(cited.text).not.toContain("[S");
    expect(new Set(citedPages(cited.text))).toEqual(new Set([19]));
    expect(cited.sources.map((source) => source.locator).join("\n")).toMatch(/Page 19 — Cell Phone\/Smart Watch Policy/);
    expect(cited.sources.every((source) => source.locator.startsWith("Page 19 — Cell Phone"))).toBe(true);
    expect(cited.sources.map((source) => source.locator).join("\n")).not.toMatch(/Full manual|Page 1\b|p\.1/);
    expect(cited.sources.every((source) => source.printedPage === 19)).toBe(true);
  });

  it("drops a page the manual does not contain, and falls back when nothing was cited", () => {
    const plan = planFullManualContext({ question: CELL_PHONE_QUESTION, documents });
    const repaired = citePolicyAnswer(`See page 99 and [p.4]. ${CELL_PHONE_ANSWER}`, plan);
    expect(repaired.ok).toBe(true);
    expect(repaired.text).not.toContain("99");
    expect(repaired.text).not.toContain("[p.4]");
    expect(new Set(citedPages(repaired.text))).toEqual(new Set([19]));
    expect(repaired.sources.some((source) => source.printedPage === 4 || source.printedPage === 99)).toBe(false);

    const missed = citePolicyAnswer("The weather is nice today.", plan);
    expect(missed.ok).toBe(false);
    expect(missed.sources).toEqual([]);
  });
});

/**
 * Live replay of the merged full-manual path (f8759f6).
 *
 * The chunks below store printedPage and do not contain a footer. Their
 * section pages are the PDF sheet, one higher than the printed page. Hair is
 * stored as 15, Jewelry and Crunch shirts and pants as 16, Cell Phone as 19.
 */
function storedManual(extra: FullManualDocument["chunks"][number][] = []): FullManualDocument {
  return {
    id: "81622d77-ee6c-55f6-904d-dee057907a13",
    title: "2025 JBA Policy Manual - Edited 5-2025",
    category: "policies_compliance",
    status: "indexed",
    indexed: true,
    chunks: [
      ...storedChunks.chunks.map((chunk) => ({
        chunkIndex: chunk.i,
        content: chunk.c,
        locator: `Page ${chunk.page} — ${chunk.h[0] ?? "Pants"}`,
        page: chunk.page,
        printedPage: chunk.printedPage,
        section: chunk.h[0] ?? null,
        headings: chunk.h,
        sections: chunk.sections,
      })),
      ...extra,
    ],
  };
}

function decoy(index: number, printed: number, heading: string, body: string) {
  return {
    chunkIndex: index,
    content: `${heading}\n${body}`,
    locator: `Page ${printed + 1} — ${heading}`,
    page: printed + 1,
    printedPage: printed,
    section: heading,
    headings: [heading],
    sections: [{ heading, page: printed + 1 }],
  };
}

describe("stored printed pages, no footer", () => {
  it("keeps printedPage as stored on chunks 44-49 and 61", () => {
    const pages = new Map(storedChunks.chunks.map((chunk) => [chunk.i, chunk.printedPage]));
    expect(pages.get(44)).toBe(15);
    expect(pages.get(45)).toBe(15);
    expect(pages.get(46)).toBe(16);
    expect(pages.get(47)).toBe(16);
    expect(pages.get(61)).toBe(19);
    for (const chunk of storedChunks.chunks) {
      expect(chunk.printedPage).toBe(chunk.page - 1);
      expect(chunk.c).not.toMatch(/\d+\s*\|\s*p\s*a\s*g\s*e/i);
      expect(chunk.sections.every((section) => section.page === chunk.page)).toBe(true);
    }
  });

  it("cites Hair on p.15 and Jewelry and Crunch shirts on p.16 when section pages are the PDF sheet", () => {
    const plan = planFullManualContext({ question: DRESS_CODE_QUESTION, documents: [storedManual()] });
    const text = plan.cachedBlock ?? "";
    const slice = (start: string, end: string) => {
      const from = text.indexOf(start);
      const to = text.indexOf(end, from + start.length);
      return text.slice(from, to < 0 ? text.length : to);
    };
    const company = slice("[p.15]", "[p.16]");
    const page16 = slice("[p.16]", "[p.17]");
    expect(company).toContain("Hair");
    expect(company).toContain("All Locations Dress Code:");
    expect(company).not.toContain("Jewelry/Accessories");
    expect(page16).toContain("Jewelry/Accessories");
    expect(page16).toContain("Crunch Fitness Specific Dress Code:");
    expect(page16).toContain("Two uniform shirts");
    expect(page16).toContain("approved for Instructors ONLY");
    expect(page16).toContain(BCS_SHIRTS);
    expect(text).not.toContain("[p.18]");

    const replay = [
      "Hair of all lengths and colors is acceptable when it is clean, groomed, and kept out of the employee's face and eyes. [p.16]",
      "Jewelry that does not interfere with work is acceptable. [p.17]",
      "Crunch provides two uniform shirts, and yoga pants, joggers, or sweats are approved for instructors only. [p.17]",
    ].join(" ");
    const cited = citePolicyAnswer(replay, plan);
    expect(cited.ok).toBe(true);
    const hair = cited.text.split(/(?<=[.!?])\s+/).find((sentence) => /^Hair of all lengths/i.test(sentence));
    const jewelry = cited.text.split(/(?<=[.!?])\s+/).find((sentence) => /^Jewelry that does not/i.test(sentence));
    const crunch = cited.text.split(/(?<=[.!?])\s+/).find((sentence) => /instructors only/i.test(sentence));
    expect(hair).toMatch(/\[p\.15\]/);
    expect(hair).not.toMatch(/\[p\.16\]/);
    expect(jewelry).toMatch(/\[p\.16\]/);
    expect(jewelry).not.toMatch(/\[p\.17\]/);
    expect(crunch).toMatch(/\[p\.16\]/);
    expect(crunch).not.toMatch(/\[p\.17\]/);
    expect(cited.sources.some((source) => source.printedPage === 15 && /Hair/.test(source.locator))).toBe(true);
    expect(cited.sources.some((source) => source.printedPage === 16 && /Jewelry/.test(source.locator))).toBe(true);
    for (const source of cited.sources) {
      const body = `${source.locator}\n${source.excerpt}`;
      if (/Instructors ONLY|Two uniform shirts/i.test(body)) expect(source.printedPage).toBe(16);
    }
    const marked = new Set(citedPages(cited.text));
    for (const page of marked) {
      expect(cited.sources.some((source) => source.printedPage === page)).toBe(true);
    }
  });

  it("uses the stored printed page when that page equals the PDF sheet and the section page is one higher", () => {
    const plan = planFullManualContext({
      question: DRESS_CODE_QUESTION,
      documents: [
        manual({
          chunks: [
            {
              chunkIndex: 44,
              page: 15,
              printedPage: 15,
              locator: "Page 15 — Hair",
              content:
                "Hair\no Hair of all lengths and colors are acceptable as long as it is clean, groomed, and kept out of the employee’s face and eyes.",
              headings: ["Hair"],
              sections: [{ heading: "Hair", page: 16 }],
            },
          ],
        }),
      ],
    });
    const text = plan.cachedBlock ?? "";
    expect(text).toContain("[p.15]");
    expect(text).not.toContain("[p.16]");
    expect(text.indexOf("[p.15]")).toBeLessThan(text.indexOf("Hair"));
  });

  it("conv_mvmkj5v72w5x3l5 marks the cell-phone sentence, and drops POS passwords and pages that do not match", () => {
    const stray = [9, 10, 12, 14, 18, 20, 26, 29, 31, 48];
    const documents = [
      storedManual([
        decoy(62, 20, "POS Passwords", "A register password is issued to one person and is never written on a note."),
        decoy(901, 9, "Parking", "Team members park away from the front row so customers can use those spaces."),
        decoy(902, 10, "Opening Cash", "The opening manager counts the drawer before unlocking the front door."),
        decoy(903, 12, "Rest Breaks", "A rest break is scheduled away from the sales floor."),
        decoy(904, 14, "Attendance", "Missing a scheduled shift without calling the manager is an attendance occurrence."),
        decoy(905, 18, "Visitors", "A guest waits in the lobby until a supervisor approves the visit."),
        decoy(906, 26, "Building Keys", "Building keys are signed out at the start of a shift and returned at the end."),
        decoy(907, 29, "Personal Visitors", "Personal visitors need supervisor approval before they enter the back room."),
        decoy(908, 31, "Security Cameras", "Security cameras stay on after closing and the recording is reviewed by the district."),
        decoy(909, 48, "Maternity Leave", "Leave for a birth is requested on the leave form and sent to the district manager."),
      ]),
    ];
    const plan = planFullManualContext({ question: CELL_PHONE_QUESTION, documents });
    const prompt = plan.cachedBlock ?? "";
    const cellAt = prompt.indexOf("Cell Phone/Smart Watch Policy");
    const posAt = prompt.indexOf("POS Passwords");
    expect(cellAt).toBeGreaterThan(prompt.lastIndexOf("[p.19]", cellAt));
    expect(prompt.slice(prompt.lastIndexOf("[p.19]", cellAt), cellAt)).not.toContain("[p.20]");
    expect(posAt).toBeGreaterThan(prompt.lastIndexOf("[p.20]", posAt));

    const bullets = [
      "Personal Employee cell phones are permitted in the workplace but must be kept out of sight.",
      "It is the Employee's personal responsibility to protect the customer's experience.",
      "Doing things such as texting, making phone calls or using social media jeopardizes the customer's experience.",
    ];
    const answer = [
      ...bullets.map((bullet) => `${bullet} [p.20]`),
      `Keep the phone in a locker during the shift. [p.20] ${stray.map((page) => `[p.${page}]`).join(" ")}`,
    ].join("\n");
    const cited = citePolicyAnswer(answer, plan);
    expect(cited.ok).toBe(true);
    for (const bullet of bullets) {
      const sentence = cited.text.split(/(?<=[.!?])\s+/).find((part) => part.includes(bullet.slice(0, 40)));
      expect(sentence).toMatch(/\[p\.19\]/);
      expect(sentence).not.toMatch(/\[p\.20\]/);
    }
    const locker = cited.text.split(/(?<=[.!?])\s+/).find((part) => /locker/i.test(part));
    expect(locker).toBeTruthy();
    expect(locker).not.toMatch(/\[p\./);
    expect(new Set(citedPages(cited.text))).toEqual(new Set([19]));
    expect(cited.sources.every((source) => source.printedPage === 19)).toBe(true);
    expect(cited.sources.every((source) => source.locator.startsWith("Page 19 — Cell Phone"))).toBe(true);
    expect(cited.sources.map((source) => `${source.locator} ${source.excerpt}`).join("\n")).not.toMatch(/POS Passwords/);
    for (const page of stray) {
      expect(cited.sources.some((source) => source.printedPage === page)).toBe(false);
    }
    for (const page of citedPages(cited.text)) {
      expect(cited.sources.some((source) => source.printedPage === page)).toBe(true);
    }
  });
});

/**
 * Production rows for chunks 50-53 and 62. `printedPage` and `sections` are
 * the metadata as stored. Chunk 50's section pages are all 17, and chunk 62
 * is stored as 19 with the password heading recorded on 20.
 */
function productionChunk(index: number) {
  const row = productionRows.chunks.find((chunk) => chunk.chunk_index === index);
  if (!row) throw new Error(`missing production chunk ${index}`);
  const sections = row.metadata.sections;
  return {
    chunkIndex: row.chunk_index,
    content: row.content,
    printedPage: row.metadata.printedPage,
    section: sections[0]?.heading ?? null,
    headings: sections.map((section) => section.heading),
    sections,
  };
}

function storedChunk(index: number) {
  const chunk = storedChunks.chunks.find((item) => item.i === index);
  if (!chunk) throw new Error(`missing stored chunk ${index}`);
  return {
    chunkIndex: chunk.i,
    content: chunk.c,
    locator: `Page ${chunk.page} — ${chunk.h[0] ?? "Pants"}`,
    page: chunk.page,
    printedPage: chunk.printedPage,
    section: chunk.h[0] ?? null,
    headings: chunk.h,
    sections: chunk.sections,
  };
}

function manualFrom(chunks: FullManualDocument["chunks"]): FullManualDocument {
  return {
    id: productionRows.document_id,
    title: "2025 JBA Policy Manual - Edited 5-2025",
    category: "policies_compliance",
    status: "indexed",
    indexed: true,
    chunks,
  };
}

function markerBefore(text: string, snippet: string): string {
  const at = text.indexOf(snippet);
  expect(at).toBeGreaterThan(-1);
  const markers = [...text.slice(0, at).matchAll(/\[p\.(\d{1,3})\]/g)];
  return markers[markers.length - 1]?.[1] ?? "";
}

describe("production chunks 50 and 62", () => {
  it("keeps the stored metadata for chunks 50-53 and 62", () => {
    expect(productionRows.chunks.map((chunk) => chunk.chunk_index)).toEqual([50, 51, 52, 53, 62]);
    expect(productionRows.chunks.find((chunk) => chunk.chunk_index === 50)?.metadata.printedPage).toBe(17);
    expect(productionRows.chunks.find((chunk) => chunk.chunk_index === 62)?.metadata.printedPage).toBe(19);
    expect(productionRows.chunks.find((chunk) => chunk.chunk_index === 62)?.metadata.sections).toEqual([
      { page: 19, heading: "Company Email Account" },
      { page: 20, heading: "Point of Sale and Alarm Passwords" },
    ]);
  });

  it("chunk 50's Buff City Soap shirt and pants stay on p.16, and Sun Tan City starts p.17", () => {
    const plan = planFullManualContext({
      question: DRESS_CODE_QUESTION,
      documents: [manualFrom([storedChunk(47), productionChunk(50)])],
    });
    const text = plan.cachedBlock ?? "";
    const page16 = text.slice(text.indexOf("[p.16]"), text.indexOf("[p.17]"));
    const page17 = text.slice(text.indexOf("[p.17]"));
    expect(page16).toContain("No patches, rips, or holes are to be noticeable on the shirt.");
    expect(page16).toContain("Full length black or blue jean-colored pants are acceptable.");
    expect(page16).toContain("Yoga pants, joggers or sweats are never to be worn while at work.");
    expect(page16).not.toContain("Sun Tan City:");
    expect(page17).toContain("Sun Tan City:");
    expect(page17).toContain("Any STC Employee can wear any Branded top or black collared or black t-shirt.");
    expect(page17).not.toContain("blue jean-colored pants are acceptable.");
    expect(markerBefore(text, "Full length black or blue jean-colored pants are acceptable.")).toBe("16");
    expect(markerBefore(text, "Sun Tan City:")).toBe("17");

    const bcs = citePolicyAnswer(
      [
        "Full length black or blue jean-colored pants are acceptable.",
        "Yoga pants, joggers or sweats are never to be worn while at work.",
      ].join(" "),
      plan,
    );
    for (const sentence of bcs.text.split(/(?<=[.!?])\s+/)) {
      if (!/blue jean-colored|never to be worn/i.test(sentence)) continue;
      expect(sentence).toMatch(/\[p\.16\]/);
      expect(sentence).not.toMatch(/\[p\.17\]/);
    }
    expect(bcs.sources.every((source) => source.printedPage === 16)).toBe(true);

    const stc = citePolicyAnswer(
      "Any STC Employee can wear any Branded top or black collared or black t-shirt.",
      plan,
    );
    expect(stc.text).toMatch(/\[p\.17\]/);
    expect(stc.text).not.toMatch(/\[p\.16\]/);
    expect(stc.sources.every((source) => source.printedPage === 17)).toBe(true);
  });

  it("chunk 62 is p.20 email and password text, and a cell phone answer takes no marker from it", () => {
    const plan = planFullManualContext({
      question: CELL_PHONE_QUESTION,
      documents: [manualFrom([storedChunk(61), productionChunk(62)])],
    });
    const text = plan.cachedBlock ?? "";
    const page19 = text.slice(text.indexOf("[p.19]"), text.indexOf("[p.20]"));
    const page20 = text.slice(text.indexOf("[p.20]"));
    expect(page19).toContain("Cell Phone/Smart Watch Policy");
    expect(page19).toContain("Personal Employee cell phones are permitted");
    expect(page19).not.toContain("Company Email Account");
    expect(page19).not.toContain("Point of Sale and Alarm Passwords");
    expect(page20).toContain("Company Email Account");
    expect(page20).toContain("Point of Sale and Alarm Passwords");
    expect(page20).toContain("Do NOT share");
    expect(markerBefore(text, "Company Email Account")).toBe("20");
    expect(markerBefore(text, "Point of Sale and Alarm Passwords")).toBe("20");

    const bullets = [
      "Personal Employee cell phones are permitted in the workplace but must be kept out of sight.",
      "It is the Employee's personal responsibility to protect the customer's experience.",
      "Doing things such as texting, making phone calls or using social media jeopardizes the customer's experience.",
    ];
    const cited = citePolicyAnswer(bullets.map((bullet) => `${bullet} [p.19]`).join("\n"), plan);
    expect(cited.ok).toBe(true);
    expect(new Set(citedPages(cited.text))).toEqual(new Set([19]));
    for (const bullet of bullets) {
      const sentence = cited.text.split(/(?<=[.!?])\s+/).find((part) => part.includes(bullet.slice(0, 40)));
      expect(sentence).toMatch(/\[p\.19\]/);
      expect(sentence).not.toMatch(/\[p\.20\]/);
    }
    const body = cited.sources.map((source) => `${source.locator}\n${source.excerpt}`).join("\n");
    expect(body).not.toMatch(/Company Email|Alarm Password|alarm codes|Point of Sale/i);
    expect(cited.sources.every((source) => source.printedPage === 19)).toBe(true);
    expect(cited.sources.every((source) => source.locator.startsWith("Page 19 — Cell Phone"))).toBe(true);

    const passwords = citePolicyAnswer(
      "Employees must always use their own personal passwords and alarm codes. Do NOT share alarm codes or passwords.",
      plan,
    );
    expect(new Set(citedPages(passwords.text))).toEqual(new Set([20]));
    expect(passwords.sources.every((source) => source.printedPage === 20)).toBe(true);
    expect(passwords.sources.map((source) => source.locator).join("\n")).toMatch(/Point of Sale and Alarm Passwords/);
  });
});
