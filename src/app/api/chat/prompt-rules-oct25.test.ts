import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { ChatFormProposal, ChatMessage } from "@/types";

/**
 * ============================================================================
 * PRODUCTION 25 OCT 2026 — THREE RULES QA APPROVED (G12, B6, B15)
 * ============================================================================
 *
 * Every turn through POST /api/chat with this app's production form path (the
 * full remap, FORM_FULL_REMAP_ENABLED on). The managers' words are copied
 * exactly from the chats; the employee name was already synthetic.
 *
 *   G12, conv_mvnu3j932gpohx4 T1: "do verbal corrective action for Test
 *     Employee, … previous coaching jba manual 9-9-26. payroll deduct applies.
 *     …" was answered "I can't write this up as a corrective action document
 *     here — that's a formal HR record, and I can't produce a facsimile of one
 *     or its contents." FACSIMILE_ASK_ONLY_ENABLED.
 *
 *   B6, conv_mvnsqglc2v7zuyk: "… previous coaching jba manual 11-1-26 …", then
 *     "jba manual 11-1-25", answered "**Prior coaching:** Coaching Form on
 *     file, dated 2025-11-01, for Test Employee." TYPED_PRIOR_NOT_ON_FILE_ENABLED.
 *
 *   B15, conv_mvnu3j932gpohx4 T1–T3: "payroll deduct applies" in T1; T3
 *     'create a Corrective Action Form for Test Employee"' — the card asked
 *     "Is payroll deduct applicable?". PAYROLL_FROM_THIS_FORM_ENABLED.
 *
 * The prompt rules are checked on the system prompt the answering call is
 * sent: what the model reads is the part this app controls.
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

/* Every system prompt the answering call was sent, in order. */
const sent = vi.hoisted(() => [] as string[]);

const account = vi.hoisted(() => ({
  role: "admin",
  scope: { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] } as {
    level: string;
    primaryAreaId: string | null;
    alsoCoversAreaIds: string[];
  },
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
      if (!hasPermission(DEFAULT_PERMISSION_MATRIX, account.role as never, permission as never)) {
        throw new AuthError("forbidden", "Your role does not have permission to do that.");
      }
      return {
        identity: {
          subject: "qa-manager",
          email: "qa-manager@example.test",
          displayName: "QA Manager",
          role: account.role,
          scope: account.scope,
          verified: true,
        },
        permission,
        provider: "supabase",
      };
    },
  };
});
vi.mock("@/lib/analytics/record", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics/record")>()),
  openTurn: async () => "turn-qa",
  closeTurn: async () => {},
  recordActivity: async () => {},
  recordActivityAsync: () => {},
}));

vi.mock("@/lib/ai/call-claude", () => ({
  callClaude: async (input: { system: string }) => {
    sent.push(input.system);
    return "A grounded answer.";
  },
  callClaudeTool: async () => null,
  // The extraction model's read: the form the manager named, no other field.
  callClaudeToolDetailed: async (input: { user?: string }) => ({
    input: {
      templateKey: /coaching form/i.test(input.user ?? "") ? "coaching" : "dpoa",
      employeeName: null,
      observation: null,
      actionPlan: null,
    },
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
    // Production had the framework this turn cites (G12's reply cited it).
    async fetchRoleGrounding(role: { id: string }) {
      return {
        ok: true,
        grounding: {
          role: { id: role.id },
          documentId: "doc-progression",
          documentTitle: "PERFORMANCE MANAGEMENT FRAMEWORK KB TEXT",
          matchedBy: "tag",
          rows: [
            {
              chunk_id: "pmf-0",
              document_id: "doc-progression",
              document_title: "PERFORMANCE MANAGEMENT FRAMEWORK KB TEXT",
              category: "leadership_coaching",
              locator: "SECTION 2",
              page: null,
              section: null,
              content: "Solve the issue at the lowest appropriate level.",
              similarity: 0,
            },
          ],
          presentGroups: ["escalation_ladder"],
        },
      };
    }
    async fetchOfficialPolicyManual() {
      return { ok: false, reason: "not needed" };
    }
    async fetchNamedHandbook() {
      return { ok: false, reason: "none" };
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

/* Production's form path here: the full remap. */
const FLAGS = ["FORM_FULL_REMAP_ENABLED"] as const;
const ENV = [
  "PLACE_SPAN_GUARD_ENABLED",
  "REMAP_INCIDENT_FIX_ENABLED",
  "PRIOR_ACTIONS_PARSE_ENABLED",
  "FORM_REQUEST_OVER_ON_FILE_ENABLED",
  "TYPED_NAME_ENABLED",
  "PROMPT_CACHE_ENABLED",
  "FACSIMILE_ASK_ONLY_ENABLED",
  "TYPED_PRIOR_NOT_ON_FILE_ENABLED",
  "PAYROLL_FROM_THIS_FORM_ENABLED",
] as const;
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
  sent.length = 0;
  for (const key of Object.keys(store)) (store as Record<string, unknown[]>)[key] = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-25T16:00:00Z"));
  for (const name of FLAGS) {
    saved.set(name, process.env[name]);
    process.env[name] = "true";
  }
  for (const name of ENV) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
  await ensureTemplateLibrary("system");
});
afterEach(() => {
  vi.useRealTimers();
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function on(...names: string[]) {
  for (const name of names) process.env[name] = "true";
}

/* conv_mvnu3j932gpohx4, the manager's words. The stray closing quote in T3 is theirs. */
const B15_T1 =
  "do verbal corrective action for Test Employee, team member at Dodge, NE. location. previous coaching jba manual 9-9-26. payroll deduct applies. on 10-22-26 the register was short 8.65 which will be payroll deducted from Test Employee check";
const B15_T2 = "change store location to bellevue, ne";
const B15_T3 = 'create a Corrective Action Form for Test Employee"';
/* Production's replies to T1 and T2, word for word up to the point that matters. */
const B15_T1_REPLY =
  "I can't write this up as a corrective action document here — that's a formal HR record, and I can't produce a facsimile of one or its contents. What I can do is help you get the real form started.\n\nA few things first, though:\n\n- **Store**: You said \"Dodge, NE\" — the verified store for this question is Omaha, NE (West Dodge Rd), Store 264. If that's not the one you mean, tell me which store.\n\nIf you want to proceed, just say: **\"create a Corrective Action form for Test Employee\"** and the draft card will come up for you to fill in with the store, date, amount, and prior coaching details.";
const B15_T2_REPLY =
  "Got it — the store for this is Bellevue, NE, Store 67 (per the verified store list), not Dodge/Omaha.\n\nWhen you're ready, say **\"create a Corrective Action form for Test Employee\"** and the draft card will open for you to enter these details.";

/* conv_mvnsqglc2v7zuyk, the manager's words. */
const B6_T1 =
  "do verbal for team member Test Employee at empire, sd. payroll deduct does not apply. previous coaching jba manual 11-1-26. on 10-22-26 Test was not scheduled to work and came into the store to show her team her new puppy. Test was in the store 45 min";
const B6_T2 = "jba manual 11-1-25";
const B6_T1_REPLY =
  "A couple of things to sort out before I can help with this one:\n\n1. **Store** — \"Empire, SD\" isn't a store I can verify. Which store is this?\n\n2. **Date check** — you listed \"previous coaching jba manual 11-1-26\" as a prior coaching date, but today is 2026-10-25, so 2026-11-01 is still in the future. Can you confirm the actual date of that prior coaching?\n\nOnce you confirm the store and the prior coaching date, ask me to \"create a coaching form for Test Employee\" and the draft card will come up for you to fill in and finalize.";

const ASK_ONLY = 'tell them in one sentence to ask you to create it — for example "ask me to create a coaching form for her" — and stop. Never say you cannot write';
const TYPED_PRIOR = "A PRIOR STEP THE MANAGER TYPED IN THIS CONVERSATION IS NOT ON FILE.";

describe.each([
  ["PROMPT_CACHE_ENABLED off (production)", [] as string[]],
  ["PROMPT_CACHE_ENABLED on", ["PROMPT_CACHE_ENABLED"]],
])("G12 / B6 — the answering prompt (%s)", (_layout, layout) => {
  it("G12 conv_mvnu3j932gpohx4 T1 with FACSIMILE_ASK_ONLY_ENABLED: the prompt asks for the form and never says it cannot", async () => {
    on(...layout, "FACSIMILE_ASK_ONLY_ENABLED");
    const [reply] = await replay([B15_T1]);
    // This turn reaches the answering call on main (the forms-on-file reading).
    expect(reply!.formProposal ?? null).toBeNull();
    expect(sent).toHaveLength(1);
    expect(sent[0]).not.toMatch(/facsimile/i);
    expect(sent[0]).toContain(ASK_ONLY);
  });

  it("G12 flag off: the prompt production sent, headed NEVER WRITE A FACSIMILE", async () => {
    on(...layout);
    await replay([B15_T1]);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("- NEVER WRITE A FACSIMILE OF A COMPANY FORM.");
    expect(sent[0]).not.toContain(ASK_ONLY);
  });

  it("B6 conv_mvnsqglc2v7zuyk T2 with TYPED_PRIOR_NOT_ON_FILE_ENABLED: a prior step the manager typed is not on file", async () => {
    on(...layout, "TYPED_PRIOR_NOT_ON_FILE_ENABLED");
    await replay([{ user: B6_T1, recordedReply: B6_T1_REPLY }, B6_T2]);
    expect(sent).toHaveLength(2);
    expect(sent[1]).toContain(TYPED_PRIOR);
    expect(sent[1]).toContain("Give it in the manager's own words");
  });

  it("B6 flag off: the rule is not in the prompt (the production answer said \"Coaching Form on file, dated 2025-11-01\")", async () => {
    on(...layout);
    await replay([{ user: B6_T1, recordedReply: B6_T1_REPLY }, B6_T2]);
    expect(sent).toHaveLength(2);
    expect(sent[1]).not.toContain(TYPED_PRIOR);
  });
});

describe("B15 conv_mvnu3j932gpohx4: \"payroll deduct applies\" in T1 is on the T3 card", () => {
  /* Production at 12:59 UTC: the full remap with the incident fix and the prior-actions reader. */
  const PRODUCTION = ["REMAP_INCIDENT_FIX_ENABLED", "PRIOR_ACTIONS_PARSE_ENABLED"];

  async function card(flags: readonly string[]) {
    on(...flags);
    const replies = await replay([
      { user: B15_T1, recordedReply: B15_T1_REPLY },
      { user: B15_T2, recordedReply: B15_T2_REPLY },
      B15_T3,
    ]);
    return replies.at(-1)!;
  }

  it.each([
    ["the production flags", PRODUCTION],
    ["with the place guard", [...PRODUCTION, "PLACE_SPAN_GUARD_ENABLED"]],
    ["without the incident fix", ["PRIOR_ACTIONS_PARSE_ENABLED"]],
  ])("PAYROLL_FROM_THIS_FORM_ENABLED (%s): Payroll deduct Yes, never asked again", async (_name, flags) => {
    const reply = await card([...flags, "PAYROLL_FROM_THIS_FORM_ENABLED"]);
    expect(reply.formProposal?.templateKey).toBe("dpoa");
    expect(reply.formProposal?.payrollDeduct).toBe("yes");
    expect(reply.content).not.toContain("Is payroll deduct applicable?");
  });

  it("flag on, a later request with its own incident is a new form: T1's answer is not carried onto it", async () => {
    on(...PRODUCTION, "PAYROLL_FROM_THIS_FORM_ENABLED");
    const replies = await replay([
      { user: B15_T1, recordedReply: B15_T1_REPLY },
      "create a written CA for Test Employee for being on her phone at the register on 10-24-26",
    ]);
    expect(replies.at(-1)!.formProposal?.payrollDeduct ?? null).toBeNull();
  });

  it("flag off: the card asks \"Is payroll deduct applicable?\" (the production card)", async () => {
    const reply = await card(PRODUCTION);
    expect(reply.formProposal?.payrollDeduct ?? null).toBeNull();
    expect(reply.content).toContain("Is payroll deduct applicable?");
  });

  /* Pau, 26 Oct 2026: the manager's words typed all lowercase, and in sentence case with the name lowercase. */
  const REGISTERS: readonly (readonly [string, (text: string) => string])[] = [
    ["all lowercase", (text) => text.toLowerCase()],
    [
      "sentence case, name lowercase",
      (text) => {
        const lower = text.toLowerCase();
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      },
    ],
  ];

  /*
   * PINNED, NOT THE WANTED OUTCOME (reported to QA, 26 Oct 2026): with the
   * name typed lowercase, T3 "create a corrective action form for test
   * employee"" still reads as a new request with its own incident, because the
   * full-remap name reader needs a Capitalized name after "for", so the
   * payroll answer is not carried. That needs its own flag outside this PR.
   * Flag on or off, the card is the production card here.
   */
  it.each(REGISTERS)("%s: flag on or off, the production card (name typed lowercase, known gap)", async (_name, type) => {
    on(...PRODUCTION, "PAYROLL_FROM_THIS_FORM_ENABLED");
    const turns = [
      { user: type(B15_T1), recordedReply: B15_T1_REPLY },
      { user: type(B15_T2), recordedReply: B15_T2_REPLY },
      type(B15_T3),
    ];
    expect((await replay(turns)).at(-1)!.formProposal?.payrollDeduct ?? null).toBeNull();
    delete process.env.PAYROLL_FROM_THIS_FORM_ENABLED;
    const off = (await replay(turns)).at(-1)!;
    expect(off.formProposal?.payrollDeduct ?? null).toBeNull();
  });
});
