import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * BRAND_REPLY_GUARD_ENABLED through `answerQuestion`: the reply production
 * gave (tester G21) to a pets question, asked in lowercase and sentence case.
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

beforeAll(async () => {
  await import("./server-ask");
}, 60_000);
beforeEach(() => {
  state.queries = [];
  state.reply =
    "Pets are not allowed in the workplace; only a trained service animal is permitted [S1]. For Sun Tan City and Crunch tanning rooms specifically, service animals are allowed in the tanning room [S1].";
});
afterEach(() => vi.unstubAllEnvs());
// Flag-off pins hold whatever the environment has on; flag-on tests set it.
beforeEach(() => vi.stubEnv("BRAND_REPLY_GUARD_ENABLED", ""));

const QUESTIONS = [
  "can i bring my dog to work",
  "Can i bring my dog to work",
  "pets at work?",
  "Pets at work?",
  "what does our policy say about attendance?",
  "What does our policy say about attendance?",
  "whats policy say about store opening late",
  "Whats policy say about store opening late",
  "late opening policy",
  "Late opening policy",
  "whats policy say about changing availabilty",
  "Whats policy say about changing availabilty",
];

describe("the pets answer", () => {
  it.each(QUESTIONS)("flag on: %s never names another brand", async (question) => {
    vi.stubEnv("BRAND_REPLY_GUARD_ENABLED", "true");
    const answer = await ask(question, []);
    expect(answer.content).not.toMatch(/sun tan city|crunch|tanning room/i);
    expect(answer.content).toMatch(/service animal/);
  });

  it("flag off: the other brands are in the reply (the leak)", async () => {
    const answer = await ask(QUESTIONS[0]!, []);
    expect(answer.content).toMatch(/sun tan city/i);
  });
});
