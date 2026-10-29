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
 * A BUFF CITY MANAGER'S EXIT, 29 OCT 2026 — THE FORM'S OWN WORDS ARE NOT PEOPLE
 * ============================================================================
 *
 * A manager's Resignation/Exit card was right in every field, and Create
 * answered "This proposal is out of date: the conversation now names more
 * than one person (<the person>, drop wage, forfeit bonus)". The manager
 * confirmed: "I removed 'drop wage and forfeit bonus' from the whole prompt
 * and it created the form." The creation check read lowercase two-word
 * phrases ("drop wage", "forfeit bonus", "lees summit", the street) as names.
 * Her exact wording below; the person's name and address are invented.
 * Through the chat route and Create with the flags live in production on
 * 29 Oct 2026 (read from Vercel by QA). Harness from
 * first-name-suggest-e2e.test.ts.
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
  draft: {} as { values?: Record<string, unknown>; checked?: Record<string, unknown> },
  revision: {} as { values?: Record<string, unknown>; checked?: Record<string, unknown>; clear?: string[] },
  revisionCalls: 0,
  chatModelCalls: 0,
  directory: [] as unknown[],
  /** What the AI reader reads as the employee, as typed: a roster name it fills, or a phrase it is refused. */
  readerName: null as string | null,
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
    const name = state.readerName && manager.toLowerCase().includes(state.readerName) ? state.readerName : null;
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
        // As the live model reads "create an exit for …".
        templateKey: /\bexit\b/i.test(text) ? "resignation-exit" : /\b(?:ca|corrective action)\b/i.test(text) ? "dpoa" : null,
        employeeName: null,
        observation: state.remapObservation,
        actionPlan: null,
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
      // As the live slot model reads "create an exit for …".
      formType: /\bexit\b/i.test(JSON.stringify(input.messages ?? [])) ? "Resignation/Exit Form" : state.slotReading === "ca" ? "Corrective Action Form" : null,
      formTurn: state.slotReading === "ca" || /\bexit\b/i.test(JSON.stringify(input.messages ?? [])),
      policyHeading: null,
    };
  },
}));

vi.mock("@/lib/ai/anthropic", () => ({
  getAnthropicClient: () => ({
    messages: {
      create: async (request: { tool_choice?: { name?: string } }) => {
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
  state.readerName = null;
  state.remapObservation = null;
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

const FLAG_ON = "FIRST_NAME_SUGGEST_ENABLED";
const HOME = "loc-264";
const person = (id: string, first: string, last: string, salon: string = HOME) => ({
  id, firstName: first, lastName: last, preferredFirstName: null, employmentStatus: "active", locationIds: [salon], positionName: null,
});
const ROSTERS = {
  one: [person("e-1", "Quinn", "Marlowe"), person("e-3", "Rowan", "Kestrel")],
  two: [person("e-1", "Quinn", "Marlowe"), person("e-2", "Quinn", "Ashby"), person("e-3", "Rowan", "Kestrel")],
  zero: [person("e-3", "Rowan", "Kestrel")],
} as const;

function production(on: boolean, roster: keyof typeof ROSTERS | unknown[], scope?: unknown) {
  if (!saved.has(FLAG_ON)) saved.set(FLAG_ON, process.env[FLAG_ON]);
  setProduction(true);
  delete process.env[FLAG_ON];
  if (on) process.env[FLAG_ON] = "true";
  (state as { scope?: unknown }).scope = scope;
  state.directory = Array.isArray(roster) ? roster : [...ROSTERS[roster]];
}


/*
 * Ask Bubbles production, 29 Oct 2026 (QA, from Vercel): every chat and form
 * flag set on. ANTI_LOOP_ENABLED is not set. The spend guards are left out:
 * they count model calls, which this harness does not make.
 */
const LIVE = [
  "PARTIAL_NAME_CARD_CURRENT_ENABLED", "FIRST_NAME_SUGGEST_ENABLED", "UNREAD_DAY_NOT_INCIDENT_DATE_ENABLED", "MANAGER_WORDS_ONLY_ENABLED",
  "OTHER_WRITE_IN_GUARD_ENABLED", "FORM_EDIT_DATE_RULES_ENABLED", "FRAMEWORK_UNPIN_ENABLED", "CARD_CHANGE_PLAN_REBUILD_ENABLED",
  "OUT_OF_SCOPE_PLACE_KEEPS_OWN_ENABLED", "FORM_TYPE_SWITCH_AFTER_CREATE_NOTE_ENABLED", "NEXT_PUBLIC_CARD_CHANGE_FINALIZED_ENABLED",
  "FORM_TYPE_SWITCH_ENABLED", "ADDITIONAL_LOCATION_TAKEN_ENABLED", "OUT_OF_SCOPE_PLACE_SAID_ENABLED", "LAST_FIRST_NAME_READ_ENABLED",
  "TYPO_READING_ROUTES_ENABLED", "AI_READS_CODE_CHECKS_ENABLED", "TYPO_READING_COPY_ENABLED", "DAY_WORD_TYPOS_ENABLED",
  "AMOUNT_UNKNOWN_ACK_ENABLED", "ACCOUNT_ONLY_POLICY_QUERY_ENABLED", "UNREAD_DATE_ASK_ENABLED", "RELATIVE_DATE_READER_ENABLED",
  "DECIMAL_NOT_SENTENCE_END_ENABLED", "AMOUNT_TURN_STAYS_ENABLED", "ORDINAL_DATE_IN_DRAFT_ENABLED", "PAYROLL_TYPO_ANSWER_ENABLED",
  "WIDER_DATE_READER_ENABLED", "UNKNOWN_NAME_ASK_ENABLED", "FIRST_NAME_ASK_ENABLED", "STORE_WORD_NOT_A_NAME_ENABLED",
  "ANSWER_NOT_A_NAME_ENABLED", "LEVEL_STEP_NOT_ACCOUNT_ENABLED", "JOB_TITLE_APPOSITION_ENABLED", "FOLLOW_UP_CITATION_FIELD_ENABLED",
  "EXIT_READBACK_JOB_TITLE_ENABLED", "WARNING_LEVEL_AND_CLAUSE_ENABLED", "STEP_DATE_NOT_INCIDENT_ENABLED", "JOB_TITLE_FROM_WORDS_ENABLED",
  "DATE_REASK_FRESH_ENABLED", "ANIMAL_ANYWHERE_ENABLED", "PLAN_PAYROLL_SENTENCE_ENABLED", "MEETING_NOT_LATENESS_PLAN_ENABLED",
  "DATE_LINE_NO_ECHO_ENABLED",
  // The flags set 24 Oct are stored encrypted; the harness's own production set (`setProduction`) keeps them as the 26 Oct snapshot read them.
];
const FIX = "STALE_NEEDS_ROSTER_PERSON_ENABLED";

function live(fix: boolean, roster: unknown[], readerName: string | null = null) {
  for (const name of [...LIVE, FIX]) if (!saved.has(name)) saved.set(name, process.env[name]);
  production(true, roster);
  for (const name of LIVE) process.env[name] = "true";
  delete process.env[FIX];
  if (fix) process.env[FIX] = "true";
  state.readerName = readerName;
}

// Her words, exactly, with the person's name and address invented.
const HER_WORDS =
  "create an exit for marnie holloway, assistant store manager at lees summit, mo. last day worked 10-26-26. store items not returned and $25 will be payroll deducted for store key. immediate voluntary term, no notice given. payroll deduct applies. drop wage and forfeit bonus. not eligible for rehire. marnie's address is 125 Ne Oakfield Lane, lees summit, MO. 64064";
const MARNIE = [person("e-21", "Marnie", "Holloway"), person("e-3", "Rowan", "Kestrel")];



/*
 * EXIT_SHORTCUT_WORDS_ENABLED (Pau, 29 Oct 2026: "ask code to recognize all
 * form wording please so when manager type shortcuts, it can understand it
 * for both apps but prioritize the exit form today"). Each shortcut is
 * added to her exit request (the person invented) and read through the chat
 * to the card, with this app's production flags.
 */
const SHORTCUTS = "EXIT_SHORTCUT_WORDS_ENABLED";
const TERMS = "EXIT_TERMS_NOT_NAMES_ENABLED";
const BASE = "create an exit for marnie holloway, assistant store manager at lees summit, mo. last day worked 10-26-26.";

async function readback(words: string, on: boolean): Promise<string> {
  live(true, MARNIE, "marnie holloway");
  for (const name of [SHORTCUTS, TERMS]) if (!saved.has(name)) saved.set(name, process.env[name]);
  // With EXIT_TERMS_NOT_NAMES_ENABLED (#312): off, "drop wage and forfeit bonus" is stripped from the text as unknown people before it is read.
  process.env[TERMS] = "true";
  delete process.env[SHORTCUTS];
  if (on) process.env[SHORTCUTS] = "true";
  const answer = (await new Thread().say(words)) as { content: string };
  return answer.content;
}

const CASES: [shortcut: string, line: string][] = [
  ["drop wage", "- **Minimum Wage / Bonus Forfeiture:** Employee will be dropped to minimum wage."],
  ["drop wage and forfeit bonus", "- **Minimum Wage / Bonus Forfeiture:** Employee will be dropped to minimum wage and forfeit bonus."],
  ["$25 will be payroll deducted for store key", "- **Store Key Returned:** Store key was not returned."],
  ["immediate voluntary term", "- **Resignation Details:** Immediate Voluntary Resignation"],
  ["quit, no notice given", "- **Resignation Details:** Immediate Voluntary Resignation"],
  ["called to quit", "- **How Employee Resigned:** Phone call"],
  // Pau (29 Oct 2026): job abandonment is No Call No Show.
  ["abandoned job", "- **Resignation Details:** No Call No Show"],
  ["abandoned job", "- **How Employee Resigned:** No call/no show"],
  ["Abandoned job", "- **Resignation Details:** No Call No Show"],
  ["job abandonment", "- **Resignation Details:** No Call No Show"],
  ["Job abandonment", "- **How Employee Resigned:** No call/no show"],
  ["she abandoned her job", "- **Resignation Details:** No Call No Show"],
  ["abandoned the job", "- **Resignation Details:** No Call No Show"],
];

describe("the exit form's shortcuts fill their fields (EXIT_SHORTCUT_WORDS_ENABLED)", () => {
  it("her exact words: the minimum-wage and the bonus lines, the key, and the Immediate Voluntary box", async () => {
    const content = await readback(HER_WORDS, true);
    expect(content).toContain("- **Minimum Wage / Bonus Forfeiture:** Employee will be dropped to minimum wage and forfeit bonus.");
    expect(content).toContain("- **Resignation Details:** Immediate Voluntary Resignation");
    expect(content).toContain("- **Store Key Returned:** Store key was not returned.");
    expect(content).toContain("- **Payroll Deduction:** Payroll deduction is applicable.");
    // The line is filled, so it is not also listed as left blank.
    expect(content).not.toMatch(/Left blank for you to review:\*\*[^\n]*Minimum Wage \/ Bonus Forfeiture/);
  });

  it("off: her exact words fill the bonus only, as live", async () => {
    const content = await readback(HER_WORDS, false);
    expect(content).toContain("- **Minimum Wage / Bonus Forfeiture:** Employee will forfeit bonus.");
    expect(content).not.toContain("Immediate Voluntary Resignation");
  });

  for (const [shortcut, line] of CASES) {
    it(`"${shortcut}" → ${line.replace(/^- /, "")}`, async () => {
      expect(await readback(`${BASE} ${shortcut}.`, true)).toContain(line);
    });
    it(`off: "${shortcut}" does not fill it`, async () => {
      expect(await readback(`${BASE} ${shortcut}.`, false)).not.toContain(line);
    });
  }

  /*
   * What names no separation still ticks nothing. The involuntary box keeps
   * needing the act in a sentence ("she was fired"): QA kept that, so a
   * shorthand "fired" or "involuntary" alone ticks nothing either.
   */
  for (const words of ["termination form attached", "should we fire her?", "quit", "voluntary", "no notice given", "she was not fired, she quit by text", "fired", "terminated", "involuntary", "involuntary term", "she did not abandon her job"]) {
    it(`"${words}" ticks no involuntary box${/quit|voluntary|notice/.test(words) && !/fired/.test(words) ? " and no voluntary one" : ""}`, async () => {
      const content = await readback(`${BASE} ${words}`, true);
      expect(content).not.toContain("Immediate involuntary separation");
      if (!/text/.test(words)) expect(content).not.toContain("Immediate Voluntary Resignation");
      if (/abandon/.test(words)) expect(content).not.toContain("No Call No Show");
    });
  }

  it('"jordan dropped off her key" is the key returned, not a wage drop', async () => {
    const content = await readback(`${BASE} she dropped off her key.`, true);
    expect(content).toContain("- **Store Key Returned:** Store key was returned.");
    expect(content).not.toContain("minimum wage");
  });
});

/*
 * EXIT_TERMS_NOT_NAMES_ENABLED, one more path: the roster check stripped every
 * name it could not find from the text before the exit form read it, so with
 * her on the roster "drop wage and forfeit bonus" became "and" and the whole
 * Minimum Wage / Bonus Forfeiture line stayed blank.
 */
describe("the exit form's own words are not stripped as unknown people (EXIT_TERMS_NOT_NAMES_ENABLED)", () => {
  const terms = async (on: boolean) => {
    live(true, MARNIE, "marnie holloway");
    for (const name of [SHORTCUTS, TERMS]) if (!saved.has(name)) saved.set(name, process.env[name]);
    delete process.env[SHORTCUTS];
    delete process.env[TERMS];
    if (on) process.env[TERMS] = "true";
    return ((await new Thread().say(HER_WORDS)) as { content: string }).content;
  };

  it("on: her bonus line is read", async () => {
    expect(await terms(true)).toContain("- **Minimum Wage / Bonus Forfeiture:** Employee will forfeit bonus.");
  });

  it("off: the words are stripped, and the line is blank", async () => {
    expect(await terms(false)).not.toContain("- **Minimum Wage / Bonus Forfeiture:**");
  });
});
