import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { carriedPolicyTopic, isGoAheadTurn } from "./policy-carry-retrieval";

/**
 * ============================================================================
 * "JUST MAKE IT" DOES NOT LOSE THE POLICY ALREADY CITED
 * (POLICY_CARRY_RETRIEVAL_ENABLED) — conv_mvofuq3l2jae1be, the live answer path
 * ============================================================================
 *
 * QA item 10, production, 25 Oct 2026 (employee and store names invented):
 *
 *   T1 "do verbl for <name> at <store>. no payrol deduct. prev coachng jba
 *      manual 11-1-25. on 10-22-26 <name> wasnt scheduled and came in to show
 *      her puppy 45 min"
 *   T2 "cite animals in the workplace policy"   → Animals in the Workplace p.30
 *   T3 "I already told you the store is <store>"
 *   T4 "just make it"                           → "The knowledge base doesn't
 *      have anything about an 'animals in the workplace' policy ... these
 *      excerpts are all soap/body wash production recipes"
 *
 * T4 was searched on its own three words. With the flag on it is searched
 * with T2, the turn that named the policy. Fails with the flag off.
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

const T1 =
  "do verbl for Wren Okafor at Lakeview. no payrol deduct. prev coachng jba manual 11-1-25. on 10-22-26 Wren wasnt scheduled and came in to show her puppy 45 min";
const T2 = "cite animals in the workplace policy";
const T3 = "I already told you the store is Lakeview";
const T4 = "just make it";
const HISTORY = [
  { role: "user", content: T1 },
  { role: "assistant", content: "Which store is this actually for? I won't guess." },
  { role: "user", content: T2 },
  { role: "assistant", content: "Animals in the Workplace: The Company doesn't allow pets in the workplace [p.30]." },
  { role: "user", content: T3 },
  { role: "assistant", content: "Got it. Say \"create a coaching form for Wren Okafor\" and I'll bring up the draft." },
];

async function ask(question: string, history: { role: string; content: string }[]) {
  const { answerQuestion } = await import("./server-ask");
  return answerQuestion(
    {
      question,
      mode: "standard",
      history,
      scopeId: "bcs-core",
      conversationId: "conv_mvofuq3l2jae1be",
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
  state.reply = "An answer.";
  state.rewrites = [];
});
afterEach(() => vi.unstubAllEnvs());

describe("conv_mvofuq3l2jae1be — T4 \"just make it\"", () => {
  it("flag off: is searched on its own words (the bug)", async () => {
    await ask(T4, HISTORY);
    expect(state.queries).toContain(T4);
  });

  it("flag on: is searched with the turn that named the policy", async () => {
    vi.stubEnv("POLICY_CARRY_RETRIEVAL_ENABLED", "true");
    await ask(T4, HISTORY);
    expect(state.queries).not.toContain(T4);
    expect(state.queries.length).toBeGreaterThan(0);
    expect(state.queries.every((query) => /animals in the workplace/i.test(query))).toBe(true);
  });

  it("flag on: a turn with its own topic is still searched as typed", async () => {
    vi.stubEnv("POLICY_CARRY_RETRIEVAL_ENABLED", "true");
    const own = "what is the dress code policy?";
    await ask(own, HISTORY);
    expect(state.queries).toContain(own);
  });
});

describe("which turns only say to go ahead", () => {
  it.each(["just make it", "make it", "create it", "do it", "yes", "ok go ahead", "just make the form", "create the draft now", "please do it"])(
    "%s",
    (turn) => expect(isGoAheadTurn(turn)).toBe(true),
  );

  it.each([
    "make it a written warning",
    "create a coaching form for Wren Okafor",
    "just make it say she was late",
    "what is the dress code policy?",
    T3,
  ])("%s carries its own topic", (turn) => expect(isGoAheadTurn(turn)).toBe(false));

  it("with no policy named earlier, the latest topic turn is searched", () => {
    vi.stubEnv("POLICY_CARRY_RETRIEVAL_ENABLED", "true");
    expect(carriedPolicyTopic("do it", [{ role: "user", content: "Wren was rude to a guest" }])).toBe("Wren was rude to a guest");
    expect(carriedPolicyTopic("do it", [{ role: "assistant", content: "the visitors policy" }])).toBeNull();
  });
});

/* HOW MANAGERS TYPE (Pau, 26 Oct 2026): the same reading in all lowercase and in sentence case. */
const lower = (text: string) => text.toLowerCase();
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();

describe("every register of a go-ahead", () => {
  it.each(["just make it", "Just make it", "JUST MAKE IT", "do it", "Do it", "make it already", "Ok go ahead"])("%s", (turn) => {
    expect(isGoAheadTurn(turn)).toBe(true);
  });

  it.each([T2, lower(T2), sentence(T2)])("flag on: the policy turn in any case is the one searched (%s)", (policyTurn) => {
    vi.stubEnv("POLICY_CARRY_RETRIEVAL_ENABLED", "true");
    expect(carriedPolicyTopic("just make it", [{ role: "user", content: policyTurn }])).toBe(policyTurn);
  });
});
