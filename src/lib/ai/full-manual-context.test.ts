import { afterEach, describe, expect, it, vi } from "vitest";

import fixture from "@/test/fixtures/jba-manual-brand-chunks.json";
import { CHAT_QUALITY_FLAG_NAMES, fullManualContextEnabled } from "@/lib/config/chat-quality-flags";

import { claudeSystemPayload } from "./call-claude";
import {
  FULL_MANUAL_TOKEN_BUDGET,
  alignSourceMarkers,
  brandChoice,
  brandsCovered,
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
