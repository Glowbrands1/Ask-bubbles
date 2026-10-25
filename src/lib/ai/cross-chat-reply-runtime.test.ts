import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ============================================================================
 * OTHER CHATS IN THE REPLY TEXT — THE LIVE ANSWER PATH
 * ============================================================================
 *
 * `answerQuestion` with the providers mocked and the model returning the
 * reply production gave in conv_mvmo31du2s97yka ("last time you told me about
 * Test Employee, it was at Dodge, NE and then Kearney"), and the Ask Sunny
 * replies ported with invented people. CROSS_CHAT_REPLY_GUARD_ENABLED on: the
 * recall is asked to guard, the prompt carries the rule, and the sentences
 * claiming the manager said it in another chat are taken out while every
 * other word stays. Off: exactly as production today.
 */

const state = vi.hoisted(() => ({
  claudeInput: null as Record<string, unknown> | null,
  recallInput: null as Record<string, unknown> | null,
  memory: null as string | null,
  reply: "",
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
    return state.reply;
  },
}));

const ACTOR = {
  role: "location_manager" as never,
  scope: { level: "location", primaryAreaId: "loc-0101", alsoCoversAreaIds: [] } as never,
};

const GRAND_ISLAND = "Test Employee at Grand Island out of dress code 3 shifts, coached on 2nd";

const REPLY_GRAND_ISLAND = `Good context to flag: last time you told me about Test Employee, it was at Dodge, NE and then Kearney — different locations for different incidents. Now you're naming Grand Island, NE, which VERIFIED RECORDS confirms is Store 236. If this is a separate, third incident, that's fine — just confirming it's not a mix-up, since the location differs from what you told me before.

On the substance: three shifts out of dress code with coaching already given on the second is exactly the kind of pattern the framework says shouldn't stay informal.`;

const REPLY_AUG_26 = `I'm not sure what you're after — that came through as a stray keystroke. (You sent the same thing back on August 26, so if there was a real question behind it, it didn't make it through either time.)

Tell me what you need and I'll take it from there.`;

const MEMORY = `WHAT THIS MANAGER TOLD YOU BEFORE

ABOUT TEST EMPLOYEE

Earlier conversation, 2026-10-24 — "CA for Test Employee at Kearney". The manager wrote:
> CA for Test Employee at Kearney, out of dress code 10/11`;

async function ask(question: string, history: { role: string; content: string }[] = []) {
  const { answerQuestion } = await import("./server-ask");
  return answerQuestion(
    {
      question,
      mode: "standard",
      history,
      scopeId: "bcs-core",
      conversationId: "conv_current",
      context: { userName: "Rosalyn", locationName: "Synthetic Store", todayIso: "2026-10-24" },
    } as never,
    ACTOR,
    { memoryOwnerId: "user-1" },
  );
}

const saved = process.env.CROSS_CHAT_REPLY_GUARD_ENABLED;

// The first import of server-ask is the slow part; under load it alone passed 5s.
beforeAll(async () => {
  await import("./server-ask");
}, 60_000);

beforeEach(() => {
  state.claudeInput = null;
  state.recallInput = null;
  state.memory = null;
  state.reply = "";
  state.entities = { block: null, direct: null };
});

afterEach(() => {
  if (saved === undefined) delete process.env.CROSS_CHAT_REPLY_GUARD_ENABLED;
  else process.env.CROSS_CHAT_REPLY_GUARD_ENABLED = saved;
});

describe("CROSS_CHAT_REPLY_GUARD_ENABLED on the live answer path", () => {
  it('"last time you told me about Test Employee, it was at Dodge, NE and then Kearney" does not reach the manager', async () => {
    process.env.CROSS_CHAT_REPLY_GUARD_ENABLED = "true";
    state.reply = REPLY_GRAND_ISLAND;
    state.memory = MEMORY;

    const response = await ask(GRAND_ISLAND);

    expect(response.content).not.toMatch(/last time you told me|Dodge|Kearney|what you told me before/i);
    expect(response.content).toContain("Now you're naming Grand Island, NE, which VERIFIED RECORDS confirms is Store 236.");
    expect(response.content).toContain("On the substance: three shifts out of dress code");
    expect(state.recallInput).toMatchObject({ crossChatGuard: true });
    expect(typeof state.recallInput?.roster).toBe("function");
    const system = String(state.claudeInput?.system);
    expect(system).toContain("OTHER CONVERSATIONS");
    expect(system).toContain("Never tell the manager they raised, said, sent, asked or mentioned something in another conversation");
    expect(system).not.toContain("Last time you mentioned that");
  });

  it('"You sent the same thing back on August 26" does not reach the manager after "asdasd"', async () => {
    process.env.CROSS_CHAT_REPLY_GUARD_ENABLED = "true";
    state.reply = REPLY_AUG_26;

    const response = await ask("asdasd");

    expect(response.content).not.toMatch(/you sent|August 26/i);
    expect(response.content).toContain("I'm not sure what you're after — that came through as a stray keystroke.");
    expect(response.content).toContain("Tell me what you need and I'll take it from there.");
  });

  it("leaves the reply alone when the manager refers back to the earlier chat", async () => {
    process.env.CROSS_CHAT_REPLY_GUARD_ENABLED = "true";
    state.reply = REPLY_GRAND_ISLAND;

    const response = await ask("Test Employee is out of dress code again, same as last time");

    expect(response.content).toContain("last time you told me about Test Employee");
  });

  it("off, the reply and the recall are exactly as before", async () => {
    delete process.env.CROSS_CHAT_REPLY_GUARD_ENABLED;
    state.reply = REPLY_GRAND_ISLAND;
    state.memory = MEMORY;

    const response = await ask(GRAND_ISLAND);

    expect(response.content).toContain("last time you told me about Test Employee, it was at Dodge, NE and then Kearney");
    expect(state.recallInput).not.toHaveProperty("crossChatGuard");
    expect(String(state.claudeInput?.system)).not.toContain("OTHER CONVERSATIONS");
    expect(String(state.claudeInput?.system)).toContain("Last time you mentioned that");
  });
  /*
   * QA, second pass: a reply made of nothing but QA's two live carryover
   * sentences (verbatim) comes back as the neutral line, and the removal is
   * logged by count — never by the manager's words.
   */
  const ONLY_CARRYOVER =
    "Your last two write-ups for this name were at Empire, SD and Dodge, NE. This would be a third documented issue for Test Employee that you've told me about — a verbal for the Dodge, NE attendance/no-call issue (10-20-26) and a verbal for the Empire, SD puppy visit (10-22-26).";
  const EMPIRE_TURN =
    "do verbal for team member Test Employee at empire, sd. payroll deduct does not apply. previous coaching jba manual 11-1-26. on 10-22-26 Test was not scheduled to work and came into the store to show her team her new puppy. Test was in the store 45 min";

  it("a reply that was only other chats comes back as the neutral line, and is logged", async () => {
    process.env.CROSS_CHAT_REPLY_GUARD_ENABLED = "true";
    state.reply = ONLY_CARRYOVER;
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      const response = await ask(EMPIRE_TURN);
      expect(response.content).toBe("Tell me what happened in this case and I'll help from there.");
      const logged = info.mock.calls.map((call) => String(call[0])).filter((line) => line.includes("reply.cross_chat.removed"));
      expect(logged.map((line) => JSON.parse(line))).toEqual([
        { event: "reply.cross_chat.removed", sentences: 2, neutral: true },
      ]);
      expect(logged.join("")).not.toContain("Empire");
    } finally {
      info.mockRestore();
    }
  });

  it("off, that reply reaches the manager exactly as written", async () => {
    delete process.env.CROSS_CHAT_REPLY_GUARD_ENABLED;
    state.reply = ONLY_CARRYOVER;

    const response = await ask(EMPIRE_TURN);

    expect(response.content).toBe(ONLY_CARRYOVER);
  });
});
