import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { ChatFormProposal, ChatMessage } from "@/types";

/**
 * ============================================================================
 * THE ACTION PLAN IS THE MANAGER'S, OR BLANK — ASK BUBBLES' LIVE PATH
 * ============================================================================
 *
 * Pau, 25 Oct 2026: when the manager typed no action plan, the form's Action
 * Plan stays blank, with no standard or boilerplate sentence. A plan the
 * manager typed is kept word for word. ACTION_PLAN_MANAGER_ONLY_ENABLED.
 *
 * The C-list turn from QA B5 (conv_mvnmf1ik2lqkfld), word for word, through
 * POST /api/chat with this app's production form path: the full remap
 * (FORM_FULL_REMAP_ENABLED) and the two-sentence plan
 * (ACTION_PLAN_SENTENCES_ENABLED) on, the shipped store roster. Production's
 * reply on that turn carried the remap model's own summary as the plan:
 * "**Action plan:** Meet the woven deadline". The form-proposal card (the
 * remap off), which prints "Management will review … Future policy violations
 * …", is run as a guard. The form's own Action Plan line is covered by
 * `src/app/api/forms/action-plan-manager-only-e2e.test.ts`.
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
  /** The remap model's own action plan summary. Production's reply on this turn: "Meet the woven deadline". */
  remapPlan: null as string | null,
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
      if (!hasPermission(DEFAULT_PERMISSION_MATRIX, "location_manager" as never, permission as never)) {
        throw new AuthError("forbidden", "Your role does not have permission to do that.");
      }
      return {
        identity: {
          subject: "qa-manager",
          email: "qa-manager@example.test",
          displayName: "QA Manager",
          role: "location_manager",
          scope: { level: "location", primaryAreaId: "loc-66", alsoCoversAreaIds: [] },
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

/** The form a manager turn names, as the extraction model copies it. */
function namedForm(text: string): string | null {
  if (/policy review/i.test(text)) return "policy-review";
  if (/\bexit\b/i.test(text)) return null;
  if (/\b(?:ca|corrective action)\b/i.test(text)) return "dpoa";
  return null;
}

vi.mock("@/lib/ai/call-claude", () => ({
  callClaude: async () => "A grounded answer.",
  callClaudeTool: async (input: { tool?: { name?: string }; messages?: { content?: unknown }[] }) => {
    if (input.tool?.name !== "record_intent_slots") return null;
    // The slots as the extraction model copies them from the manager's words.
    const text = JSON.stringify(input.messages ?? []);
    const named = /test employee/i.test(text);
    return {
      employee: named ? "Test Employee" : null,
      store: /kearney/i.test(text) ? "Kearney" : null,
      title: null,
      incidentType: /woven deadline/i.test(text) ? "missing the 10-15-26 woven deadline" : null,
      incidentDate: /10-15-26/.test(text) ? "10-15-26" : null,
      payrollAmount: null,
      warningLevel: /\bwritten\b/i.test(text) ? "written" : null,
      formType: /\bCA\b/.test(text) ? "written CA" : null,
      formTurn: true,
    };
  },
  callClaudeToolDetailed: async (input: { messages?: { content?: unknown }[] }) => {
    const text = JSON.stringify(input.messages ?? []);
    const last = text.split(/Manager:|User:/i).pop() ?? text;
    return {
      input: {
        templateKey: namedForm(last),
        employeeName: /test employee/i.test(text) ? "Test Employee" : null,
        observation: null,
        actionPlan: bag.remapPlan,
        warningLevel: /\bwritten\b/i.test(text) ? "written" : null,
      },
      inputTokens: 1,
      outputTokens: 1,
    };
  },
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


const PROD_FLAGS = ["FORM_FULL_REMAP_ENABLED", "ACTION_PLAN_SENTENCES_ENABLED"] as const;
const REMAP = "FORM_FULL_REMAP_ENABLED";
/* Off in production here (chat_traces, 24 Oct 2026). */
const INTENT = "INTENT_EXTRACTION_ENABLED";
const FLAG = "ACTION_PLAN_MANAGER_ONLY_ENABLED";
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
      { id: `msg_${Date.now().toString(36)}u${index}x`, role: "user", content: turn.user, createdAt: "2026-10-25T20:00:00Z" } as ChatMessage,
      {
        id: `msg_${Date.now().toString(36)}a${index}x`,
        role: "assistant",
        content: turn.recordedReply ?? payload.content,
        createdAt: "2026-10-25T20:00:01Z",
        ...(payload.formProposal ? { formProposal: payload.formProposal } : {}),
      } as ChatMessage,
    );
  }
  return replies;
}


/* QA B5, conv_mvnmf1ik2lqkfld — the C-list turn, word for word. */
const C_LIST = "create a written CA for Test Employee at Kearney for missing the 10-15-26 woven deadline";
const MANAGER_PLAN = "complete the Woven policy module by 10-30-26 and review it with her manager";
const CONTROL = `${C_LIST}. action plan: ${MANAGER_PLAN}`;
/* Production's remap reply on the C-list turn. */
const PRODUCTION_PLAN = "Meet the woven deadline";
/* What the remap model writes for the control turn: a rewrite of the manager's plan. */
const REWRITTEN_PLAN = "Complete the Woven policy module";

const STANDARD_REVIEW = /Management will review\b/;
const STANDARD_CLOSING =
  "Future policy violations may result in additional corrective action up to and including termination of employment.";
const planLines = (content: string) => content.split("\n").filter((line) => /\*\*Action plan:?\*\*/i.test(line));

beforeEach(async () => {
  for (const key of Object.keys(store)) (store as Record<string, unknown[]>)[key] = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-25T20:00:00Z"));
  for (const name of [...PROD_FLAGS, INTENT, FLAG]) saved.set(name, process.env[name]);
  for (const name of PROD_FLAGS) process.env[name] = "true";
  delete process.env[INTENT];
  delete process.env[FLAG];
  bag.remapPlan = null;
  await ensureTemplateLibrary("system");
});
afterEach(() => {
  vi.useRealTimers();
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("acceptance: Action Plan manager-only on Ask Bubbles' live path (the full remap)", () => {
  it("flag off: the C-list turn's card prints the model's plan, as production did (unchanged)", async () => {
    bag.remapPlan = PRODUCTION_PLAN;
    const [reply] = await replay([C_LIST]);
    expect(reply!.formProposal?.templateKey).toBe("dpoa");
    expect(planLines(reply!.content)).toEqual([`**Action plan:** ${PRODUCTION_PLAN}`]);
  });

  it("flag on: the C-list turn's card has no Action Plan at all", async () => {
    process.env[FLAG] = "true";
    bag.remapPlan = PRODUCTION_PLAN;
    const [reply] = await replay([C_LIST]);
    expect(reply!.formProposal?.templateKey).toBe("dpoa");
    expect(reply!.formProposal?.employeeName).toBe("Test Employee");
    expect(planLines(reply!.content)).toEqual([]);
    expect(reply!.content).not.toContain(PRODUCTION_PLAN);
    expect(reply!.content).not.toMatch(STANDARD_REVIEW);
    expect(reply!.content).not.toContain(STANDARD_CLOSING);
  });

  it("flag on, control: the plan the manager typed is the Action Plan, word for word", async () => {
    process.env[FLAG] = "true";
    bag.remapPlan = REWRITTEN_PLAN;
    const [reply] = await replay([CONTROL]);
    expect(reply!.formProposal?.templateKey).toBe("dpoa");
    expect(planLines(reply!.content)).toEqual([`**Action plan:** ${MANAGER_PLAN}`]);
  });

  it("flag on, control as a second turn: the typed plan is kept and nothing else is added", async () => {
    process.env[FLAG] = "true";
    bag.remapPlan = PRODUCTION_PLAN;
    const replies = await replay([C_LIST, `action plan: ${MANAGER_PLAN}`]);
    expect(planLines(replies[0]!.content)).toEqual([]);
    expect(planLines(replies[1]!.content)).toEqual([`**Action plan:** ${MANAGER_PLAN}`]);
  });

  it("flag off, control: today the remap prints its own rewrite of the typed plan (what the flag changes)", async () => {
    bag.remapPlan = REWRITTEN_PLAN;
    const [reply] = await replay([CONTROL]);
    expect(planLines(reply!.content)).toEqual([`**Action plan:** ${REWRITTEN_PLAN}`]);
  });
});

/*
 * The card proposeFormForTurn writes, where the remap does not answer: it
 * prints "**Action plan:** Management will review … Future policy violations
 * …" when ACTION_PLAN_SENTENCES_ENABLED is on. That module is protected, so
 * the plan rule runs as answerQuestion's last step. The intent read hands its
 * turns to the same card.
 */
describe("guard: Action Plan manager-only on the form-proposal card (the remap off)", () => {
  beforeEach(() => {
    delete process.env[REMAP];
  });

  it("flag off: the card prints the standard two-sentence plan (unchanged)", async () => {
    const [reply] = await replay([C_LIST]);
    expect(reply!.formProposal?.templateKey).toBe("dpoa");
    expect(reply!.content).toMatch(STANDARD_REVIEW);
    expect(reply!.content).toContain(STANDARD_CLOSING);
  });

  it("flag on: no Action Plan on the card", async () => {
    process.env[FLAG] = "true";
    const [reply] = await replay([C_LIST]);
    expect(reply!.formProposal?.templateKey).toBe("dpoa");
    expect(planLines(reply!.content)).toEqual([]);
    expect(reply!.content).not.toMatch(STANDARD_REVIEW);
    expect(reply!.content).not.toContain(STANDARD_CLOSING);
  });

  it("flag on, control: the manager's plan, word for word, and not the standard sentences", async () => {
    process.env[FLAG] = "true";
    const [reply] = await replay([CONTROL]);
    expect(planLines(reply!.content)).toEqual([`**Action plan:** ${MANAGER_PLAN}`]);
    expect(reply!.content).not.toMatch(STANDARD_REVIEW);
  });
});
