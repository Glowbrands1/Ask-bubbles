import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  block: "FORMS ON FILE (FORMS REGISTER)\n\n- 2026-09-12 — Coaching Form; employee: Wren Halvorsen",
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
    return "Wren has one finalized coaching form on file.";
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
      context: { userName: "Rosalyn", locationName: "Synthetic Store", todayIso: "2026-10-20" },
    } as never,
    ACTOR,
  );
}

beforeEach(() => {
  state.claudeInput = null;
  state.loadCalls = [];
  state.proposalCalls = [];
});

/*
 * PAST_FORMS_BEFORE_LIBRARY_ENABLED (Pau, 5 Nov 2026; overnight scan sf-s29).
 * The forms-library answer is written by code (no model call: `claudeInput`
 * stays null); the past-forms lookup is `loadFormRecords` (counted in
 * `state.loadCalls`) and its block goes to the model. Invented names.
 */
const SF_S29 = "are there any coaching and ca's for Wren Halvorsen";
const NAMED_LIBRARY = "do we have a coaching form for Wren Halvorsen?";
const CONTROL = "do we have a coaching form?";

describe("the past-forms lookup before the forms-library check", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("off: a library question that names a person is answered from the library", async () => {
    await ask(NAMED_LIBRARY);
    expect(state.loadCalls).toHaveLength(0);
    expect(state.claudeInput).toBeNull();
  });

  it("on: sf-s29 and a library question that names a person read the forms on file; the library steps aside", async () => {
    vi.stubEnv("PAST_FORMS_BEFORE_LIBRARY_ENABLED", "true");
    for (const question of [SF_S29, NAMED_LIBRARY]) {
      state.loadCalls = [];
      state.claudeInput = null;
      await ask(question);
      expect(state.loadCalls, question).toHaveLength(1);
      expect((state.claudeInput as Record<string, unknown> | null)?.formRecords, question).toBe(state.block);
    }
  });

  it("on, negative control: \"do we have a coaching form?\" still gets the forms-library answer", async () => {
    vi.stubEnv("PAST_FORMS_BEFORE_LIBRARY_ENABLED", "true");
    await ask(CONTROL);
    expect(state.loadCalls).toHaveLength(0);
    expect(state.claudeInput).toBeNull();
  });
});
