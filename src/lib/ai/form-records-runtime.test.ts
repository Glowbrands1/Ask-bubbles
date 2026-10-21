import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ============================================================================
 * FORMS ON FILE REACH THE MODEL — AND THE CALLER'S IDENTITY REACHES THE READ
 * ============================================================================
 *
 * `forms/chat-form-records.test.ts` proves the gate, the visibility and the
 * block. This proves the orchestration: that `answerQuestion` loads the block
 * on a question about existing forms, passes the AUTHORIZED actor (not anything
 * from the request) to the read, hands the block and its rules to the model —
 * and that a question about a form on file is not turned into a proposal for a
 * new one.
 *
 * Ported from the reference platform; names and stores are synthetic.
 */

const state = vi.hoisted(() => ({
  claudeInput: null as Record<string, unknown> | null,
  loadCalls: [] as Record<string, unknown>[],
  proposalCalls: [] as string[],
  block: "FORMS ON FILE (FORMS REGISTER)\n\n- 2026-09-12 — Coaching Form; employee: Ellie Sendgraff",
}));

vi.mock("@/lib/config/server-env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/config/server-env")>()),
  liveReadiness: () => ({ mode: "live", missing: [], problems: [], ready: true }),
}));

vi.mock("./form-proposal", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./form-proposal")>()),
  proposeFormForTurn: async (turn: { question: string }) => {
    state.proposalCalls.push(turn.question);
    return null;
  },
  suggestFormsForTurn: () => null,
}));

vi.mock("@/lib/forms/repository", () => ({ listTemplateSummaries: async () => [] }));

vi.mock("@/lib/ai/entity-facts", () => ({ resolveChatEntities: async () => ({ block: null, direct: null }) }));

vi.mock("@/lib/chat/person-memory-store", () => ({ recallPeople: async () => null }));

vi.mock("@/lib/knowledge/providers/supabase", () => ({
  SupabaseKnowledgeProvider: class {
    readonly name = "test double";
    async match() {
      return [];
    }
    /*
     * The progression framework, present: "past corrective action form for
     * Marcus" also reads as a question about the ladder, which pins it.
     */
    async fetchRoleGrounding() {
      return {
        ok: true,
        grounding: {
          role: { id: "performance_management_framework" },
          documentId: "doc-progression",
          documentTitle: "Synthetic Performance Management Framework",
          matchedBy: "tag",
          rows: [],
          presentGroups: [],
        },
      };
    }
    async fetchNamedHandbook() {
      return { ok: false, reason: "none" };
    }
    async fetchOfficialPolicyManual() {
      return { ok: false, reason: "none" };
    }
  },
}));

vi.mock("@/lib/forms/chat-form-records", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/forms/chat-form-records")>()),
  loadFormRecords: async (input: Record<string, unknown>) => {
    state.loadCalls.push(input);
    return { block: state.block };
  },
}));

vi.mock("./call-claude", () => ({
  callClaude: async (input: Record<string, unknown>) => {
    state.claudeInput = input;
    return "Ellie has one finalized coaching form on file.";
  },
}));

const ACTOR = {
  role: "location_manager" as const,
  scope: { level: "location" as const, primaryAreaId: "loc-0101", alsoCoversAreaIds: [] as string[] },
  subject: "user-1",
  verified: true,
};

async function ask(question: string, history: unknown[] = []) {
  const { answerQuestion } = await import("./server-ask");
  return answerQuestion(
    {
      question,
      mode: "standard",
      history,
      scopeId: "bcs-core",
      context: { userName: "Paulyne", locationName: "Synthetic Store", todayIso: "2026-10-20" },
    } as never,
    ACTOR,
  );
}

beforeEach(() => {
  state.claudeInput = null;
  state.loadCalls = [];
  state.proposalCalls = [];
});

describe("a question about forms already on file", () => {
  it("reads the Forms Register as the authorized actor and sends the block with its rules", async () => {
    const answer = await ask("does employee ellie sendgraff have previous coachings", [
      { id: "m1", role: "user", content: "hi" },
      { id: "m2", role: "assistant", content: "Hello!" },
    ]);

    expect(state.loadCalls).toHaveLength(1);
    expect(state.loadCalls[0]).toMatchObject({
      actor: ACTOR,
      question: "does employee ellie sendgraff have previous coachings",
      previousQuestion: "hi",
      today: "2026-10-20",
    });

    expect(state.claudeInput?.formRecords).toBe(state.block);
    const system = String(state.claudeInput?.system);
    expect(system).toContain("FORMS ALREADY ON FILE");
    expect(system).toContain("You HAVE checked the Forms Register");
    expect(system).toMatch(/\d\. Forms on file — /);
    expect(system).not.toMatch(/salon|Form Monitoring|Sunny/i);
    // Grounded in a record, so no "the knowledge base does not cover this" banner.
    expect(answer.coverage).toBe("grounded");
  });

  it("does not read the Forms Register for an ordinary question", async () => {
    const answer = await ask("how do I coach someone on guest greetings?");

    expect(state.loadCalls).toHaveLength(0);
    expect(state.claudeInput?.formRecords).toBeNull();
    expect(String(state.claudeInput?.system)).not.toContain("FORMS ALREADY ON FILE");
    expect(answer.coverage).toBe("insufficient");
  });

  it.each(["does dana have a previous CA form", "past corrective action form for Marcus"])(
    "answers %s from the register, never with a proposal",
    async (question) => {
      await ask(question);

      expect(state.proposalCalls).toEqual([]);
      expect(state.loadCalls).toHaveLength(1);
      expect(state.claudeInput?.formRecords).toBe(state.block);
    },
  );

  it("still proposes the form when the sentence asks for one", async () => {
    await ask("Create a CA for Dana Moss, she's been coached before");

    expect(state.proposalCalls).toEqual(["Create a CA for Dana Moss, she's been coached before"]);
  });
});
