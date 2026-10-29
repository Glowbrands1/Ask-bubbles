import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { continuationFor } from "@/lib/forms/proposal-continuation";
import { createId } from "@/lib/utils/id";
import { rosterResultFor } from "@/test/roster-result";
import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import { JBA_MANUAL_CA_CHUNKS } from "@/test/fixtures/jba-manual-ca-sections";
import type { AccessScope, ChatFormProposal, ChatMessage } from "@/types";

/**
 * ============================================================================
 * "SHE WAS LATE LAST WEEK" IS NEVER DRAFTED AS TODAY —
 * UNREAD_DAY_NOT_INCIDENT_DATE_ENABLED
 * ============================================================================
 *
 * QA, 29 Oct 2026: the card asked "I couldn't read "last week" — which date?",
 * the manager pressed Create without answering, the form was dated today, and
 * the Corrective Action draft was told today was the incident's date. Through
 * POST /api/chat and the card's Create with this app's production flags; the
 * drafting model writes what that brief asked for. Names are invented.
 */

const store: FakeStore = {
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
  chat_form_incidents: [],
} as unknown as FakeStore;

const state = vi.hoisted(() => ({
  slotReading: "none" as "none" | "ca" | "copy",
  remapObservation: null as string | null,
  /** What the form-reading model returns for this turn (extract_form_fields). */
  reading: {} as Record<string, unknown>,
  /** Every draft request the model was sent, and every draft route reply. */
  draftPrompts: [] as string[],
  draftReplies: [] as Record<string, unknown>[],
  draft: {} as { values?: Record<string, unknown>; checked?: Record<string, unknown> },
  revision: {} as { values?: Record<string, unknown>; checked?: Record<string, unknown>; clear?: string[] },
  revisionCalls: 0,
  chatModelCalls: 0,
  directory: [] as unknown[],
}));

vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin: () => fakeSupabase(store) }));

vi.mock("@/lib/api/respond", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/respond")>();
  return {
    ...actual,
    assertLiveMode: () => {},
    assertNoConfigurationProblems: () => {},
    assertWithinRateLimit: () => {},
  };
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
          scope: (state as { scope?: unknown }).scope ?? { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] },
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

const ANSWER = "A grounded answer from the policy manual.";

vi.mock("@/lib/ai/call-claude", () => ({
  /*
   * The AI reader (AI_READS_CODE_CHECKS_ENABLED), as the live model reads a
   * lone first name: the name exactly as typed, with its sentence as evidence.
   */
  callClaudeToolTimed: async (input: { messages?: { content?: unknown }[] }) => {
    const text = JSON.stringify(input.messages ?? []);
    const manager = (text.split("Manager: ").pop() ?? "").split("\n")[0]!.replace(/\\"/g, '"').replace(/"\}.*$/, "");
    const named = String(state.reading.employeeName ?? "");
    const name = /\b(katrin)\b/i.exec(manager)?.[1] ?? (named && manager.toLowerCase().includes(named.toLowerCase()) ? named : null);
    return {
      input: {
        employee: name ? { value: name, evidence: manager } : null,
        incident: /late/.test(manager) ? { value: "late", evidence: manager } : null,
        incidentDate: /10\/20/.test(manager) ? { value: "2026-10-20", evidence: "10/20" } : null,
      },
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    };
  },
  callClaude: async () => {
    state.chatModelCalls += 1;
    return ANSWER;
  },
  callClaudeTool: async (input: { tool?: { name?: string }; messages?: { content?: unknown }[] }) => {
    if (input.tool?.name === "extract_form_fields") {
      const text = JSON.stringify(input.messages ?? []);
      return {
        templateKey: /follow-?up coaching/i.test(text) ? "follow-up-coaching" : /\b(?:ca|corrective action)\b/i.test(text) ? "dpoa" : null,
        employeeName: null,
        observation: state.remapObservation,
        actionPlan: null,
        ...state.reading,
      };
    }
    if (input.tool?.name !== "record_intent_slots") return null;
    if (state.slotReading === "copy") {
      const text = JSON.stringify(input.messages ?? []);
      // The model reads the whole conversation; the warning level only from an answer to its question.
      const manager = (text.split("Manager:").pop() ?? text).replace(/\n/g, "\n");
      const all = text.split("Manager:").slice(1).map((turn) => turn.split("Assistant:")[0]!).join("\n");
      const dates = all.match(/\b\d{1,2}-\d{1,2}\b/g) ?? [];
      return {
        employee: /quinn marlowe/i.test(all) ? "Quinn Marlowe" : null,
        store: /kearney/i.test(all) ? "Kearney" : null,
        title: null,
        incidentType: /\blate\b/i.test(all) ? "late" : null,
        incidentDate: dates[0] ?? null,
        payrollAmount: null,
        warningLevel: /^\s*(verbal|written)\W*$/i.exec(manager)?.[1]?.toLowerCase() ?? null,
        formType: "Corrective Action Form",
        formTurn: true,
        policyHeading: null,
      };
    }
    return {
      employee: null,
      store: null,
      title: null,
      incidentType: null,
      incidentDate: null,
      payrollAmount: null,
      warningLevel: null,
      formType: state.slotReading === "ca" ? "Corrective Action Form" : null,
      formTurn: state.slotReading === "ca",
      policyHeading: null,
    };
  },
}));

vi.mock("@/lib/ai/anthropic", () => ({
  getAnthropicClient: () => ({
    messages: {
      create: async (request: { tool_choice?: { name?: string } }) => {
        const revising = request.tool_choice?.name === "revise_form_fields";
        if (!revising) state.draftPrompts.push(JSON.stringify(request));
        if (revising) state.revisionCalls += 1;
        return {
          stop_reason: "tool_use",
          content: [
            {
              type: "tool_use",
              name: revising ? "revise_form_fields" : "write_form_fields",
              input: revising ? state.revision : state.draft,
            },
          ],
        };
      },
    },
  }),
}));

vi.mock("@/lib/knowledge/providers/supabase", () => ({
  SupabaseKnowledgeProvider: class {
    // A seed names the handbook; offline there is none, as a failed lookup.
    async fetchNamedHandbook() {
      return { ok: false, reason: "offline", problem: "not_found" };
    }
    async search() {
      return [];
    }
    async match() {
      return [];
    }
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
      return {
        ok: true,
        documentId: "doc-manual",
        documentTitle: "2025 JBA Policy Manual - Edited 5-2025",
        documentCategory: "policies_compliance",
        matchedBy: "tag",
        chunks: JBA_MANUAL_CA_CHUNKS,
      };
    }
  },
}));

vi.mock("@/lib/knowledge", () => ({
  getKnowledgeProvider: () => {
    throw new Error("getKnowledgeProvider() is the browser knowledge client and must not be used on the server");
  },
}));

vi.mock("@/lib/reporting/read/report-briefing", () => ({ loadReportBriefing: async () => null }));
vi.mock("@/lib/reporting/read/employee-facts", () => ({
  loadEmployeeFacts: async () => null,
  NO_EMPLOYEE_DATA_REASON: "no dataset",
  NO_EMPLOYEE_DATASET_REASON: "no dataset",
  EMPLOYEE_DATA_HEADING: "CURRENT EMPLOYEE PERFORMANCE DATA",
}));

vi.mock("@/lib/forms/employee-roster", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/forms/employee-roster")>();
  return {
    ...actual,
    readDirectoryFacts: async (scope: AccessScope | null) =>
      // No position on record unless the case gives one: the title is the manager's or asked.
      actual.scopeRoster(state.directory as never, scope).map((person) => ({ ...person, title: (person as { positionName?: string | null }).positionName ?? null, primaryLocationName: "Kearney, NE" })),
    loadScopedRoster: async (scope: AccessScope | null) => actual.scopeRoster(state.directory as never, scope),
    loadScopedRosterResult: async (scope: AccessScope | null) => rosterResultFor(actual.scopeRoster, state.directory as never, scope),
  };
});

vi.mock("@/lib/forms/prior-forms", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/forms/prior-forms")>()),
  priorFormsReadingForChat: async () => ({ attach: [], possible: [], identity: "none" }),
}));

process.env.NEXT_PUBLIC_DEMO_MODE = "false";

vi.setConfig({ hookTimeout: 30_000, testTimeout: 30_000 });

const { ensureTemplateLibrary } = await import("@/lib/forms/repository");
const { createInlineForm } = await import("@/features/chat/create-inline-form");
const chatRoute = await import("./route");
const instancesRoute = await import("../forms/instances/route");
const draftRoute = await import("../forms/instances/[id]/draft/route");

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const request = new Request(`https://app.test${url}`, init);
  const draft = /^\/api\/forms\/instances\/([^/]+)\/draft$/.exec(url);
  const response = draft
    ? await draftRoute.POST(request, { params: Promise.resolve({ id: draft[1]! }) })
    : url === "/api/forms/instances"
      ? await instancesRoute.POST(request)
      : null;
  if (!response) throw new Error(`no route for ${url}`);
  const body = (await response.json()) as T & { error?: string };
  if (draft) state.draftReplies.push(body as Record<string, unknown>);
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body;
}

/** The chat route only accepts a UUID for the open form; the fake numbers rows `fake-N`. */
function toUuid(id: string): string {
  if (/^[0-9a-f-]{36}$/.test(id)) return id;
  const uuid = randomUUID();
  for (const table of ["form_instances", "form_instance_values", "form_instance_events"] as const) {
    for (const row of store[table]) {
      if (row.id === id) row.id = uuid;
      if (row.instance_id === id) row.instance_id = uuid;
    }
  }
  return uuid;
}

const TODAY = "2026-10-26";

/**
 * This app's production env (Vercel production, decrypted and read by QA
 * 26 Oct 2026). Every other flag is off — FORM_FULL_REMAP,
 * ACTION_PLAN_MANAGER_ONLY, SLOT_RETENTION and FORM_STATE among them.
 * INTENT_EXTRACTION is off too.
 */
const PRODUCTION = [
  // Ask Bubbles production, 26 Oct 2026 (FORM_FULL_REMAP off: the intent path; ACTION_PLAN_MANAGER_ONLY off).
  "APP_PASSWORD_HELP_ENABLED", "DRAFT_NEVER_BLANK_ENABLED", "DRAFT_REUSE_SAME_CHAT_ONLY_ENABLED", "EXIT_INTAKE_FIX_ENABLED",
  "LATE_OPEN_PAYROLL_FROM_FORM_ENABLED", "MANUAL_NEGATED_LIST_NOTE_ENABLED", "NAME_BEFORE_TITLE_ENABLED", "POLICY_SPECIFIC_TOPICS_ENABLED",
  "REOPEN_VERB_GUARD_ENABLED", "STATE_CODE_NOT_A_PERSON_ENABLED", "STORED_SLOTS_NOT_A_REQUEST_ENABLED",
  "ATTENDANCE_ACTION_PLAN_ENABLED", "HIDE_NO_POLICY_MATCH_NOTICE_ENABLED",
  "ACTION_PLAN_SENTENCES_ENABLED", "CA_TEMPLATE_MAP_ENABLED", "CHAT_TRACE_ENABLED",
  "CONVERSATION_DRAFT_REUSE_ENABLED", "CROSS_CHAT_REPLY_GUARD_ENABLED", "DRAFT_ACTIONS_ENABLED", "FIELD_ACCURACY_ENABLED",
  "FORM_CHOICE_STATED_ENABLED", "FULL_MANUAL_CONTEXT_ENABLED", "GLOBAL_STORE_ASK_ENABLED",
  "GROUNDED_ENTITIES_ENABLED", "KEEP_FORM_EMPLOYEE_ENABLED", "LATE_OPEN_DATE_ENABLED",
  "NOT_A_NAME_GUARD_ENABLED", "PAYROLL_DEDUCT_AMOUNT_ENABLED", "PLACE_SPAN_GUARD_ENABLED", "PRINTED_PAGE_ONLY_ENABLED",
  "PRIOR_ACTIONS_PARSE_ENABLED", "PROMPT_CACHE_ENABLED", "REMAP_DRAFT_SOURCES_ENABLED", "REMAP_INCIDENT_FIX_ENABLED",
  "TITLE_WHOLE_WORD_ENABLED", "TYPED_NAME_ENABLED", "WARNING_LEVEL_MANAGER_ONLY_ENABLED",
] as const;
/** Not production here: the full remap and the flags QA-6 ran it with, as extra coverage. */
const REMAP_EXTRA = ["FORM_FULL_REMAP_ENABLED"] as const;
const FLAG = "PRIOR_SENTENCE_FIX_ENABLED";
/** FORM_DATE_INCIDENT_ONLY_ENABLED (D3, =0 in production) is pinned by each case, never read from the shell. */
const FIO = "FORM_DATE_INCIDENT_ONLY_ENABLED";
const ALL_FLAGS = [...PRODUCTION, "INTENT_EXTRACTION_ENABLED", "SLOT_RETENTION_ENABLED", ...REMAP_EXTRA, FLAG, FIO, "CODE_SLOTS_ENABLED", "POLICY_CITATION_ENABLED", "FORM_STATE_ENABLED", "REMAP_DRAFT_SOURCES_ENABLED", "NEXT_PUBLIC_REMAP_DRAFT_SOURCES_ENABLED", "INTENT_PAYROLL_MANAGER_ONLY_ENABLED", "CHAT_DATA_TOOLS_ENABLED", "CHAT_MEMORY_ENABLED"];

type Answer = {
  content: string;
  formProposal?: ChatFormProposal;
  formSelection?: unknown;
  formOpened?: { instanceId: string; revisesInstanceId?: string | null };
  formUpdate?: { instanceId: string; updated: string[] };
};

/** The thread as the browser holds it: a card the answer carried stays open. */
class Thread {
  readonly messages: ChatMessage[] = [];
  proposal: ChatFormProposal | null = null;
  instanceId: string | null = null;
  private sequence = 0;
  // A well-formed client id, so the route keeps the intake state between turns (`isClientConversationId`).
  private readonly conversationId = createId("conv");

  async say(question: string, reading: Record<string, unknown> = {}): Promise<Answer> {
    state.reading = reading;
    const history = this.messages.map(({ id, role, content, formProposal }) => ({ id, role, content, ...(formProposal ? { formProposal } : {}) }));
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
          // As the browser does: the card on screen, or the intake still asking (`continuationFor`).
          ...(!this.instanceId && continuationFor(this.messages) ? { continueProposalTemplateKey: continuationFor(this.messages)!.templateKey } : {}),
          ...(this.instanceId ? { activeFormInstanceId: this.instanceId } : {}),
        }),
      }),
    );
    const payload = (await response.json()) as Answer & { error?: string };
    expect(response.status, JSON.stringify(payload)).toBe(200);
    this.messages.push(
      { id, role: "user", content: question, createdAt: `${TODAY}T12:28:00Z` } as ChatMessage,
      {
        id: `a${this.sequence}`,
        role: "assistant",
        content: payload.content,
        createdAt: `${TODAY}T12:28:01Z`,
        ...(payload.formProposal ? { formProposal: payload.formProposal } : {}),
      } as ChatMessage,
    );
    if (payload.formProposal) this.proposal = payload.formProposal;
    if (payload.formOpened) this.instanceId = toUuid(payload.formOpened.instanceId);
    return payload;
  }

  /** The card's Create, as the browser does it. */
  async create(): Promise<string> {
    expect(this.proposal, "no card to create from").not.toBeNull();
    const result = await createInlineForm({ proposal: this.proposal!, messages: this.messages, call, onCreated: () => {} });
    this.instanceId = toUuid(result.reference.instanceId);
    return this.instanceId;
  }
}


const saved = new Map<string, string | undefined>();
function joinOverview() {
  for (const row of store.form_instances ?? []) {
    const template = store.form_templates!.find((entry) => entry.id === row.template_id);
    const version = store.form_template_versions.find((entry) => entry.id === row.template_version_id);
    Object.assign(row, { template_key: template?.key, template_name: template?.name, layout_family: template?.layout_family, template_version: version?.version });
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
  for (const key of Object.keys(store) as (keyof FakeStore)[]) store[key] = [];
  store.form_instances = new JoiningRows() as never;
  state.slotReading = "none";
  state.remapObservation = null;
  state.reading = {};
  state.draftPrompts = [];
  state.draftReplies = [];
  state.draft = { values: {} };
  state.revision = { values: {} };
  state.directory = [
    { id: "e-1", firstName: "Quinn", lastName: "Marlowe", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-66"], positionName: null },
    { id: "e-2", firstName: "Dale", lastName: "Ferris", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-66"], positionName: null },
    { id: "e-3", firstName: "Ivy", lastName: "Hollis", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-66"], positionName: null },
  ];
  for (const name of ALL_FLAGS) saved.set(name, process.env[name]);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T15:30:00Z`));
  await ensureTemplateLibrary("system");
});
afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  vi.useRealTimers();
});





const JT = "JOB_TITLE_FROM_WORDS_ENABLED";

function setProduction(on: boolean) {
  for (const name of [...ALL_FLAGS, JT]) {
    if (!saved.has(name)) saved.set(name, process.env[name]);
    delete process.env[name];
  }
  for (const name of PRODUCTION) process.env[name] = "true";
  // Live in this app.
  for (const name of [FLAG, "POSITION_ANSWER_GUARD_ENABLED", "PRIOR_STEP_SENTENCE_ENABLED", "DATE_ANSWER_APPLIED_ENABLED", "DATE_ANSWER_KEEPS_OPEN_ENABLED", "NAME_QUESTION_ONLY_ENABLED"]) process.env[name] = "true";
  process.env.REMAP_DRAFT_SOURCES_ENABLED = "true";
  process.env.NEXT_PUBLIC_REMAP_DRAFT_SOURCES_ENABLED = "true";
  if (on) process.env[JT] = "true";
}


const FLAG_UD = "UNREAD_DAY_NOT_INCIDENT_DATE_ENABLED";
/** Today in this harness, as the draft writes it. */
const TODAY_LONG = "October 26, 2026";

/** What the drafting model wrote when told the form's date was the incident's. */
function modelDated(key: string, when = `On ${TODAY_LONG}`) {
  return {
    values: {
      [key]: `Observed:\n${when}, Tessa Ormond was late to her scheduled shift.\n\nExpectation:\nEmployees are expected to arrive on time for their scheduled shifts.\n\nGoing Forward:\nTessa should arrive on time and ready to work.`,
    },
    checked: {},
  };
}

async function created(on: boolean, said: string, key = "observation", when?: string) {
  // Each run is its own manager's first form: the store starts empty, as in `beforeEach`.
  for (const table of Object.keys(store) as (keyof FakeStore)[]) store[table] = [];
  store.form_instances = new JoiningRows() as never;
  await ensureTemplateLibrary("system");
  for (const name of [FLAG_UD, "UNREAD_DATE_ASK_ENABLED"]) if (!saved.has(name)) saved.set(name, process.env[name]);
  setProduction(true);
  process.env.UNREAD_DATE_ASK_ENABLED = "true";
  delete process.env[FLAG_UD];
  if (on) process.env[FLAG_UD] = "true";
  state.directory = [
    { id: "e-1", firstName: "Tessa", lastName: "Ormond", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-66"], positionName: null },
  ];
  state.draft = modelDated(key, when);
  state.draftPrompts = [];
  state.draftReplies = [];
  const thread = new Thread();
  const card = await thread.say(said, { employeeName: "Tessa Ormond" });
  const id = await thread.create();
  // Read now: the next run empties the store.
  const kept = new Map(store.form_instance_values.filter((row) => row.instance_id === id).map((row) => [String(row.field_key), String(row.value ?? "")]));
  const value = (field: string) => kept.get(field) ?? "";
  const notices = state.draftReplies.map((reply) => String(reply.notice ?? "")).join("\n");
  return { card, value, prompt: state.draftPrompts.join("\n"), notices };
}

const LAST_WEEK = "create a CA for Tessa Ormond at Kearney, she was late last week, verbal, no payroll";
const DATED = "create a CA for Tessa Ormond at Kearney, she was late on 10-20-26, verbal, no payroll";
const NOTICE = 'The form is dated today; you wrote "last week" - set the incident date on the form.';
const formDateLine = (prompt: string) => prompt.match(/FORM DATE:[^"\\]*(?:\\"[^"\\]*\\"[^"\\]*)*/)?.[0] ?? null;

describe('"she was late last week", Create without answering the date question', () => {
  it("off (production today): the draft is told today is the incident date, and the record says so", async () => {
    const { card, value, prompt, notices } = await created(false, LAST_WEEK);
    expect(card.content).toContain('I couldn\'t read "last week"');
    expect(prompt).toContain(`FORM DATE: ${TODAY_LONG}`);
    expect(prompt).toContain("This is the date of the incident and of this form.");
    expect(value("observation")).toContain(TODAY_LONG);
    expect(notices).not.toContain("you wrote");
  });

  it("on: today is not the incident's date, the record never states it as one, and the manager is told", async () => {
    const { value, prompt, notices } = await created(true, LAST_WEEK);
    expect(prompt).toContain("NOT the date of the incident");
    expect(prompt).toContain("say when it happened in the manager's own words");
    expect(prompt).not.toContain("This is the date of the incident and of this form.");
    expect(value("observation")).not.toContain(TODAY_LONG);
    expect(notices).toContain(NOTICE);
  });

  it("on: a draft that says it in the manager's words (\"Last week, …\") keeps the sentence", async () => {
    const { value } = await created(true, LAST_WEEK, "observation", "Last week");
    expect(value("observation")).toContain("Last week, Tessa Ormond was late to her scheduled shift.");
  });

  it("on, the manager gave a calendar date: drafted exactly as before, and no notice", async () => {
    const off = await created(false, DATED);
    const on = await created(true, DATED);
    expect(on.prompt).not.toContain("NOT the date of the incident");
    expect(formDateLine(on.prompt)).toBe(formDateLine(off.prompt));
    expect(on.value("observation")).toBe(off.value("observation"));
    expect(on.value("observation")).toContain("Tessa Ormond was late");
    expect(on.notices).toBe(off.notices);
  });

  it("on, the Coaching Form: unaffected (it is never told a form date)", async () => {
    const said = "create a coaching form for Tessa Ormond at Kearney, she was late last week";
    const off = await created(false, said, "coaching_details");
    const on = await created(true, said, "coaching_details");
    expect(on.prompt).not.toContain("FORM DATE:");
    expect(on.value("coaching_details")).toBe(off.value("coaching_details"));
    expect(on.notices).toBe(off.notices);
  });
});
