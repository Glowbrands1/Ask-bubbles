import { afterEach, describe, expect, it, vi } from "vitest";

import fixture from "@/test/fixtures/jba-manual-brand-chunks.json";
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
  "Buff City Soap employees can wear any plain black, white, or gray t-shirt.",
  "Jewelry that does not interfere with work is acceptable.",
  "Large, inappropriate, or offensive tattoos must be covered.",
  "At Crunch, yoga pants, joggers, or sweats are approved for instructors only.",
  "Buff City Soap pants are full length, and yoga pants, joggers or sweats are never to be worn while at work.",
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
    expect(text).toContain("[p.16]");
    expect(text).toContain("[p.17]");
    expect(text).toContain("[p.19]");
    expect(text).not.toContain("[p.20]");
    expect(text).not.toContain("[p.3]");
    expect(text).not.toContain("[p.4]");
    expect(text).not.toContain("[p.5]");
    expect(text).not.toContain("[p.6]");
    expect(text).not.toContain("CONTENTS ROW ONLY");
    expect(text).not.toContain("Table of Contents");
    expect(plan.index?.pages.has(16)).toBe(true);
    expect(plan.index?.pages.has(19)).toBe(true);
    expect(plan.index?.pages.has(3)).toBe(false);
    expect(plan.index?.pages.has(6)).toBe(false);
    expect(plan.index?.pages.has(20)).toBe(false);
  });

  it("conv_mvmkij8h2vdogs9 cites p.16 and p.17 for both brands, tattoos, and jewelry", () => {
    const plan = planFullManualContext({ question: DRESS_CODE_QUESTION, documents });
    const cited = citePolicyAnswer(DRESS_CODE_ANSWER, plan);
    expect(cited.ok).toBe(true);
    expect(cited.text).toMatch(/buff city soap/i);
    expect(cited.text).toMatch(/crunch/i);
    expect(cited.text).toMatch(/tattoo/i);
    expect(cited.text).toMatch(/jewelry/i);
    expect(citedPages(cited.text)).toEqual(expect.arrayContaining([16, 17]));
    const locators = cited.sources.map((source) => source.locator);
    expect(locators.some((locator) => /Page 16 — Tattoos/.test(locator))).toBe(true);
    expect(locators.some((locator) => /Page 16 — Jewelry/.test(locator))).toBe(true);
    expect(locators.some((locator) => /Page 16 — Shirts/.test(locator))).toBe(true);
    expect(locators.some((locator) => /Page 16 — Pants/.test(locator))).toBe(true);
    expect(locators.some((locator) => /Page 17 — Pants/.test(locator))).toBe(true);
    expect(locators.join("\n")).not.toMatch(/Full manual|Page 1\b|p\.1/);
    expect(cited.sources.length).toBeGreaterThan(1);
    expect(new Set(citedPages(cited.text))).toEqual(new Set([16, 17]));
    for (const page of citedPages(cited.text)) {
      expect(cited.sources.some((source) => source.printedPage === page)).toBe(true);
    }
    expect(cited.sources.every((source) => source.printedPage === 16 || source.printedPage === 17)).toBe(true);
    expect(cited.text).not.toContain("[S");
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
