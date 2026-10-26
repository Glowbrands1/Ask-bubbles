import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { continuationFor } from "@/lib/forms/proposal-continuation";
import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { ChatFormProposal, ChatMessage } from "@/types";

/**
 * ============================================================================
 * QA B1, conv_mvifqra017j15ld8 — "OPENING STORE LATE" NAMED NO POLICY
 * ============================================================================
 *
 * "create verbal ca for Test Employee for opening store late on 10-1-26. …"
 * (QA's exact turn, the name replaced) on the proposal flow, which serves form
 * turns with the full remap off (QA reports it off now): the card named no
 * policy, because this app's policy reader has no Late Opening name and the
 * proposal line read only named policies. With LATE_OPEN_DATE_ENABLED a
 * described late opening ("opening store late", "opened the store late",
 * "late to open") names Late Opening, unless the account also describes a
 * late shift or an absence. Every turn goes through POST /api/chat.
 */

const store: FakeStore & Record<string, Record<string, unknown>[]> = {
  form_instances: [],
  form_instance_values: [],
  form_instance_events: [],
  form_template_versions: [],
  form_templates: [],
  form_template_current: [],
  form_template_assets: [],
  chat_traces: [],
  chat_form_state: [],
} as unknown as FakeStore & Record<string, Record<string, unknown>[]>;

const state = vi.hoisted(() => ({
  /** The extraction model's reading for the turn. Production's readings were not recorded. */
  remap: {} as Record<string, unknown>,
  draft: {} as { values?: Record<string, unknown>; checked?: Record<string, unknown> },
  revision: {} as { values?: Record<string, unknown>; checked?: Record<string, unknown>; clear?: string[] },
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
          scope: { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] },
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

/** The form the latest manager turn names, as the extraction model copies it. */
function namedForm(text: string): string | null {
  if (/follow-?up coaching/i.test(text)) return "follow-up-coaching";
  if (/coaching/i.test(text)) return "coaching";
  if (/\b(?:ca|corrective action)\b/i.test(text)) return "dpoa";
  return null;
}

vi.mock("@/lib/ai/call-claude", () => ({
  callClaude: async () => "A grounded answer.",
  callClaudeTool: async () => null,
  callClaudeToolDetailed: async (input: { messages?: { content?: unknown }[] }) => {
    const text = JSON.stringify(input.messages ?? []);
    const last = text.split(/Manager:|User:/i).pop() ?? text;
    return {
      input: { templateKey: namedForm(last), employeeName: null, observation: null, actionPlan: null, ...state.remap },
      inputTokens: 1,
      outputTokens: 1,
    };
  },
}));
vi.mock("@/lib/ai/anthropic", () => ({
  getAnthropicClient: () => ({
    messages: {
      create: async (request: { tool_choice?: { name?: string } }) => {
        const revising = request.tool_choice?.name === "revise_form_fields";
        return {
          stop_reason: "tool_use",
          content: [
            { type: "tool_use", name: revising ? "revise_form_fields" : "write_form_fields", input: revising ? state.revision : state.draft },
          ],
        };
      },
    },
  }),
}));
vi.mock("@/lib/knowledge/providers/supabase", async () => {
  const { manualChunkFromRow } = await import("@/lib/knowledge/full-manual-load");
  const rows = (await import("@/test/fixtures/jba-manual-production-151.json")).default;
  return {
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
vi.mock("@/lib/forms/prior-forms", () => ({
  priorFormsReadingForChat: async () => ({ attach: [], possible: [], identity: "none" }),
}));

process.env.NEXT_PUBLIC_DEMO_MODE = "false";
vi.setConfig({ hookTimeout: 30_000, testTimeout: 60_000 });

const { ensureTemplateLibrary } = await import("@/lib/forms/repository");
const chatRoute = await import("./route");

/** Production's flags for form turns; the remap is switched off per case (QA: off now). */
const PROD_FLAGS = [
  "FORM_FULL_REMAP_ENABLED",
  "KEEP_FORM_EMPLOYEE_ENABLED",
  "DRAFT_ACTIONS_ENABLED",
  "CONVERSATION_DRAFT_REUSE_ENABLED",
] as const;
const FLAG = "LATE_OPEN_DATE_ENABLED";
/** This PR's flag (default off). The described late opening needs it and LATE_OPEN_DATE_ENABLED. */
const PLACE = "LATE_OPEN_PLACE_ENABLED";
const TODAY = "2026-10-25";
const saved = new Map<string, string | undefined>();

const LATE_OPENING_MODEL = {
  values: {
    observation:
      "Observed:\nTest was scheduled to open at 8:30am on October 17, 2026 and did not arrive until 11:06, so the store opened late.\n\nExpectation:\nAn employee assigned to open is expected to open on time.\n\nGoing Forward:\nTest should arrive in time to open.",
  },
  checked: { offense_type: ["tardiness"] },
};

function joinOverview() {
  for (const row of store.form_instances ?? []) {
    const template = store.form_templates!.find((entry) => entry.id === row.template_id);
    const version = store.form_template_versions.find((entry) => entry.id === row.template_version_id);
    Object.assign(row, {
      form_date: row.form_date ?? TODAY,
      template_key: template?.key,
      template_name: template?.name,
      layout_family: template?.layout_family,
      template_version: version?.version,
    });
  }
}

class JoiningRows extends Array<Record<string, unknown>> {
  override push(...rows: Record<string, unknown>[]) {
    const count = super.push(...rows);
    joinOverview();
    return count;
  }
}

beforeEach(async () => {
  for (const key of Object.keys(store)) (store as Record<string, unknown[]>)[key] = [];
  store.form_instances = new JoiningRows() as never;
  for (const name of [...PROD_FLAGS, FLAG, PLACE, "INTENT_EXTRACTION_ENABLED"]) saved.set(name, process.env[name]);
  for (const name of PROD_FLAGS) process.env[name] = "true";
  delete process.env.INTENT_EXTRACTION_ENABLED;
  delete process.env.FORM_FULL_REMAP_ENABLED;
  process.env[FLAG] = "true";
  process.env[PLACE] = "true";
  state.remap = {};
  state.draft = LATE_OPENING_MODEL;
  state.revision = { values: {} };
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T15:00:00Z`));
  await ensureTemplateLibrary("system");
});

afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  vi.useRealTimers();
});

function toUuid(id: string): string {
  if (/^[0-9a-f-]{36}$/.test(id)) return id;
  const uuid = randomUUID();
  for (const table of ["form_instances", "form_instance_values", "form_instance_events"] as const) {
    for (const row of store[table]) {
      if (row.id === id) row.id = uuid;
      if (row.instance_id === id) row.instance_id = uuid;
      if (row.revises_instance_id === id) row.revises_instance_id = uuid;
    }
  }
  return uuid;
}

type Answer = {
  content: string;
  formProposal?: ChatFormProposal;
  formOpened?: { instanceId: string; templateName: string; revisesInstanceId: string | null };
};

let threads = 0;

class Thread {
  readonly messages: ChatMessage[] = [];
  readonly conversationId = `conv_${Date.now().toString(36)}${(threads += 1).toString(36).padStart(4, "0")}`;
  instanceId: string | null = null;
  private sequence = 0;

  /** `recorded`: production's reply for this turn, kept in history in place of this harness's. */
  async say(question: string, remap: Record<string, unknown> = {}, recorded?: string): Promise<Answer> {
    state.remap = remap;
    const history = this.messages.map(({ id, role, content, formProposal }) => ({ id, role, content, ...(formProposal ? { formProposal } : {}) }));
    const continuation = this.instanceId ? null : continuationFor(this.messages);
    const id = `m${(this.sequence += 1)}`;
    const response = await chatRoute.POST(
      new Request("https://app.test/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question,
          mode: "standard",
          history,
          questionMessageId: id,
          conversationId: this.conversationId,
          ...(continuation ? { continueProposalTemplateKey: continuation.templateKey } : {}),
          ...(this.instanceId ? { activeFormInstanceId: this.instanceId } : {}),
        }),
      }),
    );
    const payload = (await response.json()) as Answer & { error?: string };
    expect(response.status, JSON.stringify(payload)).toBe(200);
    /* Production reads the last turn's remap slots back from chat_traces; the harness writes that row. */
    if (payload.formProposal) {
      store.chat_traces.push({
        user_id: "qa-manager",
        conversation_id: this.conversationId,
        created_at: `${TODAY}T15:00:${String(this.sequence).padStart(2, "0")}Z`,
        slots: { templateKey: payload.formProposal.templateKey, employeeName: payload.formProposal.employeeName },
      });
    }
    this.messages.push(
      { id, role: "user", content: question, createdAt: `${TODAY}T15:00:00Z` } as ChatMessage,
      {
        id: `a${this.sequence}`,
        role: "assistant",
        content: recorded ?? payload.content,
        createdAt: `${TODAY}T15:00:01Z`,
        ...(payload.formProposal ? { formProposal: payload.formProposal } : {}),
      } as ChatMessage,
    );
    if (payload.formOpened) {
      payload.formOpened.instanceId = toUuid(payload.formOpened.instanceId);
      this.instanceId = payload.formOpened.instanceId;
    }
    return payload;
  }

  get proposal(): ChatFormProposal | null {
    for (let index = this.messages.length - 1; index >= 0; index -= 1) {
      const proposal = this.messages[index]!.formProposal;
      if (proposal) return proposal;
    }
    return null;
  }
}

function line(content: string, label: string): string | null {
  const found = content.split("\n").find((entry) => entry.trim().startsWith(`**${label}:**`));
  return found ? found.trim().slice(`**${label}:**`.length).trim() : null;
}

const EMPLOYEE = { employeeName: "Test Employee" };



const B1 =
  "create verbal ca for Test Employee for opening store late on 10-1-26. previous coaching is jba policy manual 1-1-26. payroll deduct DOES apply and state $25 will be payroll deducted";
const POLICY = (answer: Answer) => line(answer.content, "Policy") ?? "";

describe("B1: a described late opening names Late Opening on the proposal flow", () => {
  it.each([
    [B1],
    ["create verbal ca for Test Employee, she opened the store late on 10-1-26. payroll deduct no"],
    ["create verbal ca for Test Employee for being late to open on 10-1-26. payroll deduct no"],
  ])("%s", async (words) => {
    const answer = await new Thread().say(words, EMPLOYEE);
    expect(answer.formProposal?.templateKey).toBe("dpoa");
    expect(POLICY(answer)).toMatch(/^Late Opening\b/);
  });

  it("late for a shift is still not a late opening", async () => {
    const answer = await new Thread().say(
      "create verbal ca for Test Employee for opening store late on 10-1-26, she was also late for her shift on 10-2-26. payroll deduct no",
      EMPLOYEE,
    );
    expect(POLICY(answer)).not.toMatch(/^Late Opening\b/);
  });

  it("the full remap still names Late Opening", async () => {
    process.env.FORM_FULL_REMAP_ENABLED = "true";
    const answer = await new Thread().say(B1, EMPLOYEE);
    expect(POLICY(answer)).toMatch(/^Late Opening\b/);
  });

  it("flag off: no policy is named, as live", async () => {
    delete process.env[FLAG];
    const answer = await new Thread().say(B1, EMPLOYEE);
    expect(POLICY(answer)).toBe("");
  });
});

/*
 * QA-6 on the sibling app's port of this fix (26 Oct 2026), in this app's
 * words: an approved late opening is no offense, and a late opening with an
 * early leave is the Attendance section's too. Lowercase, Sentence case and
 * ALL CAPS, flag on, on the proposal flow.
 */
const variants = (sentence: string) => [
  sentence.toLowerCase(),
  sentence.charAt(0).toUpperCase() + sentence.slice(1),
  sentence.toUpperCase(),
];
const request = (sentence: string) => `create verbal ca for Test Employee on 10-1-26. ${sentence}. payroll deduct no`;

describe("QA-6: not every late opening is the Late Opening policy", () => {
  it.each([
    ...variants("opening the store late was approved by the manager"),
    ...variants("she opened the location late and also left early"),
    ...variants("late for shift at the store"),
    ...variants("she was late for her shift at the store"),
    // QA-7 (26 Oct 2026): a denied late opening is none.
    ...variants("she did not open the store late"),
    ...variants("she never opened the store late"),
    ...variants("she didn't open the store late"),
    ...variants("she wasn't late to open the store"),
    ...variants("she was not late to open the store"),
    ...variants("she was never late to open the store"),
  ])("%s → no Late Opening policy line", async (sentence) => {
    const answer = await new Thread().say(request(sentence), EMPLOYEE);
    expect(answer.formProposal?.templateKey).toBe("dpoa");
    expect(POLICY(answer)).not.toMatch(/Late Opening/);
  });

  it.each([
    ...variants("opening the store late was not approved"),
    ...variants("she opened the store late without permission"),
    ...variants("she opened the store late"),
    // QA-7: only a sentence that denies the late opening is set aside.
    ...variants("she did not open the store on time, she opened the store late"),
    ...variants("she was late to open the store"),
  ])("%s → still Late Opening", async (sentence) => {
    const answer = await new Thread().say(request(sentence), EMPLOYEE);
    expect(POLICY(answer)).toMatch(/^Late Opening\b/);
  });
});

// QA-7's exact turn (26 Oct 2026), with this file's invented employee.
describe("QA-7: \"wasn't late to open\" is no late opening", () => {
  it.each(variants("write up test employee on 10-1-26, she wasn't late to open the store"))(
    "%s → no Late Opening policy line",
    async (words) => {
      const answer = await new Thread().say(words, EMPLOYEE);
      expect(POLICY(answer)).not.toMatch(/Late Opening/);
    },
  );
});

/*
 * PRODUCTION AS IT IS: LATE_OPEN_DATE_ENABLED on, LATE_OPEN_PLACE_ENABLED off
 * (its default). Every sentence reads as on origin/main: the card names no
 * policy on the proposal flow.
 */
describe("LATE_OPEN_PLACE off, LATE_OPEN_DATE on: the proposal flow is main's", () => {
  it.each([
    [B1],
    ...variants("opening the store late was approved by the manager").map((sentence) => [request(sentence)]),
    ...variants("she opened the location late and also left early").map((sentence) => [request(sentence)]),
    ...variants("she opened the store late").map((sentence) => [request(sentence)]),
    ...variants("late for shift at the store").map((sentence) => [request(sentence)]),
    ...variants("she did not open the store late").map((sentence) => [request(sentence)]),
    ...variants("she never opened the store late").map((sentence) => [request(sentence)]),
    ...variants("she wasn't late to open the store").map((sentence) => [request(sentence)]),
  ])("%s → no policy line", async (words) => {
    delete process.env[PLACE];
    const answer = await new Thread().say(words, EMPLOYEE);
    expect(answer.formProposal?.templateKey).toBe("dpoa");
    expect(POLICY(answer)).toBe("");
  });
});
