import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { ChatFormProposal, ChatMessage } from "@/types";

vi.mock("@/config/company/locations", async () =>
  (await import("@/test/fixtures/reference-roster")).referenceRosterModule(),
);

/**
 * ============================================================================
 * A HIDDEN EPP OPENS NO CARD IN CHAT — QA DECISION, 26 OCT 2026
 * ============================================================================
 *
 * The six Employee Performance Plans came over from the sibling app and are
 * hidden here (`config/company/forms/hidden.ts`). This drives POST /api/chat
 * the way a District Manager — the role that holds `create_epp` — would ask
 * for one, in lowercase and sentence case, with the full remap on (production)
 * and off. Each turn must end the way the hidden interview forms do
 * (`hidden-form-no-card-oct25.test.ts`): "not published", and no card. The
 * name is invented.
 */

const store = {
  form_instances: [],
  form_instance_values: [],
  form_instance_events: [],
  form_template_versions: [],
  form_templates: [],
  form_template_current: [],
  form_template_assets: [],
  chat_conversations: [],
  chat_messages: [],
  chat_traces: [],
  chat_form_state: [],
} as unknown as FakeStore & Record<string, Record<string, unknown>[]>;

const bag = vi.hoisted(() => ({
  /** The extraction model's guess of the form when the remap reads the turn. */
  guess: "coaching" as string,
}));

vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin: () => fakeSupabase(store) }));
vi.mock("@/lib/api/respond", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/respond")>();
  return { ...actual, assertLiveMode: () => {}, assertNoConfigurationProblems: () => {}, assertWithinRateLimit: () => {} };
});
vi.mock("@/lib/config/server-env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config/server-env")>();
  return { ...actual, liveReadiness: () => ({ mode: "live", missing: [], problems: [], ready: true }) };
});
vi.mock("@/lib/auth/server", async () => {
  const { DEFAULT_PERMISSION_MATRIX, hasPermission } = await import("@/lib/permissions");
  const { AuthError } = await import("@/lib/auth/types");
  return {
    authorizeRequest: async (_request: Request, permission: string) => {
      if (!hasPermission(DEFAULT_PERMISSION_MATRIX, "district_manager" as never, permission as never)) {
        throw new AuthError("forbidden", "Your role does not have permission to do that.");
      }
      return {
        identity: {
          subject: "qa-manager",
          email: "qa-manager@example.test",
          displayName: "QA Manager",
          role: "district_manager",
          scope: { level: "location", primaryAreaId: "loc-0309", alsoCoversAreaIds: [] },
          verified: true,
        },
        permission,
        provider: "supabase",
      };
    },
  };
});
vi.mock("@/lib/analytics/record", () => ({
  openTurn: async () => "turn-qa",
  closeTurn: async () => {},
  recordActivity: async () => {},
  recordActivityAsync: () => {},
}));

vi.mock("@/lib/ai/call-claude", () => ({
  callClaude: async () => "A grounded answer.",
  callClaudeTool: async () => null,
  callClaudeToolDetailed: async () => ({
    input: { templateKey: bag.guess, employeeName: null, observation: null, actionPlan: null },
    inputTokens: 1,
    outputTokens: 1,
  }),
}));
vi.mock("@/lib/ai/anthropic", () => ({
  getAnthropicClient: () => ({ messages: { create: async () => ({ content: [] }) } }),
}));
vi.mock("@/lib/knowledge/providers/supabase", () => ({
  SupabaseKnowledgeProvider: class {
    async search() {
      return [];
    }
    async match() {
      return [];
    }
    async fetchRoleGrounding() {
      return { ok: false, failure: { code: "missing", detail: "not used", missingGroups: [] } };
    }
    async fetchOfficialPolicyManual() {
      return { ok: false, reason: "not needed" };
    }
  },
}));
vi.mock("@/lib/knowledge", () => ({
  getKnowledgeProvider: () => {
    throw new Error("not on the server");
  },
}));
vi.mock("@/lib/reporting/read/report-briefing", () => ({ loadReportBriefing: async () => null }));
vi.mock("@/lib/reporting/read/employee-facts", () => ({
  loadEmployeeFacts: async () => null,
  NO_EMPLOYEE_DATA_REASON: "no dataset",
  NO_EMPLOYEE_DATASET_REASON: "no dataset",
  EMPLOYEE_DATA_HEADING: "CURRENT EMPLOYEE PERFORMANCE DATA",
}));

process.env.NEXT_PUBLIC_DEMO_MODE = "false";

const { ensureTemplateLibrary } = await import("@/lib/forms/repository");
const chatRoute = await import("./route");

const saved = new Map<string, string | undefined>();

let sequence = 0;
function conversationId(): string {
  sequence += 1;
  return `conv_${Date.now().toString(36)}qa${String(sequence).padStart(3, "0")}`;
}

interface Turn {
  readonly user: string;
  /** This app's production reply with the same words, put into history in place of this harness's. */
  readonly recordedReply?: string;
}

/** Each turn through POST /api/chat, the browser's whole messages as history. */
async function replay(turns: readonly (Turn | string)[], id = conversationId()) {
  const messages: ChatMessage[] = [];
  const replies: { content: string; formProposal?: ChatFormProposal }[] = [];
  let proposal: ChatFormProposal | null = null;
  for (const [index, step] of turns.entries()) {
    const turn = typeof step === "string" ? { user: step } : step;
    const response = await chatRoute.POST(
      new Request("https://app.test/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: turn.user,
          mode: "standard",
          history: messages,
          questionMessageId: `msg_${Date.now().toString(36)}u${index}x`,
          conversationId: id,
          ...(proposal ? { continueProposalTemplateKey: proposal.templateKey } : {}),
        }),
      }),
    );
    const payload = (await response.json()) as { content: string; formProposal?: ChatFormProposal; error?: string };
    expect(response.status, JSON.stringify(payload)).toBe(200);
    replies.push(payload);
    if (payload.formProposal) proposal = payload.formProposal;
    messages.push(
      { id: `msg_${Date.now().toString(36)}u${index}x`, role: "user", content: turn.user, createdAt: "2026-10-24T20:00:00Z" } as ChatMessage,
      {
        id: `msg_${Date.now().toString(36)}a${index}x`,
        role: "assistant",
        content: turn.recordedReply ?? payload.content,
        createdAt: "2026-10-24T20:00:01Z",
        ...(payload.formProposal ? { formProposal: payload.formProposal } : {}),
      } as ChatMessage,
    );
  }
  return replies;
}

beforeEach(async () => {
  for (const key of Object.keys(store)) (store as Record<string, unknown[]>)[key] = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-26T16:00:00Z"));
  saved.set("FORM_FULL_REMAP_ENABLED", process.env.FORM_FULL_REMAP_ENABLED);
  bag.guess = "coaching";
  await ensureTemplateLibrary("system");
});
afterEach(() => {
  vi.useRealTimers();
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});


const NAME = "Rowan Placeholder";
const NOT_PUBLISHED = /not published/i;
const AN_EPP = /\bEPP\b|Performance Plan/i;
const A_CARD = /Here is the|I'll need a few details|To create a Training/i;

function remap(on: boolean) {
  if (on) process.env.FORM_FULL_REMAP_ENABLED = "true";
  else delete process.env.FORM_FULL_REMAP_ENABLED;
}

describe.each([
  ["full remap on (production)", true],
  ["full remap off", false],
])("a hidden EPP opens no card — %s", (_label, on) => {
  beforeEach(() => remap(on));

  it.each([
    `create an sdit epp for ${NAME}`,
    `Create an SDIT EPP for ${NAME}`,
    `do a tsd epp for ${NAME}`,
    `Do a TSD EPP for ${NAME}`,
    `create an fttc epp for ${NAME}`,
    `Create a DMIT EPP TSD review for ${NAME}`,
  ])("%s: not published, no EPP card", async (question) => {
    const [reply] = await replay([question]);
    expect(reply!.formProposal, reply!.content).toBeUndefined();
    expect(reply!.content).toMatch(NOT_PUBLISHED);
    expect(reply!.content).not.toMatch(A_CARD);
    // The forms listed instead name no plan.
    expect(reply!.content).not.toMatch(AN_EPP);
  });

  it("the hidden interview answers the same way (the outcome the plans now share)", async () => {
    const [reply] = await replay([`create a tanning consultant interview form for ${NAME}`]);
    expect(reply!.formProposal).toBeUndefined();
    expect(reply!.content).toMatch(NOT_PUBLISHED);
  });

  it("a name sent after the not-published reply still opens no card", async () => {
    const replies = await replay([`create an sdit epp for ${NAME}`, NAME]);
    expect(replies[1]!.formProposal?.templateKey ?? null).toBeNull();
    expect(replies[1]!.content).not.toMatch(A_CARD);
  });

  it.each(["what forms do we have?", "do we have an SDIT EPP?"])("the forms inventory, %s, lists no plan", async (question) => {
    const [reply] = await replay([question]);
    expect(reply!.formProposal).toBeUndefined();
    expect(reply!.content).not.toMatch(/SDIT EPP|TSD EPP|FTTC|DMIT|Performance Plan/i);
  });

  it("a stated SDIT role then 'make an EPP from this conversation' opens no plan", async () => {
    const replies = await replay([`${NAME} is an SDIT at Kearney and has been late several times.`, "make an EPP from this conversation"]);
    expect(replies[1]!.formProposal?.templateKey ?? null).toBeNull();
    expect(JSON.stringify(replies[1])).not.toMatch(/sdit-epp|tsd-epp|fttc-epp|dmit-epp/);
  });

  it("unchanged: a coaching form still makes its card", async () => {
    const [reply] = await replay([`create a coaching form for ${NAME} at Kearney, late to her shift on 10-20`]);
    expect(reply!.formProposal?.templateKey).toBe("coaching");
  });
});
