import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { ChatFormProposal, ChatMessage } from "@/types";

vi.mock("@/config/company/locations", async () =>
  (await import("@/test/fixtures/reference-roster")).referenceRosterModule(),
);

/**
 * ============================================================================
 * NEGATED_PERSON_NO_CARD_ENABLED THROUGH POST /api/chat (QA-6, 26 OCT 2026)
 * ============================================================================
 *
 * With a Corrective Action card open for Corvin Mallow, "never one for Rowan
 * Pell" and "do not make one for Rowan Pell" moved the card to Rowan Pell on
 * the full remap (FORM_FULL_REMAP_ENABLED): the extraction model copies the
 * person the turn names, negated or not. Here the stand-in models copy the
 * first of Rowan Pell and Corvin Mallow the manager's latest turn names, as
 * the real one did. Each turn in lower case, Sentence case and ALL CAPS.
 * Rowan Pell and Corvin Mallow are invented names.
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



const OPEN = "create a written CA for Corvin Mallow at the Kearney store for being late on 10-20-26. no payroll deduct";
const registers = (text: string) => [text.toLowerCase(), text.charAt(0).toUpperCase() + text.slice(1), text.toUpperCase()];

/** The card's employee after `second`, lower case, with the card open for Corvin Mallow. */
async function cardAfter(second: string): Promise<string | null> {
  process.env.FORM_FULL_REMAP_ENABLED = "true";
  bag.names = ["Rowan Pell", "Corvin Mallow"];
  bag.formTurn = true;
  const [first, reply] = await replay([OPEN, second]);
  expect(first!.formProposal?.employeeName).toBe("Corvin Mallow");
  return reply!.formProposal?.employeeName?.toLowerCase() ?? null;
}

const NEGATED = [...registers("never one for Rowan Pell"), ...registers("do not make one for Rowan Pell")];
const NOT_FOR = registers("no, not for Rowan Pell, for Corvin Mallow");
const NOW = registers("now one for Rowan Pell");
const ONE_NOT = registers("one for Rowan Pell, not Corvin Mallow");

describe("NEGATED_PERSON_NO_CARD_ENABLED on, full remap", { timeout: 120_000 }, () => {
  beforeEach(() => {
    process.env.NEGATED_PERSON_NO_CARD_ENABLED = "true";
  });
  afterEach(() => {
    delete process.env.NEGATED_PERSON_NO_CARD_ENABLED;
  });

  it.each(NEGATED)("%s → no card for Rowan Pell; the card stays Corvin Mallow", async (text) => {
    expect(await cardAfter(text)).toBe("corvin mallow");
  });
  it.each(NOT_FOR)("%s → the card stays Corvin Mallow", async (text) => {
    expect(await cardAfter(text)).toBe("corvin mallow");
  });
  it.each(NOW)("%s → a card for Rowan Pell (positive control)", async (text) => {
    expect(await cardAfter(text)).toBe("rowan pell");
  });
  it.each(ONE_NOT)("%s → Rowan Pell", async (text) => {
    expect(await cardAfter(text)).toBe("rowan pell");
  });
});

// Flag off: as on main, pinned. Every turn moves the card to Rowan Pell, the negated ones included.
describe("NEGATED_PERSON_NO_CARD_ENABLED off, full remap: as on main", { timeout: 120_000 }, () => {
  it.each([...NEGATED, ...NOT_FOR, ...NOW, ...ONE_NOT])("%s → rowan pell", async (text) => {
    expect(await cardAfter(text)).toBe("rowan pell");
  });
});
