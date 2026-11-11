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
 * MANAGER_WORDS_ONLY_ENABLED AND FORM_EDIT_DATE_RULES_ENABLED ON THE LIVE PATH
 * ============================================================================
 *
 * QA, 29 Oct 2026 (Pau: "Fix it and ask testers to validate targeted problem
 * only"): both flags were built and tested on the full remap
 * (FORM_FULL_REMAP_ENABLED), which production switched off on 26 Oct. These
 * cases run every report's exact wording through POST /api/chat and the
 * card's Create on the path production uses today — the proposal path, with
 * this app's production flags as of 29 Oct 2026 — with each flag off (as
 * production) and on. Names are invented.
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
  /** Every draft request the model was sent. */
  draftPrompts: [] as string[],
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
    const manager = (text.split("Manager: ").pop() ?? "").split("\\n")[0]!.replace(/\\"/g, '"').replace(/"\}.*$/, "");
    const named = String(state.reading.employeeName ?? "");
    const name = /\b(katrin)\b/i.exec(manager)?.[1] ?? (named && manager.toLowerCase().includes(named.toLowerCase()) ? named : null);
    return {
      input: {
        employee: name ? { value: name, evidence: manager } : null,
        incident: /late/.test(manager) ? { value: "late", evidence: manager } : null,
        ...(state.reading.readerTitle && /ass't store manager/i.test(manager) ? { jobTitle: { value: state.reading.readerTitle, evidence: "ass't store manager" } } : {}),
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
      const manager = (text.split("Manager:").pop() ?? text).replace(/\\n/g, "\n");
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
const instanceRoute = await import("../forms/instances/[id]/route");

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
      if (row.revises_instance_id === id) row.revises_instance_id = uuid;
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


/*
 * Production on 29 Oct 2026: the 26 Oct read above, and every flag Vercel
 * production lists as on since (read 29 Oct; FORM_FULL_REMAP still off).
 */
const LIVE_SINCE_26 = [
  "ACCOUNT_ONLY_POLICY_QUERY_ENABLED", "ADDITIONAL_LOCATION_TAKEN_ENABLED", "AI_READS_CODE_CHECKS_ENABLED", "AMOUNT_TURN_STAYS_ENABLED",
  "AMOUNT_UNKNOWN_ACK_ENABLED", "ANIMAL_ANYWHERE_ENABLED", "ANSWER_NOT_A_NAME_ENABLED", "CARD_CHANGE_PLAN_REBUILD_ENABLED",
  "DATE_ANSWER_KEEPS_OPEN_ENABLED", "DATE_LINE_NO_ECHO_ENABLED", "DATE_REASK_FRESH_ENABLED", "DAY_WORD_TYPOS_ENABLED",
  "DECIMAL_NOT_SENTENCE_END_ENABLED", "EXIT_FULFILLED_IS_LAST_DAY_ENABLED", "EXIT_READBACK_JOB_TITLE_ENABLED", "FIRST_NAME_ASK_ENABLED",
  "FIRST_NAME_SUGGEST_ENABLED", "FOLLOW_UP_CITATION_FIELD_ENABLED", "FORM_TYPE_SWITCH_AFTER_CREATE_NOTE_ENABLED", "FORM_TYPE_SWITCH_ENABLED",
  "FUTURE_PRIOR_ROW_DROP_ENABLED", "JOB_TITLE_APPOSITION_ENABLED", "JOB_TITLE_FROM_WORDS_ENABLED", "LAST_FIRST_NAME_READ_ENABLED",
  "LEVEL_STEP_NOT_ACCOUNT_ENABLED", "MEETING_NOT_LATENESS_PLAN_ENABLED", "NAME_QUESTION_ONLY_ENABLED", "NOT_DEDUCTIBLE_READ_ENABLED",
  "ORDINAL_DATE_IN_DRAFT_ENABLED", "OUT_OF_SCOPE_PLACE_KEEPS_OWN_ENABLED", "OUT_OF_SCOPE_PLACE_SAID_ENABLED", "PAYROLL_TYPO_ANSWER_ENABLED",
  "PLAN_PAYROLL_SENTENCE_ENABLED", "PRIOR_ROW_NOT_ON_INCIDENT_DATE_ENABLED", "PRIOR_STEP_SENTENCE_ENABLED", "RELATIVE_DATE_READER_ENABLED",
  "STEP_DATE_NOT_INCIDENT_ENABLED", "STORE_WORD_NOT_A_NAME_ENABLED", "TYPO_READING_COPY_ENABLED", "TYPO_READING_ROUTES_ENABLED",
  "UNKNOWN_NAME_ASK_ENABLED", "UNREAD_DATE_ASK_ENABLED", "WARNING_LEVEL_AND_CLAUSE_ENABLED", "WIDER_DATE_READER_ENABLED",
  "FRAMEWORK_UNPIN_ENABLED",
] as const;
const EDIT_DATES = "FORM_EDIT_DATE_RULES_ENABLED";
const WORDS_ONLY = "MANAGER_WORDS_ONLY_ENABLED";

/** Production today, plus `extra` flags on. */
function live(...extra: string[]) {
  for (const name of [...LIVE_SINCE_26, EDIT_DATES, WORDS_ONLY, "FORM_FULL_REMAP_ENABLED", "INTENT_EXTRACTION_ENABLED"]) {
    if (!saved.has(name)) saved.set(name, process.env[name]);
    delete process.env[name];
  }
  setProduction(true);
  for (const name of [...LIVE_SINCE_26, ...extra]) process.env[name] = "true";
  state.directory = [
    { id: "e-1", firstName: "Tessa", lastName: "Ormond", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-66"], positionName: null },
    { id: "e-3", firstName: "Rowan", lastName: "Kestrel", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-66"], positionName: null },
  ];
}

function line(content: string, label: string): string | null {
  const found = content.split("\n").find((entry) => entry.trim().startsWith(`**${label}:**`));
  return found ? found.trim().slice(`**${label}:**`.length).trim() : null;
}
/** The card's Issue line, as the manager reads it. */
const issue = (answer: Answer) => line(answer.content, "Issue")?.split(" · ")[0] ?? "";
const EMPLOYEE = { employeeName: "Tessa Ormond" };
const row = (id: string) => (store.form_instances ?? []).find((entry) => entry.id === id) ?? null;

async function finalize(id: string) {
  const response = await instanceRoute.POST(
    new Request(`https://app.test/api/forms/instances/${id}`, {
      method: "POST",
      body: JSON.stringify({ action: "finalize", followUpDate: null, acknowledgeUnverifiedPolicy: true }),
    }),
    { params: Promise.resolve({ id }) },
  );
  joinOverview();
  expect(response.status, JSON.stringify(await response.clone().json())).toBe(200);
}

const REQUEST = "create a CA for Tessa Ormond at Kearney for being late to open on 10-20-26, verbal, no payroll";
const INCIDENT = "create a CA for Tessa Ormond at Kearney for being late to open on 10-20-26, verbal, no payroll";
const LITERAL =
  "Tessa completed onboarding with new hire Pell Newhire on 9-28-26. As of 10-16-26 Pell had not acknowledged onboarding policies in Woven that should have been completed during onboarding.";

/* ===================================================== FORM_EDIT_DATE_RULES == */

describe("FORM_EDIT_DATE_RULES on the live path: an edit edits the card, it never becomes the Issue", () => {
  it('B17 conv_mvnuh50i2hanl53: "add that she was also on her phone" is added to the Issue in her words, and Create drafts from both', async () => {
    live(EDIT_DATES);
    const thread = new Thread();
    expect(issue(await thread.say(REQUEST, EMPLOYEE))).toBe(INCIDENT);
    const added = await thread.say("add that she was also on her phone", EMPLOYEE);
    expect(issue(added)).toBe(`${INCIDENT}. she was also on her phone`);
    expect(added.formProposal?.issue).toBe(`${INCIDENT}. she was also on her phone`);
    expect(added.content).toContain('Added to **What happened**, in your words: "she was also on her phone"');
    await thread.create();
    expect(store.form_instances).toHaveLength(1);
    const prompt = state.draftPrompts.join("\n");
    expect(prompt).toContain("late to open on 10-20-26");
    expect(prompt).toContain("she was also on her phone");
  });

  it('S22: "change observation of offense to: …" makes the Issue exactly the manager\'s text', async () => {
    live(EDIT_DATES);
    const thread = new Thread();
    await thread.say("create a CA for general manager, tessa ormond for violating the standards of conduct", { employeeName: "tessa ormond" });
    await thread.say("Tessa Ormond, General Manager", EMPLOYEE);
    const changed = await thread.say(`change observation of offense to: ${LITERAL}`, EMPLOYEE);
    expect(issue(changed)).toBe(LITERAL);
    expect(changed.formProposal?.issue).toBe(LITERAL);
    expect(changed.content).toContain("**What happened** now reads exactly as you wrote it.");
  });

  it("S12: a grammar request is answered, and the Issue is untouched", async () => {
    live(EDIT_DATES);
    const thread = new Thread();
    const first = await thread.say(REQUEST, EMPLOYEE);
    const asked = await thread.say("can you clean up my grammar and capitalizing on proper nouns?", EMPLOYEE);
    expect(issue(asked)).toBe(issue(first));
    expect(asked.content).toMatch(/won't add or change any facts/);
  });

  it('conv_mvnsowzl20ljr9m: "change the date to 10-23-26" sets the Date and is never the Issue', async () => {
    live(EDIT_DATES);
    const thread = new Thread();
    await thread.say(
      "create a follow-up coaching form for Tessa Ormond at Kearney. Follow-up observation: she now greets every guest. Progress level: improving. Specific evidence: greeted 20 of 20 guests on 10-22-26",
      EMPLOYEE,
    );
    const changed = await thread.say("change the date to 10-23-26", EMPLOYEE);
    expect(changed.formProposal?.formDate).toBe("2026-10-23");
    expect(changed.content).not.toMatch(/\*\*Issue:\*\* change the date/i);
  });

  it('(d) "can you reference the late opening policy INSTEAD of the attendance policy" cites Late Opening', async () => {
    live(EDIT_DATES);
    const thread = new Thread();
    await thread.say("create corrective action for for Tessa Ormond for Late Opening from the policy manual. It is a verbal warning", EMPLOYEE);
    await thread.say("can you add late opening policy to the direct policy section of this from", EMPLOYEE);
    const swapped = await thread.say("can you reference the late opening policy INSTEAD of the attendance policy", EMPLOYEE);
    expect(swapped.content).toMatch(/Late Opening, as you said/);
    expect(swapped.content).not.toMatch(/Attendance, as you said/);
  });

  it('S21: "can you edit the form I already finalized … change the date to 10-20-26" opens a revision dated 10-20', async () => {
    live(EDIT_DATES);
    const earlier = new Thread();
    await earlier.say("create a corrective action form for Tessa Ormond for opening the store late on 10-17-26. payroll deduct no", EMPLOYEE);
    const original = await earlier.create();
    await finalize(original);
    const thread = new Thread();
    await thread.say("create ca for Tessa Ormond", EMPLOYEE);
    const edited = await thread.say("can you edit the form I already finalized for Tessa Ormond? change the date to 10-20-26", EMPLOYEE);
    expect(edited.formProposal).toBeUndefined();
    expect(edited.formOpened?.revisesInstanceId).toBe(original);
    expect(row(edited.formOpened!.instanceId)?.form_date).toBe("2026-10-20");
    expect(row(original)?.status).toBe("finalized");
  });

  describe("dates already follow the incident on this path (guards)", () => {
    beforeEach(() => live(EDIT_DATES));
    it('conv_mvnsqglc2v7zuyk: "jba manual 11-1-25" (the prior coaching) does not date the form', async () => {
      const thread = new Thread();
      await thread.say(
        "do verbal for team member Tessa Ormond at empire, sd. payroll deduct does not apply. previous coaching jba manual 11-1-26. on 10-22-26 Tessa was not scheduled to work and came into the store to show her team her new puppy. Tessa was in the store 45 min",
        EMPLOYEE,
      );
      await thread.say("jba manual 11-1-25");
      await thread.say("cite pets in workplace");
      await thread.say("cite animals in the workplace policy");
      const answer = await thread.say("store location is empire, sd. create corrective action", EMPLOYEE);
      expect(answer.formProposal?.formDate).toBe("2026-10-22");
    });
    it('Q7: "late to open on 10-20, she was coached on 9-15" is dated 10-20', async () => {
      const answer = await new Thread().say("create a CA for Tessa Ormond at Kearney, late to open on 10-20, she was coached on 9-15 for being late", EMPLOYEE);
      expect(answer.formProposal?.formDate).toBe("2026-10-20");
    });
    it('B15 conv_mvnu46n823v1unt: "she opened the store late today" is dated today', async () => {
      const answer = await new Thread().say("create a CA for Tessa Ormond at Kearney, she opened the store late today", EMPLOYEE);
      expect(answer.formProposal?.formDate).toBe(TODAY);
    });
  });
});

describe("FORM_EDIT_DATE_RULES off: production today", () => {
  it('B17: the Issue becomes "add that she was also on her phone"', async () => {
    live();
    const thread = new Thread();
    await thread.say(REQUEST, EMPLOYEE);
    expect(issue(await thread.say("add that she was also on her phone", EMPLOYEE))).toBe("add that she was also on her phone");
  });
  it("S22: the Issue keeps \"general manager\"", async () => {
    live();
    const thread = new Thread();
    await thread.say("create a CA for general manager, tessa ormond for violating the standards of conduct", { employeeName: "tessa ormond" });
    await thread.say("Tessa Ormond, General Manager", EMPLOYEE);
    expect(issue(await thread.say(`change observation of offense to: ${LITERAL}`, EMPLOYEE))).toBe("general manager");
  });
  it("(d): Attendance", async () => {
    live();
    const thread = new Thread();
    await thread.say("create corrective action for for Tessa Ormond for Late Opening from the policy manual. It is a verbal warning", EMPLOYEE);
    await thread.say("can you add late opening policy to the direct policy section of this from", EMPLOYEE);
    expect((await thread.say("can you reference the late opening policy INSTEAD of the attendance policy", EMPLOYEE)).content).toMatch(/Attendance, as you said/);
  });
});

/* ======================================================= MANAGER_WORDS_ONLY == */

const PASTE =
  "When an employee assigned to open a location is unable to open the location at the proper\ntime, the employee must notify the manager as soon as possible. The manager of the salon will\nbe required to open the salon and work until the person originally assigned arrives, or a\nreplacement is found. The employee who failed to open will then be required to reimburse The\nCompany $25.00 via payroll deduction (when applicable and following all state and local\nguidelines), for all expenses incurred. Managers or District Managers will be responsible for\noffering restitution to affected clients, as well as giving the payroll deduct total to Payroll. *";
const HR =
  "Please make me a coaching form for tessa ormond at the kearney location Tessa did not complete closing duties. Trash was not taken out of the bathrooms, there was no\ntoilet paper in the women's bathroom, and there were no spray towels in the rooms also all the cleaning duties were signed off in the binder and not alll were completed and the way she signed off on the checklist was incorrect she signed one box with a arrown throught the rest each box needs an initial";
const ASST = "create coaching form. tessa ormond is ass't store manager. tessa did not call anyone about opening late";

describe("MANAGER_WORDS_ONLY on the live path (no code change needed; QA round 4, 24 Oct 2026)", () => {
  it('2. "ass\'t store manager" is Assistant Manager on the card (off: Store Manager)', async () => {
    live(WORDS_ONLY);
    expect((await new Thread().say(ASST, EMPLOYEE)).formProposal?.employeeRole).toBe("Assistant Manager");
    live();
    expect((await new Thread().say(ASST, EMPLOYEE)).formProposal?.employeeRole).toBe("Store Manager");
  });

  it('1, 3, 4: a copied clause, "HR" out of "throught", and a pasted Late Opening paragraph are never the title', async () => {
    live(WORDS_ONLY);
    const clause = new Thread();
    await clause.say("Create a coaching form for a performance concern.");
    const first = await clause.say("name is tessa ormond, todays date, kearney location, tessa was late opening store", EMPLOYEE);
    expect(first.formProposal?.employeeRole ?? null).toBeNull();
    expect((await new Thread().say(HR, EMPLOYEE)).formProposal?.employeeRole ?? "").not.toMatch(/HR|It happened/);
    const pasted = new Thread();
    await pasted.say("create a CA form for tessa ormond, soap maker at kearney, for opening store late on 9-28-26", EMPLOYEE);
    await pasted.say("this should be a written and note a verbal ca was given on 9-1-26", EMPLOYEE);
    expect((await pasted.say(PASTE, EMPLOYEE)).formProposal?.employeeRole ?? "").not.toMatch(/District Manager/);
  });
});

/*
 * QA, 29 Oct 2026, live with MANAGER_WORDS_ONLY on: the name is not on the
 * roster (invented), the form is the Coaching Form, and the tester's next turn
 * was "kearney". Live gave Position "Store Manager" on both turns; this
 * harness gave it on the second. Every reading the AI reader could return for
 * the title is tried.
 */
describe("MANAGER_WORDS_ONLY, a name not on the roster, and the next turn (QA live, 29 Oct 2026)", () => {
  for (const readerTitle of ["", "ass't store manager", "Store Manager"]) {
    it(`"ass't store manager" stays Assistant Manager after "kearney"${readerTitle ? ` (reader: ${readerTitle})` : ""}`, async () => {
      live(WORDS_ONLY);
      state.directory = [{ id: "e-3", firstName: "Rowan", lastName: "Kestrel", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-66"], positionName: null }];
      const thread = new Thread();
      const first = await thread.say(ASST, { ...EMPLOYEE, readerTitle });
      const next = await thread.say("kearney", { ...EMPLOYEE, readerTitle });
      expect(first.formProposal?.employeeRole).toBe("Assistant Manager");
      expect(next.formProposal?.employeeRole).toBe("Assistant Manager");
      expect(next.content).not.toMatch(/\bStore Manager\b/);
    });
  }

  it("off (production): Store Manager, as before", async () => {
    live();
    state.directory = [{ id: "e-3", firstName: "Rowan", lastName: "Kestrel", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-66"], positionName: null }];
    const thread = new Thread();
    await thread.say(ASST, EMPLOYEE);
    expect((await thread.say("kearney", EMPLOYEE)).formProposal?.employeeRole).toBe("Store Manager");
  });
});
