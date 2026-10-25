import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { ChatFormProposal, ChatMessage } from "@/types";

vi.mock("@/config/company/locations", async () =>
  (await import("@/test/fixtures/reference-roster")).referenceRosterModule(),
);

/**
 * ============================================================================
 * A COACHING CONVERSATION BECAME A CORRECTIVE ACTION — 25 OCT 2026
 * ============================================================================
 *
 * The sibling app's QA round 12 chat, through POST /api/chat with this app's
 * live form path: the full remap (FORM_FULL_REMAP_ENABLED, on in production)
 * and WARNING_LEVEL_MANAGER_ONLY_ENABLED. The browser's messages go in whole
 * and the route's `parseHistory` drops each turn's `formProposal`.
 *
 *   T1 "Help me prepare for a coaching conversation."
 *   T2 "I have a Team Member that is not verifying documents are signed"
 *   T3 the documents (this app's own: the register count sheet, refund receipts)
 *   T4 "Can you create a coaching form and a policy review? I'd like to see both"
 *   T5 "Can you make it generic so if the problem occurs elsewhere it can be used for any Team Member?"
 *
 * The sibling app gave a Corrective Action card on T2–T5. The manager's turns
 * are that chat's own words with this app's wording; nobody was named. The
 * extraction model's reading was not recorded, so each case runs twice: the
 * model naming no form, and the model copying "Corrective Action Form" (dpoa).
 *
 * With FORM_CHOICE_STATED_ENABLED no turn is a Corrective Action. One turn
 * carries one card, so "a coaching form and a policy review … both" asks
 * which form to start with.
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

const bag = vi.hoisted(() => ({ modelForm: null as string | null }));

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
      if (!hasPermission(DEFAULT_PERMISSION_MATRIX, "location_manager" as never, permission as never)) {
        throw new AuthError("forbidden", "Your role does not have permission to do that.");
      }
      return {
        identity: {
          subject: "qa-manager",
          email: "qa-manager@example.test",
          displayName: "QA Manager",
          role: "location_manager",
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
  callClaudeTool: async (input: { tool?: { name?: string } }) => {
    if (input.tool?.name !== "record_intent_slots") return null;
    return {
      employee: null,
      store: null,
      title: null,
      incidentType: null,
      incidentDate: null,
      payrollAmount: null,
      warningLevel: null,
      formType: bag.modelForm,
      formTurn: true,
    };
  },
  callClaudeToolDetailed: async () => ({
    input: { templateKey: bag.modelForm, employeeName: null, observation: null, actionPlan: null, warningLevel: null },
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

const FLAGS = ["FORM_FULL_REMAP_ENABLED", "WARNING_LEVEL_MANAGER_ONLY_ENABLED"] as const;
const FLAG = "FORM_CHOICE_STATED_ENABLED";
const saved = new Map<string, string | undefined>();

let sequence = 0;
function conversationId(): string {
  sequence += 1;
  return `conv_${Date.now().toString(36)}cs${String(sequence).padStart(3, "0")}`;
}

interface Turn {
  readonly user: string;
  /** The extraction model's form for this turn. */
  readonly modelForm: string | null;
}

/** Each turn through POST /api/chat, the browser's whole messages as history. */
async function replay(turns: readonly Turn[], id = conversationId()) {
  const messages: ChatMessage[] = [];
  const replies: { content: string; formProposal?: ChatFormProposal }[] = [];
  let proposal: ChatFormProposal | null = null;
  for (const [index, turn] of turns.entries()) {
    bag.modelForm = turn.modelForm;
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
      { id: `msg_${Date.now().toString(36)}u${index}x`, role: "user", content: turn.user, createdAt: "2026-10-25T09:24:00Z" } as ChatMessage,
      {
        id: `msg_${Date.now().toString(36)}a${index}x`,
        role: "assistant",
        content: payload.content,
        createdAt: "2026-10-25T09:24:01Z",
        ...(payload.formProposal ? { formProposal: payload.formProposal } : {}),
      } as ChatMessage,
    );
  }
  return replies;
}

const PREPARE = "Help me prepare for a coaching conversation.";
const NOT_VERIFYING = "I have a Team Member that is not verifying documents are signed";
const DOCUMENTS = "The register count sheet and the refund receipts";
const BOTH = "Can you create a coaching form and a policy review? I'd like to see both";
const GENERIC = "Can you make it generic so if the problem occurs elsewhere it can be used for any Team Member?";

const conversation = (copied: string | null): Turn[] => [
  { user: PREPARE, modelForm: null },
  { user: NOT_VERIFYING, modelForm: copied },
  { user: DOCUMENTS, modelForm: copied },
  { user: BOTH, modelForm: copied },
  { user: GENERIC, modelForm: copied },
];

const OFFERS_CA = /Corrective Action Form/;

beforeEach(async () => {
  for (const key of Object.keys(store)) (store as Record<string, unknown[]>)[key] = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-25T09:24:00Z"));
  for (const name of [...FLAGS, FLAG]) saved.set(name, process.env[name]);
  for (const name of FLAGS) process.env[name] = "true";
  delete process.env[FLAG];
  bag.modelForm = null;
  await ensureTemplateLibrary("system");
});
afterEach(() => {
  vi.useRealTimers();
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("a coaching conversation on Ask Bubbles' live path (full remap)", { timeout: 60_000 }, () => {
  it.each([
    ["the model naming no form", null],
    ["the model copying Corrective Action Form", "dpoa"],
  ] as const)("FORM_CHOICE_STATED on: no turn is a Corrective Action (%s)", async (_name, copied) => {
    process.env[FLAG] = "true";
    const turns = conversation(copied);
    const replies = await replay(turns);
    for (const [index, reply] of replies.entries()) {
      expect(reply.formProposal?.templateKey ?? null, turns[index]!.user).not.toBe("dpoa");
      expect(reply.content, turns[index]!.user).not.toMatch(OFFERS_CA);
    }
    // T1 and T2: a coaching path or a question.
    for (const reply of replies.slice(0, 2)) {
      expect([null, "coaching"]).toContain(reply.formProposal?.templateKey ?? null);
    }
    // T4: one turn carries one card, so the manager is asked which to start with.
    const both = replies[3]!;
    expect(both.formProposal ?? null).toBeNull();
    expect(both.content).toMatch(/Coaching Form/);
    expect(both.content).toMatch(/Policy Review/);
    expect(both.content).toMatch(/which form should I start with/i);
  });

  it("FORM_CHOICE_STATED on: the manager picks one, it stays, and the other comes when asked for", async () => {
    process.env[FLAG] = "true";
    const replies = await replay([
      ...conversation("dpoa").slice(0, 4),
      { user: "The coaching form", modelForm: "dpoa" },
      { user: GENERIC, modelForm: "dpoa" },
      { user: "Now the policy review", modelForm: "dpoa" },
    ]);
    expect(replies.slice(4).map((reply) => reply.formProposal?.templateKey ?? null)).toEqual([
      "coaching",
      "coaching",
      "policy-review",
    ]);
  });

  it("FORM_CHOICE_STATED off: T4 shows only one of the two forms it asked for", async () => {
    const replies = await replay(conversation("dpoa"));
    expect(replies[3]!.formProposal?.templateKey).toBe("policy-review");
  });
});
