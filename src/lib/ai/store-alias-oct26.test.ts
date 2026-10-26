import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { correctiveActionDocument } from "@/lib/forms/library";
import type { AccessScope, ChatMessage } from "@/types";

/**
 * STORE_ALIAS_ENABLED (QA, Bubbles production, 25-26 Oct 2026): "dodge ne",
 * "dodge, ne" and "our dodge, ne store" named no store, so the card's Store
 * stayed Not set and there was no Create draft button; a bare store reply
 * under "Which store?" also became the Issue. Through `answerQuestion`, with
 * FORM_FULL_REMAP on (the remap card) and off (path B, as in production).
 * The model is a stand-in that copies the manager's words; the people are
 * invented. Every wording runs all lowercase and in sentence case.
 */

const TODAY = "2026-10-24";
const SCOPE: AccessScope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
const FLAGS = ["FORM_FULL_REMAP_ENABLED", "REMAP_INCIDENT_FIX_ENABLED"] as const;

const model = vi.hoisted(() => ({
  raw: {} as Record<string, unknown>,
  prompts: [] as { system: string; user: string }[],
}));

const LIBRARY = [
  {
    id: "tpl-dpoa",
    key: "dpoa",
    name: "Corrective Action Form",
    shortName: "CA",
    description: "A corrective action.",
    category: "hr_performance",
    layoutFamily: "corrective",
    requiredPermission: "create_corrective_action",
    active: true,
    displayOrder: 2,
    currentVersion: { id: "v-dpoa", status: "published", document: correctiveActionDocument(), variants: [] },
    draftVersion: null,
    versionCount: 1,
    activeAsset: null,
    assetCount: 0,
  },
];

vi.mock("@/lib/config/server-env", () => ({
  liveReadiness: () => ({ mode: "live", missing: [], problems: [], ready: true }),
  MissingConfigurationError: class MissingConfigurationError extends Error {
    missing: string[] = [];
  },
}));

vi.mock("@/lib/forms/repository", () => ({ listTemplateSummaries: async () => LIBRARY }));

vi.mock("@/lib/forms/employee-roster", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/forms/employee-roster")>()),
  loadScopedRoster: async () => [],
}));

vi.mock("@/lib/knowledge/providers/supabase", async () => {
  const { manualChunkFromRow } = await import("@/lib/knowledge/full-manual-load");
  const rows = (await import("@/test/fixtures/jba-manual-production-151.json")).default;
  return {
    SupabaseKnowledgeProvider: class {
      async match() {
        return [];
      }
      async fetchRoleGrounding() {
        return { ok: false, failure: { code: "missing", detail: "not used", missingGroups: [] } };
      }
      async fetchNamedHandbook() {
        return { ok: false, reason: "not used" };
      }
      async fetchOfficialPolicyManual() {
        return {
          ok: true as const,
          documentId: "doc-jba",
          documentTitle: "2025 JBA Policy Manual - Edited 5-2025",
          documentCategory: "policies_compliance",
          matchedBy: "fallback" as const,
          ownerConfirmed: true,
          chunks: (rows.chunks as Parameters<typeof manualChunkFromRow>[0][]).map(manualChunkFromRow),
        };
      }
    },
  };
});

vi.mock("./call-claude", () => ({
  callClaude: async () => "An answer.",
  callClaudeTool: async () => null,
  callClaudeToolDetailed: async (input: { system: string; messages: { content: string }[] }) => {
    model.prompts.push({ system: input.system, user: input.messages.map((message) => message.content).join("\n") });
    return { input: model.raw, inputTokens: 10, outputTokens: 10 };
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({ insert: async () => ({ error: null }) }),
  }),
}));


let answerQuestion: typeof import("./server-ask").answerQuestion;

beforeAll(async () => {
  ({ answerQuestion } = await import("./server-ask"));
  // The first import loads the whole answer path; a busy machine takes longer than the 10 s default.
}, 120_000);

beforeEach(() => {
  for (const flag of FLAGS) process.env[flag] = "true";
  model.raw = {};
  model.prompts.length = 0;
});

afterEach(() => {
  for (const flag of FLAGS) delete process.env[flag];
  delete process.env.STORE_ALIAS_ENABLED;
});

function raw(over: Record<string, unknown> = {}) {
  return { templateKey: "dpoa", employeeName: null, observation: null, actionPlan: null, ...over };
}

/** One chat: each manager turn, with the reply before it in the history. */
async function chat(turns: readonly { say: string; raw?: Record<string, unknown> }[]) {
  const history: ChatMessage[] = [];
  let last: Awaited<ReturnType<typeof answerQuestion>> | null = null;
  for (const [index, turn] of turns.entries()) {
    model.raw = raw(turn.raw);
    last = await answerQuestion(
      {
        question: turn.say,
        mode: "standard",
        history,
        scopeId: "bcs-core",
        questionMessageId: `msg-${index}`,
        continueProposalTemplateKey: last?.formProposal?.templateKey,
        context: { userName: "Pat Manager", locationName: "All stores", todayIso: TODAY },
      } as never,
      { role: "admin", scope: SCOPE, subject: undefined, verified: true } as never,
    );
    history.push(
      { id: `u-${index}`, role: "user", content: turn.say, createdAt: TODAY } as ChatMessage,
      { id: `a-${index}`, role: "assistant", content: last.content, createdAt: TODAY } as ChatMessage,
    );
  }
  return last!;
}

const DODGE = "loc-264";

function cased(text: string): string[] {
  const first = text.charAt(0).toUpperCase() + text.slice(1);
  return [text, first, first.replace("kira dunmore", "Kira Dunmore").replace(/dodge, ne|dodge ne/, (found) => found.replace("dodge", "Dodge").replace("ne", "NE"))];
}

for (const remap of [true, false]) {
  describe(`STORE_ALIAS_ENABLED on, FORM_FULL_REMAP ${remap ? "on" : "off (path B)"}`, () => {
    beforeEach(() => {
      process.env.STORE_ALIAS_ENABLED = "true";
      if (!remap) process.env.FORM_FULL_REMAP_ENABLED = "";
    });

    it("\"dodge, ne\" / \"dodge ne\" in the request is the Dodge store", async () => {
      for (const wording of [
        "create a ca for kira dunmore, she works at our dodge, ne store and was late today",
        "create a ca for kira dunmore at dodge ne, she was late today",
        "create a ca for kira dunmore, dodge ne location, she was late today",
      ]) {
        for (const say of cased(wording)) {
          const card = await chat([{ say, raw: { employeeName: "kira dunmore" } }]);
          expect(card.formProposal?.locationId, say).toBe(DODGE);
          expect(card.formProposal?.status, say).toBe("ready");
        }
      }
    });

    {
      it("a bare \"dodge, ne\" reply is the store, stays on the card, and is never the Issue", async () => {
        for (const reply of ["dodge, ne", "Dodge, NE", "dodge ne", "dodge"]) {
          const card = await chat([
            { say: "create a ca for kira dunmore, she was late today", raw: { employeeName: "kira dunmore" } },
            { say: reply },
          ]);
          expect(card.formProposal?.locationId, reply).toBe(DODGE);
          expect(card.formProposal?.issue ?? "", reply).not.toMatch(/dodge|omaha/i);
          expect(card.formProposal?.issue, reply).toMatch(/late today/);
        }
      });
    }
  });
}

describe("STORE_ALIAS_ENABLED off", () => {
  it("\"at dodge ne\" and \"dodge ne location\" name no store, and a bare \"dodge, ne\" reply is the Issue or no card (the reported bugs)", async () => {
    for (const say of ["create a ca for kira dunmore at dodge ne, she was late today", "create a ca for kira dunmore, dodge ne location, she was late today"]) {
      const card = await chat([{ say, raw: { employeeName: "kira dunmore" } }]);
      expect(card.formProposal?.locationId ?? null, say).toBeNull();
    }
    const remapCard = await chat([{ say: "create a ca for kira dunmore, she was late today", raw: { employeeName: "kira dunmore" } }, { say: "dodge, ne" }]);
    // Main (since 532e7f55) no longer reads the bare reply as the Issue; it still names no store.
    expect(remapCard.formProposal?.locationId ?? null).toBeNull();
    process.env.FORM_FULL_REMAP_ENABLED = "";
    const pathB = await chat([{ say: "create a ca for kira dunmore, she was late today", raw: { employeeName: "kira dunmore" } }, { say: "dodge, ne" }]);
    expect(pathB.formProposal ?? null).toBeNull();
  });
});

describe("STORE_ALIAS_ENABLED: a store the manager rules out, and a word that only looks like one (QA-6, 26 Oct 2026)", () => {
  const twins = (text: string) => [text, text.charAt(0).toUpperCase() + text.slice(1), text.toUpperCase()];

  it("a negated store reads exactly as with the flag off", async () => {
    const { withStoreAliases } = await import("./store-alias");
    const read = (question: string, on: boolean) => {
      process.env.STORE_ALIAS_ENABLED = on ? "true" : "";
      return withStoreAliases({ question, history: [] } as unknown as Parameters<typeof withStoreAliases>[0]).question;
    };
    for (const wording of [
      "kira dunmore was never at dodge",
      "she was not at dodge ne",
      "she is not at the dodge location",
      "kira dunmore isn't at kearney ne",
      "every store except bellevue ne",
    ]) {
      for (const say of twins(wording)) expect(read(say, true), say).toBe(read(say, false));
    }
    delete process.env.STORE_ALIAS_ENABLED;
  });

  it("only the store the manager means is rewritten", async () => {
    const { rosterNames } = await import("./store-alias");
    expect(rosterNames("it is not dodge, it is grand island ne")).toBe("it is not dodge, it is Grand Island NE");
    expect(rosterNames("It is not Dodge, it is Grand Island NE")).toBe("It is not Dodge, it is Grand Island NE");
  });

  it("\"in the dodge\" is not a store", async () => {
    const { rosterNames } = await import("./store-alias");
    for (const text of ["she left her keys in the dodge", "She left her keys in the Dodge", "SHE LEFT HER KEYS IN THE DODGE"]) {
      expect(rosterNames(text), text).toBe(text);
    }
    expect(rosterNames("she works at dodge")).toBe("she works at Omaha NE (West Dodge Rd)");
  });

  it("a bare \"dodge, ne\" as the first message, with no card waiting, is written as the store answer (disclosed)", async () => {
    const { rosterNames } = await import("./store-alias");
    expect(rosterNames("dodge, ne")).toBe("the store is Omaha NE (West Dodge Rd)");
  });
});
