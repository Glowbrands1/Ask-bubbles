import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ============================================================================
 * A REQUIRED DOCUMENT THAT COULD NOT BE READ vs ONE THAT IS NOT THERE
 * ============================================================================
 *
 * A pinned rule document configured to REFUSE the turn when unavailable used
 * to give the same answer for both: "this document is unavailable — ask an
 * administrator", with no Retry. A momentary database error on that lookup
 * now raises the same retryable `retrieval_failed` as a failed search; a
 * document that is genuinely missing still refuses with its configured
 * wording. In neither case is the model called, so nothing is answered from
 * memory.
 */

const state = vi.hoisted(() => ({
  failure: "role_document_query_failed" as string,
  modelCalls: 0,
}));

vi.mock("@/config/company/knowledge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/config/company/knowledge")>()),
  NAMED_HANDBOOK: null,
  PINNED_KNOWLEDGE_ROLES: [
    {
      role: { id: "fixture_rules", tag: "fixture-rules", fallbackFilenames: [], fallbackTitles: [], ruleGroups: [], maxMandatoryChunks: 4 },
      triggers: [/\bclosing\b/i],
      onUnavailable: "refuse",
      unavailableMessage: "The closing rules are unavailable. Ask an administrator.",
    },
  ],
}));

vi.mock("@/lib/config/server-env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/config/server-env")>()),
  liveReadiness: () => ({ mode: "live", missing: [], problems: [], ready: true }),
}));

vi.mock("@/lib/knowledge/providers/supabase", () => ({
  SupabaseKnowledgeProvider: class {
    async match() {
      return [];
    }
    async fetchRoleGrounding() {
      return { ok: false, failure: { code: state.failure, detail: "fixture" } };
    }
    async fetchNamedHandbook() {
      return null;
    }
  },
}));

vi.mock("@/lib/ai/call-claude", () => ({
  callClaude: async () => {
    state.modelCalls += 1;
    return "An answer from memory.";
  },
}));
vi.mock("@/lib/forms/repository", () => ({ listTemplateSummaries: async () => [] }));

const { answerQuestion } = await import("./server-ask");

const ask = () =>
  answerQuestion(
    {
      question: "what are the closing rules?",
      mode: "standard",
      history: [],
      scopeId: "bcs-core",
      context: { userName: "Dana Reyes", locationName: "Example Location 101", todayIso: "2026-10-08" },
    } as never,
    { role: "location_manager" as never, scope: { level: "location", primaryAreaId: "loc-0101", alsoCoversAreaIds: [] } } as never,
  );

beforeEach(() => {
  state.modelCalls = 0;
});

describe("a pinned document's lookup failing", () => {
  it.each(["role_document_query_failed", "role_chunk_query_failed"])(
    "%s is a retryable retrieval failure, and the model is never called",
    async (code) => {
      state.failure = code;
      await expect(ask()).rejects.toMatchObject({ code: "retrieval_failed", status: 502 });
      expect(state.modelCalls).toBe(0);
    },
  );

  it.each(["role_document_not_found", "role_document_ambiguous", "incomplete_rule_groups"])(
    "%s still refuses with the configured wording, uncited and without the model",
    async (code) => {
      state.failure = code;
      const response = await ask();
      expect(response.content).toBe("The closing rules are unavailable. Ask an administrator.");
      expect(response.citations).toEqual([]);
      expect(response.coverage).toBe("insufficient");
      expect(state.modelCalls).toBe(0);
    },
  );
});
