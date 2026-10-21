import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ============================================================================
 * THE MEMORY BLOCK REACHES THE MODEL — WITH ITS RULES, AND ONLY FOR ITS OWNER
 * ============================================================================
 *
 * `answerQuestion` run with the providers mocked, asserting on what Claude was
 * sent. The recall itself is covered in `chat/person-memory-store.test.ts`;
 * this is the wiring: whose memory is asked for, that the block is passed
 * rather than counted, and that the prompt rules travel with it and only
 * with it.
 *
 * Ported from the reference platform; names, stores and documents are
 * synthetic.
 */

const state = vi.hoisted(() => ({
  claudeInput: null as Record<string, unknown> | null,
  recallInput: null as Record<string, unknown> | null,
  memory: null as string | null,
  entities: { block: null as string | null, direct: null as unknown },
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

vi.mock("@/lib/ai/entity-facts", () => ({ resolveChatEntities: async () => state.entities }));

vi.mock("@/lib/knowledge/providers/supabase", () => ({
  SupabaseKnowledgeProvider: class {
    readonly name = "test double";
    async match() {
      return [
        {
          chunk_id: "c1",
          document_id: "d1",
          document_title: "Synthetic Team Coaching Guide",
          category: "other",
          locator: "Page 2",
          page: 2,
          section: null,
          content: "Coach in private, soon after the behaviour.",
          similarity: 0.9,
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

vi.mock("@/lib/chat/person-memory-store", () => ({
  recallPeople: async (input: Record<string, unknown>) => {
    state.recallInput = input;
    return state.memory;
  },
}));

vi.mock("./call-claude", () => ({
  callClaude: async (input: Record<string, unknown>) => {
    state.claudeInput = input;
    return "Last time you mentioned she was late to open three times.";
  },
}));

const ACTOR = {
  role: "location_manager" as never,
  scope: { level: "location", primaryAreaId: "loc-0101", alsoCoversAreaIds: [] } as never,
};

const MEMORY = `WHAT THIS MANAGER TOLD YOU BEFORE

ABOUT SARAH TEST

Earlier conversation, 2026-10-03 — "Coaching form for Sarah Test". The manager wrote:
> She was late to open three times this week`;

async function ask(memory: { memoryOwnerId?: string } = { memoryOwnerId: "user-1" }) {
  const { answerQuestion } = await import("./server-ask");
  return answerQuestion(
    {
      question: "What should I do about Sarah Test now?",
      mode: "standard",
      history: [],
      scopeId: "bcs-core",
      conversationId: "conv_current",
      context: { userName: "Paulyne", locationName: "Synthetic Store", todayIso: "2026-10-20" },
    } as never,
    ACTOR,
    memory,
  );
}

beforeEach(() => {
  state.claudeInput = null;
  state.recallInput = null;
  state.memory = null;
  state.entities = { block: null, direct: null };
});

describe("what the manager told Bubbles before", () => {
  it("is recalled for the session's own user, leaving this conversation out", async () => {
    await ask();
    expect(state.recallInput).toMatchObject({
      userId: "user-1",
      question: "What should I do about Sarah Test now?",
      conversationId: "conv_current",
      userName: "Paulyne",
    });
  });

  it("is never recalled without an owner", async () => {
    await ask({});
    expect(state.recallInput).toBeNull();
    expect(state.claudeInput?.personMemory).toBeNull();
  });

  it("is never read for a pure Woven lookup, which is answered without the model", async () => {
    state.entities = { block: null, direct: { content: "Sarah Test is a Production Associate.", citations: [] } };
    await ask();
    expect(state.recallInput).toBeNull();
    expect(state.claudeInput).toBeNull();
  });

  it("reaches the model as its own block, with the rules for using it", async () => {
    state.memory = MEMORY;
    await ask();

    expect(state.claudeInput?.personMemory).toBe(MEMORY);
    expect(String(state.claudeInput?.grounding)).not.toContain("WHAT THIS MANAGER TOLD YOU BEFORE");
    const system = String(state.claudeInput?.system);
    expect(system).toContain("WHAT THE MANAGER TOLD YOU BEFORE");
    expect(system).toContain("earlier Ask Bubbles conversations");
    expect(system).toContain("not a verified record");
    expect(system).toContain("What the manager says now wins");
    expect(system).toContain("A first name can belong to more than one person");
    expect(system).not.toContain("Sunny");
  });

  it("never lets the memory stand in for the Woven records", async () => {
    state.memory = MEMORY;
    state.entities = { block: "VERIFIED RECORDS\n\nEmployee: Sarah Test — Woven job title: Production Associate.", direct: null };
    await ask();

    const system = String(state.claudeInput?.system);
    expect(system).toContain(
      "It never establishes anybody's job title, store assignment or employment status: those come only from a VERIFIED RECORDS section.",
    );
    expect(state.claudeInput?.verifiedRecords).toContain("Production Associate");
  });

  it("adds no rules when there is nothing to recall", async () => {
    await ask();
    expect(String(state.claudeInput?.system)).not.toContain("WHAT THE MANAGER TOLD YOU BEFORE");
  });
});
