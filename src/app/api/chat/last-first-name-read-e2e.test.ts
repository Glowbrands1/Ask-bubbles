import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { continuationFor } from "@/lib/forms/proposal-continuation";
import { createId } from "@/lib/utils/id";
import { rosterResultFor } from "@/test/roster-result";
import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { AccessScope, ChatFormProposal, ChatMessage } from "@/types";

/**
 * ============================================================================
 * "CALDER, REMY": LAST_FIRST_NAME_READ_ENABLED (NO MODEL) OFF AND ON
 * ============================================================================
 *
 * Ported from Ask Sunny (QA's "Last, First" variants, 27 Oct 2026), names
 * invented: through POST /api/chat, Create and the draft with this app's
 * production flags and every flag shipped since on, the AI reader OFF. Off, a
 * "Last, First" name is read as today's readers read it; on, it is the one
 * roster person it fits, with no model call. Anything else is unchanged.
 */

/**
 * Invented people only; the repository is public. Dodge is store 264
 * ("Omaha, NE (West Dodge Rd)"), Grand Island store 236
 * (src/config/company/locations.ts).
 */
const ROSTER = [
  { id: "e-1", firstName: "Quinn", lastName: "Marlowe", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" },
  { id: "e-2", firstName: "Dale", lastName: "Ferris", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member" },
  { id: "e-3", firstName: "Mara", lastName: "Quill", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Location Manager" },
  { id: "e-4", firstName: "Ivy", lastName: "Hollis", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-236"], positionName: "Team Member" },
];
const STORE_NAMES: Record<string, string> = { "loc-264": "Omaha, NE (West Dodge Rd)", "loc-236": "Grand Island, NE" };

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
  reading: null as Record<string, unknown> | null,
  readerCalls: 0,
  stall: false,
  slotReading: "none" as "none" | "ca",
  remapObservation: null as string | null,
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

const ANSWER = "A grounded answer from the policy manual.";

vi.mock("@/lib/ai/call-claude", async (importOriginal) => ({
  // The reader's call runs for real (its limit, no retry), against the stubbed client below.
  callClaudeToolTimed: (await importOriginal<typeof import("@/lib/ai/call-claude")>()).callClaudeToolTimed,
  callClaude: async () => {
    state.chatModelCalls += 1;
    return ANSWER;
  },
  callClaudeTool: async (input: { tool?: { name?: string }; messages?: { content?: unknown }[] }) => {
    if (input.tool?.name === "extract_form_fields") {
      const text = JSON.stringify(input.messages ?? []);
      return {
        templateKey: /\b(?:ca|corrective action)\b/i.test(text) ? "dpoa" : null,
        // The report measures the code's own reading: the extraction model names nobody.
        employeeName: null,
        observation: state.remapObservation,
        actionPlan: null,
      };
    }
    if (input.tool?.name !== "record_intent_slots") return null;
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
        if (request.tool_choice?.name === "record_form_reading") {
          state.readerCalls += 1;
          if (state.stall) return new Promise((_resolve, reject) => setTimeout(() => reject(new Error("timed out")), 3_600));
          if (!state.reading) throw new Error("the reader's model is down");
          return {
            stop_reason: "tool_use",
            content: [{ type: "tool_use", name: "record_form_reading", input: state.reading }],
            usage: { input_tokens: 3500, output_tokens: 380, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
          };
        }
        const revising = request.tool_choice?.name === "revise_form_fields";
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
    async fetchNamedHandbook() {
      return { ok: false, reason: "not used" };
    }
    async fetchOfficialPolicyManual() {
      return {
        ok: true,
        documentId: "doc-manual",
        documentTitle: "2025 JBA Policy Manual - Edited 5-2025",
        documentCategory: "policies_compliance",
        matchedBy: "tag",
        chunks: (rows.chunks as Parameters<typeof manualChunkFromRow>[0][]).map(manualChunkFromRow),
      };
    }
  },
};
});

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
      actual.scopeRoster(state.directory as never, scope).map((person) => {
        const row = person as unknown as { positionName?: string; locationIds?: string[] };
        return { ...person, title: row.positionName ?? null, primaryLocationName: STORE_NAMES[row.locationIds?.[0] ?? ""] ?? null };
      }),
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
const chatRoute = await import("@/app/api/chat/route");
const instancesRoute = await import("@/app/api/forms/instances/route");
const draftRoute = await import("@/app/api/forms/instances/[id]/draft/route");

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
  formOpened?: { instanceId: string };
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

  async say(question: string): Promise<Answer> {
    const history = this.messages.map(({ id, role, content }) => ({ id, role, content }));
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
  state.draft = { values: {} };
  state.revision = { values: {} };
  state.directory = [...ROSTER];
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


const LIVE_SINCE = ["PRIOR_SENTENCE_FIX_ENABLED", "REMAP_DRAFT_SOURCES_ENABLED", "NEXT_PUBLIC_REMAP_DRAFT_SOURCES_ENABLED"] as const;
const AI = "AI_READS_CODE_CHECKS_ENABLED";
const LAST_FIRST = "LAST_FIRST_NAME_READ_ENABLED";
let lastFirstOn = false;
/**
 * Every flag this app shipped since the PRODUCTION list above (26-27 Oct 2026),
 * in the parity list's order from PAYROLL_TYPO_NOT_A_NAME_ENABLED, both
 * spend-guard flags included: the reader may only ADD to a chat in which all of
 * them are live.
 */
const THIS_WEEK = [
  "DATE_ANSWER_APPLIED_ENABLED", "DATE_ANSWER_KEEPS_OPEN_ENABLED", "REQUEST_LINE_ACCOUNT_ENABLED",
  "PAYROLL_TYPO_NOT_A_NAME_ENABLED", "POSITION_ANSWER_GUARD_ENABLED", "PRIOR_ROW_NOT_ON_INCIDENT_DATE_ENABLED",
  "NEXT_PUBLIC_ASD_NO_FORM_MONITORING_ENABLED", "PRIVATE_CREATOR_FORMS_ENABLED", "NOT_DEDUCTIBLE_READ_ENABLED",
  "PRIOR_STEP_SENTENCE_ENABLED", "EXIT_FULFILLED_IS_LAST_DAY_ENABLED", "DATE_LINE_NO_ECHO_ENABLED",
  "FUTURE_PRIOR_ROW_DROP_ENABLED", "MEETING_NOT_LATENESS_PLAN_ENABLED", "PLAN_PAYROLL_SENTENCE_ENABLED",
  "NAME_QUESTION_ONLY_ENABLED", "ANIMAL_ANYWHERE_ENABLED", "ANSWER_NOT_A_NAME_ENABLED", "STORE_WORD_NOT_A_NAME_ENABLED",
  "STEP_DATE_NOT_INCIDENT_ENABLED", "JOB_TITLE_FROM_WORDS_ENABLED", "DATE_REASK_FRESH_ENABLED",
  "WARNING_LEVEL_AND_CLAUSE_ENABLED", "LEVEL_STEP_NOT_ACCOUNT_ENABLED", "FIRST_NAME_ASK_ENABLED", "UNKNOWN_NAME_ASK_ENABLED",
  "TYPO_READING_COPY_ENABLED", "DAY_WORD_TYPOS_ENABLED", "AMOUNT_UNKNOWN_ACK_ENABLED", "ACCOUNT_ONLY_POLICY_QUERY_ENABLED",
  "RELATIVE_DATE_READER_ENABLED", "UNREAD_DATE_ASK_ENABLED", "DECIMAL_NOT_SENTENCE_END_ENABLED", "AMOUNT_TURN_STAYS_ENABLED",
  "MODEL_CALL_DAILY_CAP_ENABLED", "MONTHLY_BUDGET_GUARD_ENABLED", "ORDINAL_DATE_IN_DRAFT_ENABLED", "PAYROLL_TYPO_ANSWER_ENABLED",
  "WIDER_DATE_READER_ENABLED", "JOB_TITLE_APPOSITION_ENABLED", "EXIT_READBACK_JOB_TITLE_ENABLED", "FOLLOW_UP_CITATION_FIELD_ENABLED",
] as const;

function setLive(reader: boolean) {
  for (const name of [...ALL_FLAGS, ...LIVE_SINCE, ...THIS_WEEK, AI, LAST_FIRST]) {
    if (!saved.has(name)) saved.set(name, process.env[name]);
    delete process.env[name];
  }
  for (const name of [...PRODUCTION, ...LIVE_SINCE, ...THIS_WEEK]) process.env[name] = "true";
  if (reader) process.env[AI] = "true";
  if (lastFirstOn) process.env[LAST_FIRST] = "true";
}

interface Outcome {
  readonly answers: string[];
  readonly card: string;
  readonly formDate: unknown;
  readonly observation: string;
  readonly values: Record<string, unknown>;
  readonly readerCalls: number;
  /** Why Create was refused, when it was. */
  readonly createError: string | null;
}

/** The chat, then Create and the draft. `written` is what the drafting model wrote for the date. */
async function chat(turns: string[], written: string | null, readerOn: boolean, read: Record<string, unknown> | null): Promise<Outcome> {
  setLive(readerOn);
  state.reading = read;
  state.readerCalls = 0;
  const thread = new Thread();
  const answers: string[] = [];
  for (const turn of turns) answers.push((await thread.say(turn)).content);
  state.draft = { values: { observation: `Observed:\nDale arrived late for the scheduled shift on ${written ?? "the scheduled day"}.\n\nExpectation:\nDale is expected to arrive on time.` } };
  // The card as the manager sees it; `checkedReading` is the reader's quotes for the routes, not shown.
  const card = JSON.stringify(thread.proposal ? { ...thread.proposal, proposalId: undefined, checkedReading: undefined } : null);
  let id: string | null = null;
  let createError: string | null = null;
  try {
    id = await thread.create();
  } catch (error) {
    createError = (error as Error).message;
  }
  const rows = id ? store.form_instance_values.filter((row) => row.instance_id === id) : [];
  const values = Object.fromEntries(rows.map((row) => [String(row.field_key), row.value]));
  return { answers, card, formDate: values.form_date, observation: String(values.observation ?? ""), values, readerCalls: state.readerCalls, createError };
}

async function fresh() {
  for (const key of Object.keys(store) as (keyof FakeStore)[]) store[key] = [];
  store.form_instances = new JoiningRows() as never;
  state.directory = [...ROSTER];
  await ensureTemplateLibrary("system");
}

/** Off and on end on the same chat, card and form (the reader added nothing, changed nothing). */
function expectIdentical(off: Outcome, on: Outcome) {
  expect(on.answers).toEqual(off.answers);
  expect(on.card).toBe(off.card);
  expect(on.values).toEqual(off.values);
  expect(on.createError).toBe(off.createError);
}

// The owner's script for this app (QA, 27 Oct 2026): "create a CA form for dale ferris at dodge. she was late on the 2nd".
const NAME = "create a CA form for dale ferris at dodge";


const NAME_PAIR = "My employee Marlowe, Quinn was late on the 2nd at Dodge. Please create a CA form";

afterEach(() => {
  lastFirstOn = false;
});

describe("a 'Last, First' name, live flags on, no AI reader", () => {
  it("off: the rules keep no employee for 'Marlowe, Quinn'; on: the one roster person, no model call", async () => {
    const off = await chat([NAME_PAIR], "October 2, 2026", false, null);
    await fresh();
    lastFirstOn = true;
    const on = await chat([NAME_PAIR], "October 2, 2026", false, null);
    expect(off.createError).toBe("A form type and an employee are required.");
    expect(JSON.parse(off.card).employeeName).toBeNull();
    expect(off.answers[0]).toContain("I couldn't find **Marlowe** in the Woven roster");
    expect(on.createError).toBeNull();
    expect(on.values.employee_name).toBe("Quinn Marlowe");
    expect(on.formDate).toBe("2026-10-02");
    expect(on.answers[0]).not.toContain("couldn't find");
    expect(on.readerCalls).toBe(0);
  });

  it("the other fields are the rules' own", async () => {
    const off = await chat([NAME_PAIR], "October 2, 2026", false, null);
    await fresh();
    lastFirstOn = true;
    const on = await chat([NAME_PAIR], "October 2, 2026", false, null);
    const [offCard, onCard] = [JSON.parse(off.card), JSON.parse(on.card)];
    for (const key of ["templateKey", "formDate", "locationId", "warningLevel", "payrollDeduct"]) expect(onCard[key]).toEqual(offCard[key]);
  });

  it("a chat with no 'Last, First' pair is identical off and on", async () => {
    const turns = [`${NAME}. she was late on the 2nd`, "yes payroll deduct", "$25"];
    const off = await chat(turns, "October 2, 2026", false, null);
    await fresh();
    lastFirstOn = true;
    const on = await chat(turns, "October 2, 2026", false, null);
    expectIdentical(off, on);
    expect(on.readerCalls).toBe(0);
  });

  it("a name the rules settled is kept even when a pair follows", async () => {
    const turns = [`${NAME}. she was late on the 2nd`, "I meant Ferris, Dale, the same one"];
    const off = await chat(turns, "October 2, 2026", false, null);
    await fresh();
    lastFirstOn = true;
    const on = await chat(turns, "October 2, 2026", false, null);
    expect(JSON.parse(on.card).employeeName).toBe("Dale Ferris");
    expect(on.values.employee_name).toBe(off.values.employee_name);
  });

  it("a pair that fits nobody (or two people) is not read: off = on", async () => {
    const turns = ["Hello, Quinn. Dodge, please. My employee was late on the 2nd. Create a CA form"];
    const off = await chat(turns, "October 2, 2026", false, null);
    await fresh();
    lastFirstOn = true;
    const on = await chat(turns, "October 2, 2026", false, null);
    expectIdentical(off, on);
  });
});
