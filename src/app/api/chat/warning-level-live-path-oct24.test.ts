import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { ChatFormProposal, ChatMessage } from "@/types";

vi.mock("@/config/company/locations", async () =>
  (await import("@/test/fixtures/reference-roster")).referenceRosterModule(),
);

/**
 * ============================================================================
 * THE WARNING LEVEL ON ASK BUBBLES' LIVE PATH — ACCEPTANCE CASES, 24 OCT 2026
 * ============================================================================
 *
 * The same acceptance cases as Ask Sunny's `warning-level-live-path-oct24`,
 * through POST /api/chat with this app's live form path: the full remap
 * (FORM_FULL_REMAP_ENABLED, on in production). The
 * browser's messages go in whole and the route's `parseHistory` drops each
 * turn's `formProposal`, as in production.
 *
 * Where Ask Sunny's live chat had a reply that misled its reader, this app's
 * own production reply with the same words is used (conv_mvmo24rs2rjnl7q's
 * "Verbal or written?", conv_mvmetocl2r5a0ks's "**Verbal Warning** or a
 * **Written Warning**?"); the manager turns are the Ask Sunny chats' own
 * (synthetic names), with Ask Bubbles' store names. Ported from Ask Sunny.
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

const bag = vi.hoisted(() => ({ modelLevel: null as "verbal" | "written" | null }));

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
    const manager = JSON.stringify(input.messages ?? []).split("Manager:").pop() ?? "";
    return {
      employee: null,
      store: null,
      title: null,
      incidentType: null,
      incidentDate: null,
      payrollAmount: null,
      warningLevel: bag.modelLevel,
      formType: /policy review/i.test(manager) ? "Policy Review" : null,
      formTurn: true,
    };
  },
  callClaudeToolDetailed: async (input: { messages?: { content?: unknown }[] }) => {
    const text = JSON.stringify(input.messages ?? []);
    const last = text.split(/Manager:|User:/i).pop() ?? text;
    return {
      input: { templateKey: namedForm(last), employeeName: null, observation: null, actionPlan: null, warningLevel: bag.modelLevel },
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

/*
 * Production's form path here: the full remap. Intent extraction is off in
 * production (chat_traces 24 Oct 2026: remap slots, no prefixed questions);
 * its reading is covered by `lib/ai/warning-level-invented-oct24.test.ts`.
 */
const FLAGS = ["FORM_FULL_REMAP_ENABLED"] as const;
const FLAG = "WARNING_LEVEL_MANAGER_ONLY_ENABLED";
const PAYROLL_FLAG = "INTENT_PAYROLL_MANAGER_ONLY_ENABLED";
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

const READ_BACK = /\*\*Type of warning:\*\* (Verbal|Written) Warning, as you said/i;
const readBack = (content: string) => READ_BACK.exec(content)?.[1]?.toLowerCase() ?? null;

/* This app's production replies (24 Oct 2026) whose words name both levels. */
const BOTH_LEVELS_REPLY =
  "Here is the Corrective Action Form.\n**Employee:** Test Employee\n**Store:** NE Kearney, as you said\n\nWhat is their job title?\nVerbal or written?\nIs payroll deduct applicable?";
const CHOICE_REPLY =
  "I can create a **Corrective Action Form** for **Test Employee**.\n\nIs this new corrective action a **Verbal Warning** or a **Written Warning**? Tell me here, or tick it on the form — I won't choose it for you.\n\nOne more question: **Is payroll deduct applicable?** Yes or No? Tell me here, or tick it on the form — I won't answer it for you.";
const PAYROLL_ONLY_REPLY =
  "I can create a **Corrective Action Form** for **Test Employee**.\n\nOne more question: **Is payroll deduct applicable?** Yes or No? Tell me here, or tick it on the form — I won't answer it for you.";
const INTAKE_LIST_REPLY =
  "Great, I can help you create a **Corrective Action Form**. To get started, please provide me with these details:\n\n1. Employee's full name\n2. What happened\n3. Whether this is a verbal or written warning\n4. Is payroll deduct applicable? (Yes or No)";

beforeEach(async () => {
  for (const key of Object.keys(store)) (store as Record<string, unknown[]>)[key] = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-24T20:00:00Z"));
  for (const name of [...FLAGS, FLAG, PAYROLL_FLAG]) saved.set(name, process.env[name]);
  for (const name of FLAGS) process.env[name] = "true";
  process.env[FLAG] = "true";
  delete process.env[PAYROLL_FLAG];
  bag.modelLevel = null;
  await ensureTemplateLibrary("system");
});
afterEach(() => {
  vi.useRealTimers();
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("acceptance: the level is only what the manager said, on Ask Bubbles' live path", () => {
  it.each([
    ["no model reading", null],
    ["the model guessing written", "written"],
  ] as const)('"for Test Employee" after a reply naming both levels reads back no level (%s)', async (_name, guess) => {
    bag.modelLevel = guess;
    const replies = await replay([
      {
        user: "create ca for Test Employee, Store Manager for violating standards of conduct. Test failed to have Test Newhire complete required policy acknowledgements in woven during Test Newhire's onboarding on 9-28-26 as reflected on the woven policy acknowledgement report run on 10-16-26.",
        recordedReply: BOTH_LEVELS_REPLY,
      },
      "for Test Employee",
    ]);
    const last = replies.at(-1)!;
    expect(readBack(last.content)).toBeNull();
    expect(last.formProposal?.warningLevel ?? null).toBeNull();
  });

  it('a bare "Yes" after the either/or level question reads back no level', async () => {
    const replies = await replay([
      { user: "create a corrective action form for Test Employee", recordedReply: CHOICE_REPLY },
      "Yes",
    ]);
    expect(readBack(replies.at(-1)!.content)).toBeNull();
    expect(replies.at(-1)!.formProposal?.warningLevel ?? null).toBeNull();
    // The either/or is not a yes/no question; the Yes answers the payroll one.
    expect(replies.at(-1)!.formProposal?.payrollDeduct).toBe("yes");
  });

  it.each([[false], [true]])(
    'a bare "Yes" right after "Is payroll deduct applicable? Yes or No?" is the payroll answer (main\'s payroll flag on: %s)',
    async (payrollFlag) => {
      if (payrollFlag) process.env[PAYROLL_FLAG] = "true";
      const replies = await replay([
        { user: "create a corrective action form for Test Employee", recordedReply: PAYROLL_ONLY_REPLY },
        "Yes",
      ]);
      expect(replies.at(-1)!.formProposal?.payrollDeduct).toBe("yes");
      expect(readBack(replies.at(-1)!.content)).toBeNull();
    },
  );

  it('the "Yes" that confirms a name is not a payroll answer or a level', async () => {
    const replies = await replay([
      {
        user: "create a corrective action form for Rowen Testo",
        recordedReply:
          "Did you mean **Rowan Testo**? Reply \"yes\" to use **Rowan Testo**, or \"no\" to keep **Rowen Testo** as you typed it.",
      },
      "Yes",
    ]);
    expect(replies.at(-1)!.formProposal?.payrollDeduct ?? null).toBeNull();
    expect(readBack(replies.at(-1)!.content)).toBeNull();
  });

  it('R1, conv_mvmo24rs2rjnl7q: "verbal, prior = manual ack 9/01, no payroll" reads back Verbal', async () => {
    const replies = await replay([
      "CA for Test Employee at Kearney, out of dress code 10/11",
      "verbal, prior = manual ack 9/01, no payroll",
      "Use Kearney as the location",
    ]);
    expect(replies[1]!.formProposal?.warningLevel).toBe("verbal");
    expect(readBack(replies[1]!.content)).toBe("verbal");
    expect(replies[2]!.formProposal?.warningLevel).toBe("verbal");
  });

  it('R1: "prior verbal on 9-1, this one is written" reads back Written', async () => {
    const replies = await replay([
      "CA for Test Employee at Kearney, out of dress code 10/11",
      "prior verbal on 9-1, this one is written",
    ]);
    expect(replies[1]!.formProposal?.warningLevel).toBe("written");
    expect(readBack(replies[1]!.content)).toBe("written");
  });

  it("R2: a saved level the manager never stated goes away", async () => {
    const id = conversationId();
    store.chat_traces.push({
      user_id: "qa-manager",
      conversation_id: id,
      created_at: "2026-10-24T19:59:00Z",
      slots: { templateKey: "dpoa", employeeName: "Test Employee", warningLevel: "written" },
    });
    store.chat_form_state.push({
      user_id: "qa-manager",
      conversation_id: id,
      state: { templateKey: "dpoa", employeeName: "Test Employee", warningLevel: "written" },
    });
    const replies = await replay(
      [{ user: "create a corrective action form for Test Employee", recordedReply: BOTH_LEVELS_REPLY }, "for Test Employee"],
      id,
    );
    expect(replies.at(-1)!.formProposal?.warningLevel ?? null).toBeNull();
    expect(readBack(replies.at(-1)!.content)).toBeNull();
  });

  it('conv_mvmvt8y925whytt (Ask Sunny): no invented level; "this is a verbal" sets Verbal; none on the Policy Review', async () => {
    const replies = await replay([
      { user: "Create a form from this conversation.", recordedReply: "Which form do you need?" },
      { user: "Create a Corrective Action Form from this conversation.", recordedReply: INTAKE_LIST_REPLY },
      "test testy, store associate at kearney did not complete the 10 min sanitize clean when opening the store on 9-23-26",
      "this is a verbal",
      "test has been an employee for 7 months, create the ca",
      "do a ca and cite the standards of conduct as the policy violated",
      "Create a Policy Review from this conversation.",
    ]);
    expect(readBack(replies[2]!.content)).toBeNull();
    expect(replies[2]!.formProposal?.warningLevel ?? null).toBeNull();
    for (const turn of [3, 4, 5]) {
      expect(replies[turn]!.formProposal?.warningLevel, `turn ${turn + 1}`).toBe("verbal");
      expect(readBack(replies[turn]!.content), `turn ${turn + 1}`).toBe("verbal");
    }
    expect(replies[6]!.formProposal?.templateKey).toBe("policy-review");
    expect(replies[6]!.formProposal?.warningLevel ?? null).toBeNull();
    expect(readBack(replies[6]!.content)).toBeNull();
  });

  it.each([
    [
      "conv_mvmvqut82r8agma",
      [
        "create an exit form. employee name is test testy. test was a store associate at kearney location. on 9-15-26 test provided her resignation to management and her last day worked was 9-28-26",
        "test gave and worked 2 week notice. test messaged management her resignation via woven. all store items were returned and she is eligible for rehire",
      ],
    ],
    [
      "conv_mvmvradb2sj0ify",
      [
        "assist with creating an exit form",
        "test employee, store associate at kearney",
        "last day worked was 9-20-26. management called her with no response on 9-27-26",
        "its a no call no show",
        "create exit form",
      ],
    ],
  ] as const)("%s (Ask Sunny): no level on a Resignation/Exit Form", async (_id, turns) => {
    const replies = await replay(turns);
    for (const [index, reply] of replies.entries()) {
      expect(reply.formProposal?.warningLevel ?? null, `turn ${index + 1}`).toBeNull();
      expect(readBack(reply.content), `turn ${index + 1}`).toBeNull();
    }
  });
});
