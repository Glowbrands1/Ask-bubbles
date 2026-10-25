import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { keepFormEmployeeEnabled } from "@/lib/config/chat-quality-flags";
import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { ChatFormProposal, ChatMessage } from "@/types";

vi.mock("@/config/company/locations", async () =>
  (await import("@/test/fixtures/reference-roster")).referenceRosterModule(),
);

/**
 * ============================================================================
 * "TEST EMPLOYEE" IS THE NAME THE MANAGER TYPED (PORTED, QA 25 OCT 2026)
 * ============================================================================
 *
 * The sibling app's QA: "create a written CA for Test Employee at Kearney for
 * missing the 10-15-26 woven deadline" drafted the form for **Test**, and the
 * exit request did the same. Here, in this app's words, through POST
 * /api/chat with NOT_A_NAME_GUARD and CROSS_CHAT_REPLY_GUARD on:
 *
 *   the full remap (FORM_FULL_REMAP_ENABLED, this app's live form path)
 *       → **Employee:** Test whenever the extraction model copied "Test":
 *         `groundedName` kept any slice of the manager's words;
 *   the proposal flow (remap off; where the exit request goes once the exit
 *   form is kept off the remap) and the intent reading
 *       → **Test**: the proposal's sentence reader (forms/proposal.ts) ends
 *         a capitalised name at a form word, and "Employee" is one.
 *
 * KEEP_FORM_EMPLOYEE_ENABLED: a capitalised "<First> Employee" the manager
 * typed as the person is the employee on all three. A lower-case "an
 * employee", "my employee" is still nobody's name.
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

const bag = vi.hoisted(() => ({ modelLevel: null as "verbal" | "written" | null, names: [] as string[], title: null as string | null, formTurn: false }));

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
  if (/coaching/i.test(text)) return "coaching";
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
      employee: bag.names.find((name) => manager.toLowerCase().includes(name.toLowerCase())) ?? null,
      store: null,
      title: bag.title,
      incidentType: null,
      incidentDate: null,
      payrollAmount: null,
      warningLevel: bag.modelLevel,
      formType: /policy review/i.test(manager) ? "Policy Review" : null,
      formTurn: bag.formTurn,
    };
  },
  callClaudeToolDetailed: async (input: { messages?: { content?: unknown }[] }) => {
    const text = JSON.stringify(input.messages ?? []);
    const last = text.split(/Manager:|User:/i).pop() ?? text;
    return {
      input: {
        templateKey: namedForm(last),
        // What the extraction model copies: the employee when the latest manager turn names them.
        employeeName: bag.names.find((name) => last.toLowerCase().includes(name.toLowerCase())) ?? null,
        jobTitle: bag.title, observation: null, actionPlan: null, warningLevel: bag.modelLevel },
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
const FLAGS = ["NOT_A_NAME_GUARD_ENABLED", "CROSS_CHAT_REPLY_GUARD_ENABLED"] as const;
/** Each path's own flag, on for that path's tests only. */
const PATH_FLAGS = ["FORM_FULL_REMAP_ENABLED", "INTENT_EXTRACTION_ENABLED"] as const;
const FLAG = "WARNING_LEVEL_MANAGER_ONLY_ENABLED";
const EXTRA_FLAGS = ["KEEP_FORM_EMPLOYEE_ENABLED"] as const;
const EXTRA: string[] = [...EXTRA_FLAGS];
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
    // Production writes each turn's remap slots to chat_traces, and the next
    // turn reads them back as the saved slots; this harness's trace writer
    // does not reach the fake store, so the row is written here.
    if (payload.formProposal) {
      store.chat_traces.push({
        user_id: "qa-manager",
        conversation_id: id,
        created_at: `2026-10-25T08:00:${String(index).padStart(2, "0")}Z`,
        slots: { templateKey: payload.formProposal.templateKey, employeeName: payload.formProposal.employeeName },
      });
    }
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
  vi.setSystemTime(new Date("2026-10-25T08:00:00Z"));
  for (const name of [...FLAGS, FLAG, ...EXTRA, ...PATH_FLAGS]) saved.set(name, process.env[name]);
  for (const name of PATH_FLAGS) delete process.env[name];
  for (const name of FLAGS) process.env[name] = "true";
  process.env[FLAG] = "true";
  for (const name of EXTRA) process.env[name] = "true";
  bag.modelLevel = null;
  bag.names = [];
  bag.title = null;
  bag.formTurn = false;
  await ensureTemplateLibrary("system");
});
afterEach(() => {
  vi.useRealTimers();
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});


const CLIST = "create a written CA for Test Employee at Kearney for missing the 10-15-26 woven deadline";
const EXIT = "Create an exit form for Test Employee at Kearney, she resigned and her last day was 10-20";

/** What the extraction model may copy as the employee: the full name, the first word, or nobody. */
const READINGS = [
  ["the full name", ["Test Employee"]],
  ["the first word only", ["Test"]],
  ["no employee", []],
] as const;

type Reply = { content: string; formProposal?: ChatFormProposal };

/** The card says Test Employee, and no line of the reply names the employee "Test". */
function expectTypedName(reply: Reply, card: "required" | "if-any" = "required") {
  if (card === "required" || reply.formProposal) expect(reply.formProposal?.employeeName).toBe("Test Employee");
  expect(reply.content).toMatch(/Test Employee/);
  expect(reply.content).not.toMatch(/\*\*Test\*\*/);
  expect(reply.content).not.toMatch(/\*\*(?:Employee|Name):\*\*\s*Test\s*$/m);
}

async function controls() {
  bag.names = ["Jordan Hale"];
  const named = await replay(["create a coaching form", "my employee Jordan Hale was late"]);
  expect(named.at(-1)!.formProposal?.employeeName ?? null).toBe("Jordan Hale");
  bag.names = [];
  const nobody = await replay(["create a coaching form", "an employee was late"]);
  expect(nobody.at(-1)!.formProposal?.employeeName ?? null).toBeNull();
  expect(nobody.at(-1)!.content).not.toMatch(/\*\*(?:Employee|Name):\*\*\s*(?:An )?Employee\b/i);
}

describe("flag", () => {
  it("default off", () => {
    for (const name of EXTRA_FLAGS) delete process.env[name];
    expect(keepFormEmployeeEnabled()).toBe(false);
  });
});

describe("the full remap (live path)", () => {
  beforeEach(() => {
    process.env.FORM_FULL_REMAP_ENABLED = "true";
  });

  it.each(READINGS)("C-list: the card's employee is Test Employee — model copied %s", { timeout: 60_000 }, async (_name, names) => {
    bag.names = [...names];
    const [reply] = await replay([CLIST]);
    expect(reply!.formProposal?.templateKey).toBe("dpoa");
    expectTypedName(reply!);
  });

  // Today the remap serves the exit request without a card; once the exit form is kept off the remap, a card.
  it.each(READINGS)("exit: the employee is Test Employee — model copied %s", { timeout: 60_000 }, async (_name, names) => {
    bag.names = [...names];
    const [reply] = await replay([EXIT]);
    expectTypedName(reply!, "if-any");
  });

  it('controls: "my employee Jordan Hale was late" stays Jordan Hale; "an employee was late" gives no name', { timeout: 60_000 }, controls);
});

describe("the proposal flow (remap off)", () => {
  it.each([CLIST, EXIT])("%s → Test Employee", { timeout: 60_000 }, async (question) => {
    bag.names = ["Test"];
    const [reply] = await replay([question]);
    expectTypedName(reply!);
  });

  it('controls: "my employee Jordan Hale was late" stays Jordan Hale; "an employee was late" gives no name', { timeout: 60_000 }, controls);
});

describe("the intent reading (INTENT_EXTRACTION_ENABLED, off in production)", () => {
  beforeEach(() => {
    process.env.INTENT_EXTRACTION_ENABLED = "true";
  });

  it.each(READINGS)("C-list and exit → Test Employee — slot model copied %s", { timeout: 60_000 }, async (_name, names) => {
    bag.names = [...names];
    for (const question of [CLIST, EXIT]) {
      const [reply] = await replay([question]);
      expectTypedName(reply!);
    }
  });
});
