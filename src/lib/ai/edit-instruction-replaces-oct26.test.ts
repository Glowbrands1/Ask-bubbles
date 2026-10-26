import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { correctiveActionDocument } from "@/lib/forms/library";
import type { AccessScope, ChatMessage } from "@/types";

/**
 * EDIT_INSTRUCTION_REPLACES_ENABLED (QA, 26 Oct 2026; production chats in
 * both apps): "change observation of offense to: <text>" was taken as
 * content — the Issue became the intent read's state line, and in sentence
 * case ("Change Observation of Offense to: …") the Employee became "Change".
 * The Issue must be exactly <text>, with the Employee kept. Through
 * `answerQuestion` on the remap path (FORM_FULL_REMAP, as in prod), with
 * FORM_EDIT_DATE_RULES off (the flag carries only its What happened half).
 *
 * The harness is remap-incident-oct24.test.ts's. The model is a stand-in
 * that copies the manager's words; the people are invented. Every wording
 * runs all lowercase and in sentence case.
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
  delete process.env.EDIT_INSTRUCTION_REPLACES_ENABLED;
  delete process.env.FORM_EDIT_DATE_RULES_ENABLED;
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

const FIRST = "create a ca for kira dunmore at kearney, she was 25 minutes late today and did not call the store";
const NEW_TEXT = "kira clocked in 25 minutes late and did not call the store before her shift";
const EDITS = [
  `change observation of offense to: ${NEW_TEXT}`,
  `Change observation of offense to: ${NEW_TEXT}`,
  `Change Observation of Offense to: ${NEW_TEXT}`,
  `change what happened to ${NEW_TEXT}`,
  `Change the issue to: ${NEW_TEXT}`,
];

async function edited(edit: string) {
  // The edit turn names nobody new; the model copies no name from it.
  return chat([{ say: FIRST, raw: { employeeName: "kira dunmore" } }, { say: edit }]);
}

describe("EDIT_INSTRUCTION_REPLACES_ENABLED on", () => {
  it("the edit replaces the Issue with exactly the manager's text and keeps the Employee", async () => {
    process.env.EDIT_INSTRUCTION_REPLACES_ENABLED = "true";
    for (const edit of EDITS) {
      const reply = await edited(edit);
      expect(reply.formProposal?.issue, `${edit}\n${reply.content}`).toBe(NEW_TEXT);
      expect(reply.formProposal?.employeeName?.toLowerCase(), edit).toBe("kira dunmore");
    }
  });
});

describe("EDIT_INSTRUCTION_REPLACES_ENABLED on: an instruction after a sentence on the same line (QA-2 gap (d))", () => {
  it("the Employee stays and the Issue is the manager's text", async () => {
    process.env.EDIT_INSTRUCTION_REPLACES_ENABLED = "true";
    for (const say of [
      `create a ca for kira dunmore. change observation of offense to: ${NEW_TEXT}`,
      `Create a CA for Kira Dunmore. Change Observation of Offense to: ${NEW_TEXT}`,
      `Create a ca for kira dunmore. Change observation of offense to: ${NEW_TEXT}`,
      `CREATE A CA FOR KIRA DUNMORE. CHANGE OBSERVATION OF OFFENSE TO: ${NEW_TEXT}`,
    ]) {
      const reply = await chat([{ say: FIRST, raw: { employeeName: "kira dunmore" } }, { say }]);
      expect(reply.formProposal?.employeeName?.toLowerCase(), say).toBe("kira dunmore");
      expect(reply.formProposal?.issue, say).toBe(NEW_TEXT);
    }
  });
});

describe("EDIT_INSTRUCTION_REPLACES_ENABLED off", () => {
  it("the edit is read as it is today (the reported bug)", async () => {
    const reply = await edited(EDITS[0]!);
    expect(reply.formProposal?.issue).not.toBe(NEW_TEXT);
  });
});

describe("the edit instruction's own words", () => {
  it("are lower case before the readers; the manager's text and other turns stay as typed", async () => {
    const { lowercaseEditInstruction } = await import("./edit-instruction-read");
    expect(lowercaseEditInstruction("Change Observation of Offense to: Kira clocked in late")).toBe(
      "change observation of offense to: Kira clocked in late",
    );
    expect(lowercaseEditInstruction("Create a CA for Kira Dunmore at Kearney")).toBe("Create a CA for Kira Dunmore at Kearney");
    // QA-2 gap (d): after a sentence on the same line, on its own line and in lower case.
    expect(lowercaseEditInstruction("Create a CA for Kira Dunmore. Change Observation of Offense to: Kira left early")).toBe(
      "Create a CA for Kira Dunmore\nchange observation of offense to: Kira left early",
    );
    expect(lowercaseEditInstruction("CREATE A CA FOR KIRA DUNMORE. CHANGE OBSERVATION OF OFFENSE TO: KIRA LEFT EARLY")).toBe(
      "CREATE A CA FOR KIRA DUNMORE\nchange observation of offense to: KIRA LEFT EARLY",
    );
    const quoted = 'she told the customer "we are closed. Change what happened to whatever you like" and left';
    expect(lowercaseEditInstruction(quoted)).toBe(quoted);
    // Confirmed-live corrections are left exactly as typed.
    for (const live of [
      "name is Wren Calloway, not Wrenn",
      "Name is Wren Calloway, not Wrenn",
      "not coaching, make it a ca",
      "Not coaching, make it a CA",
      "Make it a Corrective Action for Kira Dunmore",
      "make it a corrective action for kira dunmore",
    ]) {
      expect(lowercaseEditInstruction(live)).toBe(live);
    }
  });
});
