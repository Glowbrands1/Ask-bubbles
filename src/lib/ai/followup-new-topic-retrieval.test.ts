import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { followUpOwnQuery, newTopicWords } from "./query-rewrite";

/**
 * ============================================================================
 * A FOLLOW-UP THAT NAMES ITS OWN DOCUMENTS (FOLLOWUP_NEW_TOPIC_RETRIEVAL_ENABLED)
 * ============================================================================
 *
 * Found in the sibling app (QA Round 17): after a turn about documents not
 * being signed, the manager named the documents, and the retrieval rewrite,
 * reading the earlier turn, searched the earlier turn's subject instead, so
 * the section that covers them was never retrieved.
 *
 * No production turn here shows it yet: of this app's chat_traces, only six
 * carry a rewritten query, all of them slot-only turns ("Her name is Test
 * Employee") searched with the conversation's topic by design. So the turns
 * below are a neutral store/HR case built for this test, and the rewrite is
 * stubbed with a heading this app's manual prints (Employment Verification,
 * p.20). `rewriteRetrievalQuery` reads the earlier manager turn the same way
 * and can drop a follow-up's own nouns. The assistant turns are short
 * stand-ins: the rewrite reads only the manager's turns.
 *
 * Flag on: T3 names words no earlier manager turn used, and the rewrite kept
 * none of them, so T3 is searched as typed.
 */

const T1 = "Help me prepare for a coaching conversation.";
const T2 = "I have an employee who is not getting new hire paperwork signed";
const T3 = "The I-9 and W-4 forms, direct deposit agreements";
const LIVE_REWRITE = "Employment Verification";

const HISTORY = [
  { role: "user", content: T1 },
  { role: "assistant", content: "Tell me the employee and what you observed." },
  { role: "user", content: T2 },
  { role: "assistant", content: "Which documents?" },
];

describe("followUpOwnQuery (pure)", () => {
  it("T3 names words of its own", () => {
    expect(newTopicWords(T3, HISTORY)).toEqual(expect.arrayContaining(["form", "direct", "deposit", "agreement"]));
  });

  it("a rewrite that kept only the earlier subject gives way to the turn's own words", () => {
    expect(followUpOwnQuery({ question: T3, history: HISTORY, rewritten: LIVE_REWRITE, ownWords: T3 })).toBe(T3);
  });

  it("a rewrite that kept the turn's words stays", () => {
    // A manual heading the rewrite may add, with the turn's own words kept.
    const kept = "Timekeeping & Payroll direct deposit agreements";
    expect(followUpOwnQuery({ question: T3, history: HISTORY, rewritten: kept, ownWords: T3 })).toBe(kept);
  });

  it("a short pointer follow-up keeps its rewrite", () => {
    expect(
      followUpOwnQuery({ question: "the cell one", history: HISTORY, rewritten: "Cell Phone/Smart Watch Policy", ownWords: "the cell one" }),
    ).toBe("Cell Phone/Smart Watch Policy");
    expect(
      followUpOwnQuery({ question: "what about that?", history: HISTORY, rewritten: LIVE_REWRITE, ownWords: "what about that?" }),
    ).toBe(LIVE_REWRITE);
  });

  it("a first turn keeps its rewrite", () => {
    expect(followUpOwnQuery({ question: T3, history: [], rewritten: LIVE_REWRITE, ownWords: T3 })).toBe(LIVE_REWRITE);
  });
});

const state = vi.hoisted(() => ({ queries: [] as string[] }));

vi.mock("./query-rewrite-claude", () => ({
  rewriteRetrievalQuery: async () => "Employment Verification",
}));
vi.mock("@/lib/config/server-env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/config/server-env")>()),
  liveReadiness: () => ({ mode: "live", missing: [], problems: [], ready: true }),
}));
vi.mock("./form-proposal", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./form-proposal")>()),
  proposeFormForTurn: async () => null,
  suggestFormsForTurn: () => null,
}));
vi.mock("@/lib/forms/repository", () => ({ listTemplateSummaries: async () => [] }));
vi.mock("@/lib/ai/entity-facts", () => ({ resolveChatEntities: async () => ({ block: null, direct: null }) }));
vi.mock("@/lib/chat/person-memory-store", () => ({ recallPeople: async () => null }));
vi.mock("@/lib/knowledge/providers/supabase", () => ({
  SupabaseKnowledgeProvider: class {
    readonly name = "test double";
    async match(query: { query: string }) {
      state.queries.push(query.query);
      return [];
    }
    async fetchRoleGrounding() {
      return null;
    }
    async fetchNamedHandbook() {
      return { ok: false, reason: "none" };
    }
    async fetchOfficialPolicyManual() {
      return { ok: false, reason: "none" };
    }
  },
}));
vi.mock("./call-claude", () => ({ callClaude: async () => "An answer." }));

const ACTOR = {
  role: "location_manager" as never,
  scope: { level: "location", primaryAreaId: "loc-0101", alsoCoversAreaIds: [] } as never,
};

async function ask(question: string) {
  const { answerQuestion } = await import("./server-ask");
  return answerQuestion(
    {
      question,
      mode: "standard",
      history: HISTORY,
      scopeId: "bcs-core",
      conversationId: "conv_followup_new_topic",
      context: { userName: "Test Manager", locationName: "All areas", todayIso: "2026-10-25" },
    } as never,
    ACTOR as never,
  );
}

beforeAll(async () => {
  await import("./server-ask");
}, 60_000);

beforeEach(() => {
  state.queries = [];
  process.env.QUERY_REWRITE_ENABLED = "1";
});

afterEach(() => {
  delete process.env.QUERY_REWRITE_ENABLED;
  delete process.env.FOLLOWUP_NEW_TOPIC_RETRIEVAL_ENABLED;
});

describe("T3 through answerQuestion (query rewrite on)", () => {
  it("flag off: searched on the earlier subject, as live", async () => {
    await ask(T3);
    // The plan searches the rewrite, then the rewrite anchored to the earlier turn.
    expect(state.queries[0]).toBe(LIVE_REWRITE);
    expect(state.queries.some((query) => /direct deposit/i.test(query))).toBe(false);
  }, 30_000);

  it("FOLLOWUP_NEW_TOPIC_RETRIEVAL_ENABLED on: searched on the documents T3 names", async () => {
    process.env.FOLLOWUP_NEW_TOPIC_RETRIEVAL_ENABLED = "1";
    await ask(T3);
    expect(state.queries.length).toBeGreaterThan(0);
    expect(state.queries.every((query) => query.includes("direct deposit agreements"))).toBe(true);
    expect(state.queries.some((query) => query.startsWith(LIVE_REWRITE))).toBe(false);
  }, 30_000);

  it("on: a pointer follow-up keeps its rewrite", async () => {
    process.env.FOLLOWUP_NEW_TOPIC_RETRIEVAL_ENABLED = "1";
    await ask("what about that?");
    expect(state.queries[0]).toBe(LIVE_REWRITE);
  }, 30_000);
});
