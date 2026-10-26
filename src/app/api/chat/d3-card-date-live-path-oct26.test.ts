import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { ChatFormProposal, ChatMessage } from "@/types";

vi.mock("@/config/company/locations", async () =>
  (await import("@/test/fixtures/reference-roster")).referenceRosterModule(),
);

/**
 * ============================================================================
 * THE CARD'S DATE ON THIS APP'S LIVE PATH — FORM_DATE_INCIDENT_ONLY, 26 OCT 2026
 * ============================================================================
 *
 * FORM_DATE_INCIDENT_ONLY_ENABLED was switched on in both production apps at
 * 08:45Z and rolled back at 08:51Z. The sibling app's live card test (invented
 * names) showed "ca for <name>, coached her 10-16, written warning on 10-20"
 * dated 10/20, "… late on 10-5 and 10-15. i coached her on 10-16 …" dated
 * 10/16 (the coaching) and "missing the woven deadline of 11-1-26" dated 11/1.
 *
 * Here, through POST /api/chat on this app's live form path (the full remap,
 * with the late-open reader), a yearless deadline ("the woven deadline of
 * 10-15", "the 10-15 woven deadline") dated the card: the remap read yearless
 * dates without the incident-only rule. The store is this app's.
 *
 * D1 and D2 (an earlier step's or the coaching's date on the card) are the
 * remap's earlier-step reading, owned by PRIOR_SENTENCE_FIX_ENABLED (#305);
 * this flag does not change them, and they are pinned here flag off only.
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

const bag = vi.hoisted(() => ({ modelLevel: null as "verbal" | "written" | null, names: [] as string[], title: null as string | null, modelDate: null as string | null }));

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
      incidentDate: bag.modelDate,
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
const FLAGS = ["FORM_FULL_REMAP_ENABLED","FIELD_ACCURACY_ENABLED","SLOT_RETENTION_ENABLED","LATE_OPEN_DATE_ENABLED","PRIOR_ACTIONS_PARSE_ENABLED","MANAGER_WORDS_ONLY_ENABLED","WARNING_LEVEL_MANAGER_ONLY_ENABLED"] as const;
const FLAG = "FORM_DATE_INCIDENT_ONLY_ENABLED";
const EXTRA_FLAGS = ["KEEP_FORM_EMPLOYEE_ENABLED", "TITLE_WHOLE_WORD_ENABLED"] as const;
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
  vi.setSystemTime(new Date("2026-10-26T15:00:00Z"));
  for (const name of [...FLAGS, FLAG, ...EXTRA]) saved.set(name, process.env[name]);
  for (const name of FLAGS) process.env[name] = "true";
  delete process.env[FLAG];
  for (const name of EXTRA) process.env[name] = "true";
  bag.modelLevel = null;
  bag.names = [];
  bag.title = null;
  await ensureTemplateLibrary("system");
});
afterEach(() => {
  vi.useRealTimers();
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});


const D1 = "ca for lysander pembrook, coached her 10-16, written warning on 10-20";
const D2 = "create a ca for thessaly ironwood at kearney, she was late on 10-5 and 10-15. i coached her on 10-16 about being late";
const DEADLINES = [
  "create a ca for lysander pembrook at kearney for missing the woven deadline of 11-1-26",
  "create a ca for lysander pembrook at kearney for missing the woven deadline of 10-15",
  "create a ca for lysander pembrook at kearney for missing the 10-15 woven deadline",
  "create a ca for lysander pembrook at kearney, the woven deadline is 10-15 and she missed it",
] as const;

const REGISTERS: [string, (text: string) => string][] = [
  ["all lowercase", (text) => text.toLowerCase()],
  [
    "sentence case",
    (text) => {
      const named = text
        .toLowerCase()
        .split("lysander pembrook").join("Lysander Pembrook")
        .split("thessaly ironwood").join("Thessaly Ironwood")
        .split("kearney").join("Kearney");
      return named.charAt(0).toUpperCase() + named.slice(1);
    },
  ],
  ["ALL CAPS", (text) => text.toUpperCase()],
];

async function cardDate(text: string): Promise<string | null> {
  bag.names = ["lysander pembrook", "thessaly ironwood"];
  const replies = await replay([text]);
  return replies.at(-1)!.formProposal?.formDate ?? null;
}

describe.each(REGISTERS)("the card's Date on the live path (%s)", (_register, as) => {
  it("flag off: today's dates, pinned", async () => {
    delete process.env[FLAG];
    expect(await cardDate(as(D1))).toBe("2026-10-20");
    expect(await cardDate(as(D2))).toBe("2026-10-16");
    expect(await cardDate(as(DEADLINES[0]))).toBeNull();
    for (const text of DEADLINES.slice(1)) expect(await cardDate(as(text)), text).toBe("2026-10-15");
  }, 120_000);

  it("flag on: a deadline never dates the card, yearless or not", async () => {
    process.env[FLAG] = "true";
    for (const text of DEADLINES) expect(await cardDate(as(text)), text).toBeNull();
    // The slot model reading the deadline as the incident's changes nothing.
    bag.modelDate = "11-1-26";
    expect(await cardDate(as(DEADLINES[0]))).toBeNull();
    bag.modelDate = null;
  }, 120_000);

  it("flag on, NEVER-BREAK: one stated incident date still dates the card", async () => {
    process.env[FLAG] = "true";
    for (const text of [
      "create a ca for thessaly ironwood at kearney, she was late on 10-22",
      "create a ca for thessaly ironwood at kearney, she was late on 10-22-26 and missed the 11-1-26 deadline",
      "create a ca for lysander pembrook at kearney, she missed the woven deadline on 10-22",
    ]) {
      expect(await cardDate(as(text)), text).toBe("2026-10-22");
    }
  }, 120_000);
});
