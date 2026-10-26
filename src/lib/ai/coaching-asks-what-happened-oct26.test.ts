import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { correctiveActionDocument } from "@/lib/forms/library";
import type { AccessScope, ChatMessage } from "@/types";

/**
 * COACHING_ASKS_WHAT_HAPPENED_ENABLED (QA, 26 Oct 2026, this app's tester on
 * path B, FORM_FULL_REMAP off): "coaching for <name>" with no offense stated
 * asked only the job title and never what happened, where a Corrective
 * Action says "You haven't told me what happened yet". Through
 * `answerQuestion` on path B, with the Coaching Form published; the model is
 * a stand-in that copies the manager's words; the name is invented.
 * Lowercase and sentence case.
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
    id: "tpl-coaching",
    key: "coaching",
    name: "Coaching Form",
    shortName: "Coaching",
    description: "A coaching conversation.",
    category: "hr_performance",
    layoutFamily: "coaching",
    requiredPermission: "create_coaching_form",
    active: true,
    displayOrder: 1,
    currentVersion: { id: "v-coaching", status: "published", variants: [] },
    draftVersion: null,
    versionCount: 1,
    activeAsset: null,
    assetCount: 0,
  },
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
  delete process.env.COACHING_ASKS_WHAT_HAPPENED_ENABLED;
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

const ASK = "You haven't told me what happened yet";
const BARE = ["coaching for devon harlan", "Coaching for devon harlan", "Coaching for Devon Harlan", "create a coaching form for devon harlan"];
const coach = (say: string) => ({ say, raw: { templateKey: "coaching", employeeName: "devon harlan" } });

describe("path B, COACHING_ASKS_WHAT_HAPPENED_ENABLED on", () => {
  beforeEach(() => {
    process.env.FORM_FULL_REMAP_ENABLED = "";
    process.env.COACHING_ASKS_WHAT_HAPPENED_ENABLED = "true";
  });

  it("a coaching card on a name alone asks what happened", async () => {
    for (const say of BARE) {
      const reply = await chat([coach(say)]);
      expect(reply.formProposal?.templateKey, say).toBe("coaching");
      expect(reply.content, say).toContain(ASK);
    }
  });

  it("an answer, or an account in the request, is never asked for again", async () => {
    const answered = await chat([coach("coaching for devon harlan"), coach("she skipped the 10 minute disinfect today")]);
    expect(answered.content).not.toContain(ASK);
    const told = await chat([coach("Coaching for Devon Harlan, she was late today")]);
    expect(told.content).not.toContain(ASK);
  });
});

describe("path B, COACHING_ASKS_WHAT_HAPPENED_ENABLED off", () => {
  it("the bare request never asks what happened (the reported bug)", async () => {
    process.env.FORM_FULL_REMAP_ENABLED = "";
    const reply = await chat([coach(BARE[0]!)]);
    expect(reply.formProposal?.templateKey).toBe("coaching");
    expect(reply.content).not.toContain(ASK);
  });
});
