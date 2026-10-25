import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ============================================================================
 * "THE SOURCES YOU JUST SHARED" — conv_mvnljjl32xlit48, the live answer path
 * ============================================================================
 *
 * Production, 25 Oct 2026. A coaching conversation:
 *
 *   T1 "I need to coach an employee"
 *   T2 "Her name is Test Employee"
 *   T3 "She works at Grand Island"
 *   T4 "It happened on 10-21"
 *
 * T3 was searched on its own words. "Grand Island" found soap and auxiliary
 * recipe pages, and the reply told the manager "the sources you just shared
 * are all soap and auxiliary recipe directions" — coverage "insufficient".
 * T4 was searched on "It happened on 10-21" and found event tech-guide pages.
 * The manager shared nothing: the excerpts are what the app retrieved, and
 * they sit in the same user message as the question, unlabelled as to who
 * put them there.
 *
 * Three guards, all checked here through `answerQuestion`:
 *   1. a turn that only supplies a store or a date is searched with the
 *      conversation's topic, not its own words;
 *   2. the prompt says retrieved sources are the app's own reference
 *      material, never something the manager shared, sent or provided;
 *   3. a reply that still says so is neutralised, and only when the
 *      manager's turns carry no paste.
 */

const state = vi.hoisted(() => ({
  queries: [] as string[],
  system: "",
  grounding: "",
  reply: "",
  rewrites: [] as string[],
}));

vi.mock("./query-rewrite-claude", () => ({
  rewriteRetrievalQuery: async (input: { question: string }) => {
    state.rewrites.push(input.question);
    return input.question;
  },
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
      return [
        {
          chunk_id: "c1",
          document_id: "d1",
          document_title: "Soap Training Recipe Book",
          category: "other",
          locator: "Page 12",
          page: 12,
          section: null,
          content: "Island Nectar: pour at the listed temperature.",
          similarity: 0.8,
        },
      ];
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

vi.mock("./call-claude", () => ({
  callClaude: async (input: { system: string; grounding: string }) => {
    state.system = input.system;
    state.grounding = input.grounding;
    return state.reply;
  },
}));

const ACTOR = {
  role: "location_manager" as never,
  scope: { level: "location", primaryAreaId: "loc-0101", alsoCoversAreaIds: [] } as never,
};

const T1 = "I need to coach an employee";
const T2 = "Her name is Test Employee";
const T3 = "She works at Grand Island";
const T4 = "It happened on 10-21";

const A1 =
  "Happy to help structure that. A few quick things first so I can point you the right direction:\n\n- **Who's the coaching for, and what's the behavior or topic?**";
const A2 =
  "Got it, Test Employee it is. To build the right coaching, I need two more things:\n\n1. **What's the behavior or topic?**\n2. **What did you actually observe?**";

/** The T3 reply production sent, word for word. */
const REPLY_T3 = `Noted — Grand Island, NE is Store 236 on our registered store list. I don't have a Woven employee record for "Test Employee," so I can't verify her title, status, or that she's actually assigned there — I'll just use what you've told me.

That said, the sources you just shared are all soap and auxiliary recipe directions (Island Nectar, Sunkissed Getaway, surface cleaner, etc.) — none of them touch coaching, performance, or conduct topics, so I can't build a coaching plan from them.

To move forward I still need:

1. **What's the behavior or issue?** (e.g., a skill gap like soap-pouring technique, a guest interaction, attendance, policy compliance — something else?)
2. **What did you actually observe** — specifics, not a general impression.`;

const HISTORY_T3 = [
  { role: "user", content: T1 },
  { role: "assistant", content: A1 },
  { role: "user", content: T2 },
  { role: "assistant", content: A2 },
];

async function ask(question: string, history: { role: string; content: string }[]) {
  const { answerQuestion } = await import("./server-ask");
  return answerQuestion(
    {
      question,
      mode: "standard",
      history,
      scopeId: "bcs-core",
      conversationId: "conv_mvnljjl32xlit48",
      context: { userName: "Rosalyn", locationName: "All areas", todayIso: "2026-10-25" },
    } as never,
    ACTOR,
  );
}

// The first import of server-ask is the slow part; under load it alone passed 5s.
beforeAll(async () => {
  await import("./server-ask");
}, 60_000);

beforeEach(() => {
  state.queries = [];
  state.system = "";
  state.grounding = "";
  state.reply = "An answer.";
  state.rewrites = [];
});

describe("conv_mvnljjl32xlit48 — a store or a date is not a new topic to search", () => {
  it('T3 "She works at Grand Island" is not searched on its own words', async () => {
    await ask(T3, HISTORY_T3);
    expect(state.queries).not.toContain(T3);
    expect(state.queries.some((query) => /grand island/i.test(query))).toBe(false);
    // Searched, it is the conversation's topic: the coaching ask.
    expect(state.queries.length === 0 || state.queries.some((query) => /coach/i.test(query))).toBe(true);
  });

  it('T4 "It happened on 10-21" is not searched on its own words', async () => {
    await ask(T4, [
      ...HISTORY_T3,
      { role: "user", content: T3 },
      { role: "assistant", content: "Noted — Grand Island, NE." },
    ]);
    expect(state.queries).not.toContain(T4);
    expect(state.queries.some((query) => /10-21|happened/i.test(query))).toBe(false);
    expect(state.queries.length === 0 || state.queries.some((query) => /coach/i.test(query))).toBe(true);
  });

  it("with the query rewrite on, the slot turn is not rewritten from its own words", async () => {
    const saved = process.env.QUERY_REWRITE_ENABLED;
    process.env.QUERY_REWRITE_ENABLED = "1";
    try {
      await ask(T3, HISTORY_T3);
    } finally {
      if (saved === undefined) delete process.env.QUERY_REWRITE_ENABLED;
      else process.env.QUERY_REWRITE_ENABLED = saved;
    }
    expect(state.rewrites).not.toContain(T3);
    expect(state.queries).not.toContain(T3);
    expect(state.queries.length === 0 || state.queries.some((query) => /coach/i.test(query))).toBe(true);
  });

  it("a turn that names the behaviour is still searched as typed", async () => {
    const T5 = "She was on her cell phone for 30+ minutes at the front desk";
    await ask(T5, [
      ...HISTORY_T3,
      { role: "user", content: T3 },
      { role: "assistant", content: "Noted." },
      { role: "user", content: T4 },
      { role: "assistant", content: "Thanks for the date." },
    ]);
    expect(state.queries).toContain(T5);
  });

  it("a first turn with no topic before it is searched as typed", async () => {
    await ask(T3, []);
    expect(state.queries).toContain(T3);
  });
});

describe("conv_mvnljjl32xlit48 — retrieved sources are not something the manager shared", () => {
  it("the prompt says retrieved sources are the app's own, never shared, sent or provided by the manager", async () => {
    await ask(T3, HISTORY_T3);
    const prompt = `${state.system}\n\n${state.grounding}`;
    expect(prompt).toMatch(/never something the manager shared, sent, pasted or provided/i);
    expect(prompt).toMatch(/never call them "the sources you shared"/i);
    // The grounding block itself says who put the excerpts there.
    expect(state.grounding).toMatch(/retrieved by this app from the company knowledge base/i);
  });

  it("the recorded T3 reply no longer says the manager shared the sources", async () => {
    state.reply = REPLY_T3;
    const response = await ask(T3, HISTORY_T3);
    expect(response.content).not.toMatch(/you just shared/i);
    expect(response.content).not.toMatch(/sources you (?:just )?(?:shared|sent|provided)/i);
    // Only that clause changes: the rest of the reply is kept.
    expect(response.content).toContain("are all soap and auxiliary recipe directions");
    expect(response.content).toContain("What did you actually observe");
    expect(response.content).toContain("Store 236");
  });

  it("a manager who pasted text keeps the reply as written", async () => {
    const pasted = `Here is what she wrote in the shift log:\n\nArrived 10 minutes late.\nSkipped the opening checklist.\nLeft the register unattended.\n\nWhat do I do with this?`;
    state.reply = "The notes you shared show three separate misses.";
    const response = await ask(pasted, HISTORY_T3);
    expect(response.content).toContain("The notes you shared show three separate misses.");
  });
});
