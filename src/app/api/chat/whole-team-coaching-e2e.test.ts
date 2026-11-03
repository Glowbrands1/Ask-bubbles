import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CHAT_QUALITY_FLAG_NAMES } from "@/lib/config/chat-quality-flags";
import { continuationFor } from "@/lib/forms/proposal-continuation";
import { createId } from "@/lib/utils/id";
import { rosterResultFor } from "@/test/roster-result";
import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import { JBA_MANUAL_CA_CHUNKS } from "@/test/fixtures/jba-manual-ca-sections";
import type { AccessScope, ChatFormProposal, ChatMessage } from "@/types";

/**
 * ============================================================================
 * "COACHING FORM FOR ALL TEAM MEMBERS" — THE SAME ANSWER IN EVERY CHAT
 * ============================================================================
 *
 * A Location Manager covering two stores, 2 Nov 2026 (production, rated 1
 * star): "earlier bubbles made a coaching form for all team members. Now it
 * is struggling to do that, it says it cannot make a coaching form for all
 * team members, but it just did it for me earlier". Six turns got the same
 * staff-picker refusal; "dodge" was asked for again; a shared "<store>
 * Account" login was listed as a team member. In two other chats that evening
 * other wordings made the team card. Pau: "I need all managers to have it".
 * Her exact wording, through POST /api/chat, with this app's production flags
 * of 3 Nov 2026; names and the shared login are invented.
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

// Production builds with it (NEXT_PUBLIC_, read once when the role table loads): an Assistant Manager may create forms.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_ASSISTANT_MANAGER_CREATE_ENABLED = "true";
});

const revisionAsked = vi.hoisted(() => [] as string[]);
const state = vi.hoisted(() => ({
  slotReading: "none" as "none" | "ca" | "copy",
  remapObservation: null as string | null,
  /** What the form-reading model returns for this turn (extract_form_fields). */
  reading: {} as Record<string, unknown>,
  draft: {} as { values?: Record<string, unknown>; checked?: Record<string, unknown> },
  revision: {} as { values?: Record<string, unknown>; checked?: Record<string, unknown>; clear?: string[] },
  revisionCalls: 0,
  draftCalls: 0,
  toolCalls: 0,
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
  return {
    ...actual,
    liveReadiness: () => ({ mode: "live", missing: [], problems: [], ready: true }),
    supabaseReadiness: () => ({ ready: true, missing: [] }),
  };
});

vi.mock("@/lib/auth/server", async () => {
  const { DEFAULT_PERMISSION_MATRIX, hasPermission } = await import("@/lib/permissions");
  const { AuthError } = await import("@/lib/auth/types");
  return {
    authorizeRequest: async (_request: Request, permission: string) => {
      const role = (state as { role?: string }).role ?? "district_manager";
      if (!hasPermission(DEFAULT_PERMISSION_MATRIX, role as never, permission as never)) {
        throw new AuthError("forbidden", "Your role does not have permission to do that.");
      }
      return {
        identity: {
          subject: "qa-manager",
          email: "qa-manager@example.test",
          displayName: "QA Manager",
          role,
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
/** What the answering model says this turn, when a case sets it. */
const said = { answer: null as string | null };

vi.mock("@/lib/ai/call-claude", () => ({
  /*
   * The AI reader (AI_READS_CODE_CHECKS_ENABLED), as the live model reads a
   * lone first name: the name exactly as typed, with its sentence as evidence.
   */
  callClaudeToolTimed: async (input: { messages?: { content?: unknown }[] }) => {
    state.toolCalls += 1;
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
    return said.answer ?? ANSWER;
  },
  callClaudeTool: async (input: { tool?: { name?: string }; messages?: { content?: unknown }[] }) => {
    state.toolCalls += 1;
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
        if (!revising) state.draftCalls += 1;
        if (revising) {
          state.revisionCalls += 1;
          revisionAsked.push(JSON.stringify((request as { messages?: unknown }).messages ?? []));
        }
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

/** A question that is not a form request searches the manual; nothing to embed offline. */
vi.mock("@/lib/knowledge/recall-match", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/knowledge/recall-match")>()),
  matchRecallKnowledge: async () => [],
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
 * This app's production flags, 3 Nov 2026: the *_ENABLED variables Vercel
 * production shows as on, with the 26 Oct reading QA decrypted (the intent
 * path, slot retention and form state off — her real replies came from the
 * proposal path). Everything else off.
 */
const PRODUCTION = [
  "ADDITIONAL_LOCATION_TAKEN_ENABLED",
  "AM_PRIOR_WARNINGS_ENABLED",
  "ANGLE_PLACEHOLDER_GUARD_ENABLED",
  "APP_PASSWORD_HELP_ENABLED",
  "ATTENDANCE_ACTION_PLAN_ENABLED",
  "CARD_CHANGE_PLAN_REBUILD_ENABLED",
  "CA_SHORTCUT_WORDS_ENABLED",
  "CA_TEMPLATE_MAP_ENABLED",
  "CHAT_HISTORY_STATE_CHUNKED_ENABLED",
  "CHAT_IMPORT_OWN_ONLY_ENABLED",
  "CHAT_RESPONSE_STREAM_ENABLED",
  "CHAT_TRACE_ENABLED",
  "CONVERSATION_DRAFT_REUSE_ENABLED",
  "CROSS_CHAT_REPLY_GUARD_ENABLED",
  "DRAFT_ACTIONS_ENABLED",
  "DRAFT_NEVER_BLANK_ENABLED",
  "DRAFT_REUSE_SAME_CHAT_ONLY_ENABLED",
  "EXIT_INTAKE_FIX_ENABLED",
  "EXIT_SHORTCUT_WORDS_ENABLED",
  "EXIT_TERMS_NOT_NAMES_ENABLED",
  "FIELD_ACCURACY_ENABLED",
  "FIRST_NAME_SUGGEST_ENABLED",
  "FORM_CHOICE_STATED_ENABLED",
  "FORM_EDIT_DATE_RULES_ENABLED",
  "FORM_EDIT_HONEST_REPLY_ENABLED",
  "FORM_EDIT_PLAIN_WORDS_ENABLED",
  "FORM_TYPE_SWITCH_AFTER_CREATE_NOTE_ENABLED",
  "FORM_TYPE_SWITCH_ENABLED",
  "FRAMEWORK_UNPIN_ENABLED",
  "FULL_MANUAL_CONTEXT_ENABLED",
  "GLOBAL_STORE_ASK_ENABLED",
  "GROUNDED_ENTITIES_ENABLED",
  "HIDE_NO_POLICY_MATCH_NOTICE_ENABLED",
  "KEEP_FORM_EMPLOYEE_ENABLED",
  "LAST_FIRST_NAME_READ_ENABLED",
  "LATE_OPEN_DATE_ENABLED",
  "LATE_OPEN_PAYROLL_FROM_FORM_ENABLED",
  "LEVEL_REQUEST_DATE_ENABLED",
  "MANAGER_NAME_NOT_EMPLOYEE_ENABLED",
  "MANAGER_WORDS_ONLY_ENABLED",
  "MANUAL_NEGATED_LIST_NOTE_ENABLED",
  "NAME_BEFORE_TITLE_ENABLED",
  "NEXT_PUBLIC_ASSISTANT_MANAGER_CREATE_ENABLED",
  "NEXT_PUBLIC_CARD_CHANGE_FINALIZED_ENABLED",
  "NEXT_PUBLIC_CHAT_HISTORY_TOLERANT_ENABLED",
  "NEXT_PUBLIC_CHAT_LOCAL_OWNER_ENABLED",
  "NOT_A_NAME_GUARD_ENABLED",
  "OTHER_WRITE_IN_GUARD_ENABLED",
  "OTHER_WRITE_IN_NOT_A_QUESTION_ENABLED",
  "OUT_OF_SCOPE_PLACE_KEEPS_OWN_ENABLED",
  "OUT_OF_SCOPE_PLACE_SAID_ENABLED",
  "PARTIAL_NAME_CARD_CURRENT_ENABLED",
  "PARTIAL_NAME_LOOSE_MATCH_ENABLED",
  "PARTIAL_SURNAME_ASK_ENABLED",
  "PAYROLL_DEDUCT_AMOUNT_ENABLED",
  "PLACE_SPAN_GUARD_ENABLED",
  "POLICY_SPECIFIC_TOPICS_ENABLED",
  "PREFERRED_NAME_CARD_CURRENT_ENABLED",
  "PRINTED_PAGE_ONLY_ENABLED",
  "PRIOR_ACTIONS_PARSE_ENABLED",
  "PROMPT_CACHE_ENABLED",
  "REMAP_DRAFT_SOURCES_ENABLED",
  "REMAP_INCIDENT_FIX_ENABLED",
  "REOPEN_VERB_GUARD_ENABLED",
  "REPORT_NAME_NOT_A_PERSON_ENABLED",
  "REVISION_SAME_VALUE_ENABLED",
  "SAME_FORM_COPY_ENABLED",
  "SEVERAL_FORMS_STAY_CURRENT_ENABLED",
  "SPEND_GUARD_ALL_CALLS_ENABLED",
  "STAFF_PICKER_BARE_ANSWER_ENABLED",
  "STAFF_PICKER_ENABLED",
  "STAFF_PICKER_STORE_TITLES_ENABLED",
  "STALE_NEEDS_ROSTER_PERSON_ENABLED",
  "STATE_CODE_NOT_A_PERSON_ENABLED",
  "STORED_SLOTS_NOT_A_REQUEST_ENABLED",
  "STREET_ADDRESS_NOT_A_NAME_ENABLED",
  "SUGGEST_ANSWER_REPLACES_TYPED_ENABLED",
  "SWITCH_KEEPS_NAMED_FORM_ENABLED",
  "TITLE_WHOLE_WORD_ENABLED",
  "TYPED_NAME_ENABLED",
  "UNREAD_DATE_PLAIN_ASK_ENABLED",
  "UNREAD_DAY_NOT_INCIDENT_DATE_ENABLEDACTION_PLAN_SENTENCES_ENABLED",
  "WARNING_LEVEL_MANAGER_ONLY_ENABLED",
] as const;
/** Not production here: the full remap and the flags QA-6 ran it with, as extra coverage. */
const REMAP_EXTRA = ["FORM_FULL_REMAP_ENABLED"] as const;
const FLAG = "PRIOR_SENTENCE_FIX_ENABLED";
/** FORM_DATE_INCIDENT_ONLY_ENABLED (D3, =0 in production) is pinned by each case, never read from the shell. */
const FIO = "FORM_DATE_INCIDENT_ONLY_ENABLED";
const ALL_FLAGS = [...PRODUCTION, ...CHAT_QUALITY_FLAG_NAMES, "INTENT_EXTRACTION_ENABLED", "SLOT_RETENTION_ENABLED", ...REMAP_EXTRA, FLAG, FIO, "CODE_SLOTS_ENABLED", "POLICY_CITATION_ENABLED", "FORM_STATE_ENABLED", "REMAP_DRAFT_SOURCES_ENABLED", "NEXT_PUBLIC_REMAP_DRAFT_SOURCES_ENABLED", "INTENT_PAYROLL_MANAGER_ONLY_ENABLED", "CHAT_DATA_TOOLS_ENABLED", "CHAT_MEMORY_ENABLED"];

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





/** The fixes in this file, each default off. */
const FIXES = ["WHOLE_TEAM_COACHING_ENABLED", "STAFF_PICKER_REMEMBER_LOCATION_ENABLED", "SHARED_LOGIN_NOT_STAFF_ENABLED", "STAFF_PICKER_NO_REPEAT_ENABLED"] as const;

/** Production as of 3 Nov 2026, plus the named fixes. */
function production(fixes: readonly (typeof FIXES)[number][] = []) {
  for (const name of [...ALL_FLAGS, ...FIXES]) {
    if (!saved.has(name)) saved.set(name, process.env[name]);
    delete process.env[name];
  }
  for (const name of PRODUCTION) process.env[name] = "true";
  for (const name of fixes) process.env[name] = "true";
}

/** Her account: a Location Manager whose scope is one store and also covers the other. */
const HER_SCOPE = { level: "location", primaryAreaId: "loc-67", alsoCoversAreaIds: ["loc-264"] };

/** The West Dodge Rd staff (invented), with the store's shared login as the directory holds it. */
function westDodge() {
  state.directory = [
    { id: "e-1", firstName: "Marnie", lastName: "Holloway", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" },
    { id: "e-2", firstName: "Remy", lastName: "Calder", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" },
    { id: "e-3", firstName: "Juno", lastName: "Paxton", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Assistant General Manager" },
    { id: "e-4", firstName: "Dodge", lastName: "Account", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Full Time" },
    { id: "e-5", firstName: "Tobin", lastName: "Areli", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-67"], positionName: "Team Member Part Time" },
  ];
}

function setScope(scope: unknown) {
  (state as { scope?: unknown }).scope = scope;
}
function setRole(role: string | undefined) {
  (state as { role?: string }).role = role;
}

afterEach(() => {
  setScope(undefined);
  setRole(undefined);
});

const REFUSAL = /won't make one card for the whole staff/;
const WHICH = "Which location's staff should I list?";

describe("the 1-star chat, turn by turn, with today's production flags", () => {
  const TURNS = [
    "coaching form for all team members",
    "make a coaching form for all team members",
    "dodge",
    "make a coaching form for all team members at dodge",
    "earlier you made a caoching form for all team members for me",
    "dodge",
  ];

  it("today (fixes off): the same refusal on all six, the store asked twice, the shared login listed — what she got", async () => {
    production();
    westDodge();
    setRole("location_manager");
    setScope(HER_SCOPE);
    const thread = new Thread();
    const replies: Answer[] = [];
    for (const turn of TURNS) replies.push(await thread.say(turn));
    for (const reply of replies) expect(reply.content).toMatch(REFUSAL);
    expect(replies.filter((reply) => reply.content.includes(WHICH))).toHaveLength(3);
    expect(replies[2]!.content).toContain("Dodge Account");
    expect(replies.some((reply) => reply.formProposal)).toBe(false);
    expect(state.chatModelCalls).toBe(0);
  });

  it("with the fixes: the first turn asks only which store, \"dodge\" makes the team card, and nothing is refused", async () => {
    production([...FIXES]);
    westDodge();
    setRole("location_manager");
    setScope(HER_SCOPE);
    const thread = new Thread();
    const first = await thread.say(TURNS[0]!);
    expect(first.content).not.toMatch(REFUSAL);
    expect(first.formProposal).toMatchObject({ templateKey: "coaching", subject: "team", employeeName: "All team members" });
    const second = await thread.say("dodge");
    expect(second.content).not.toMatch(REFUSAL);
    expect(second.formProposal).toMatchObject({ templateKey: "coaching", subject: "team", employeeName: "All team members", locationId: "loc-264", status: "ready" });
  });
});

const TEAM = { templateKey: "coaching", subject: "team", employeeName: "All team members" };

/** Every wording production saw for the whole staff, each the team card. */
describe("WHOLE_TEAM_COACHING_ENABLED: the team card for every wording, in every chat", () => {
  const OPENERS: [string, string[]][] = [
    ["her first turn", ["coaching form for all team members"]],
    ["her second", ["make a coaching form for all team members"]],
    ["with the store in it", ["make a coaching form for all team members at dodge"]],
    ["her complaint, after the first", ["coaching form for all team members", "earlier you made a caoching form for all team members for me"]],
    ["the 30 Oct wording", ["Create a coaching form.", "for whole staff - associates"]],
    ["another manager's", ["can you create a coaching form for my whole staff?"]],
    ["an answer to who", ["Create a coaching form.", "whole staff"]],
    ["the whole store", ["Create a coaching form.", "for the whole store"]],
    ["store wide", ["Create a coaching form.", "store wide everyone needs the reminder to call a manager for cash drawer shortages, overages, and returns"]],
    ["inside an answer", ["we do not accept $100 bills, this coaching form is for all team members"]],
    ["without a name, after the team was said", ["Create a coaching form.", "we do not accept $100 bills, this coaching form is for all team members", "can you draft a coaching form without attatching a name"]],
  ];
  for (const [label, turns] of OPENERS) {
    it(`${label}: ${JSON.stringify(turns.at(-1))} → the team card, never the refusal`, async () => {
      production([...FIXES]);
      westDodge();
      setRole("location_manager");
      setScope(HER_SCOPE);
      const thread = new Thread();
      let reply: Answer | null = null;
      for (const turn of turns) reply = await thread.say(turn);
      expect(reply!.content).not.toMatch(REFUSAL);
      expect(reply!.content).not.toMatch(/one (?:individual )?(?:person|employee) at a time|not built for a whole/i);
      expect(thread.proposal).toMatchObject(TEAM);
      if (thread.proposal!.status !== "ready") {
        await thread.say("dodge");
        expect(thread.proposal).toMatchObject({ ...TEAM, locationId: "loc-264", status: "ready" });
      }
    });
  }

  it("Create makes one Coaching Form for \"All team members\" at the store, as her finalized ones", async () => {
    production([...FIXES]);
    westDodge();
    setRole("location_manager");
    setScope(HER_SCOPE);
    const thread = new Thread();
    await thread.say("coaching form for all team members");
    await thread.say("dodge");
    const id = await thread.create();
    const row = store.form_instances.find((entry) => entry.id === id)!;
    expect(row).toMatchObject({ employee_name: "All team members", location_id: "loc-264" });
  });

  for (const role of ["location_manager", "assistant_manager", "district_manager"]) {
    it(`${role}: the team card`, async () => {
      production([...FIXES]);
      westDodge();
      setRole(role);
      setScope(role === "district_manager" ? { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] } : { level: "location", primaryAreaId: "loc-264", alsoCoversAreaIds: [] });
      const thread = new Thread();
      const reply = await thread.say("coaching form for all team members");
      expect(reply.content).not.toMatch(REFUSAL);
      expect(thread.proposal).toMatchObject(TEAM);
    });
  }

  it("an employee still gets no card and no staff list", async () => {
    production([...FIXES]);
    westDodge();
    setRole("employee");
    setScope({ level: "location", primaryAreaId: "loc-264", alsoCoversAreaIds: [] });
    const thread = new Thread();
    const reply = await thread.say("coaching form for all team members");
    expect(reply.formProposal).toBeUndefined();
    expect(reply.content).not.toContain("Marnie Holloway");
  });

  it("a Corrective Action Form for the whole staff is still one person at a time (the staff list)", async () => {
    production([...FIXES]);
    westDodge();
    setRole("location_manager");
    setScope({ level: "location", primaryAreaId: "loc-264", alsoCoversAreaIds: [] });
    const thread = new Thread();
    const reply = await thread.say("a corrective action form for all team members");
    expect(reply.formProposal).toBeUndefined();
    expect(reply.content).toContain("Marnie Holloway");
  });
});

/** A Corrective Action Form is still one person at a time: the staff picker, without its loop. */
describe("the staff picker for one-person forms: the store remembered, the shared login gone, no repeated refusal", () => {
  it("STAFF_PICKER_REMEMBER_LOCATION_ENABLED: \"dodge\" answers the store once; asking again for the whole staff does not ask again", async () => {
    production(["STAFF_PICKER_REMEMBER_LOCATION_ENABLED"]);
    westDodge();
    setRole("location_manager");
    setScope(HER_SCOPE);
    const thread = new Thread();
    expect((await thread.say("make a corrective action form for all team members")).content).toContain(WHICH);
    expect((await thread.say("dodge")).content).toContain("Marnie Holloway");
    const again = await thread.say("make a corrective action form for all team members");
    expect(again.content).not.toContain(WHICH);
  });

  it("off: the store is asked again, as she was", async () => {
    production();
    westDodge();
    setRole("location_manager");
    setScope(HER_SCOPE);
    const thread = new Thread();
    await thread.say("make a corrective action form for all team members");
    await thread.say("dodge");
    expect((await thread.say("make a corrective action form for all team members")).content).toContain(WHICH);
  });

  for (const typed of ["dodge", "west dodge", "dodge rd", "omaha dodge", "Dodge"]) {
    it(`"${typed}" answers "Which location's staff…"`, async () => {
      production();
      westDodge();
      setRole("location_manager");
      setScope(HER_SCOPE);
      const thread = new Thread();
      await thread.say("make a corrective action form for all team members");
      expect((await thread.say(typed)).content).toContain("Omaha, NE (West Dodge Rd)");
    });
  }

  it("SHARED_LOGIN_NOT_STAFF_ENABLED: the store's shared login is not on the list; off, it is", async () => {
    production(["SHARED_LOGIN_NOT_STAFF_ENABLED"]);
    westDodge();
    setRole("location_manager");
    setScope({ level: "location", primaryAreaId: "loc-264", alsoCoversAreaIds: [] });
    const on = await new Thread().say("make a corrective action form for all team members");
    expect(on.content).toContain("Marnie Holloway");
    expect(on.content).not.toContain("Dodge Account");
    production();
    const off = await new Thread().say("make a corrective action form for all team members");
    expect(off.content).toContain("Dodge Account");
  });

  it("STAFF_PICKER_NO_REPEAT_ENABLED: after the list, another whole-staff turn says what to do next, not the refusal again", async () => {
    production(["STAFF_PICKER_NO_REPEAT_ENABLED", "STAFF_PICKER_REMEMBER_LOCATION_ENABLED"]);
    westDodge();
    setRole("location_manager");
    setScope(HER_SCOPE);
    const thread = new Thread();
    await thread.say("make a corrective action form for all team members");
    const listed = await thread.say("dodge");
    expect(listed.content).toMatch(REFUSAL);
    for (const turn of ["make a corrective action form for all team members at dodge", "earlier you made a corrective action form for all team members for me"]) {
      const reply = await thread.say(turn);
      expect(reply.content).not.toMatch(REFUSAL);
      expect(reply.content).not.toContain("Marnie Holloway");
      expect(reply.content).toMatch(/name one person from that list/);
    }
  });
});

describe("a form not named, for the whole staff", () => {
  it("WHOLE_TEAM_COACHING_ENABLED: no refusal; which form is asked, and the Coaching Form is the team card", async () => {
    production([...FIXES]);
    westDodge();
    setRole("location_manager");
    setScope({ level: "location", primaryAreaId: "loc-264", alsoCoversAreaIds: [] });
    const thread = new Thread();
    const first = await thread.say("make a form for all team members");
    expect(first.content).not.toMatch(/one person at a time/);
    await thread.say("coaching form");
    expect(thread.proposal).toMatchObject(TEAM);
  });
});

describe("STAFF_PICKER_REMEMBER_LOCATION_ENABLED: a short name of one of the account's own stores (ported from Ask Sunny)", () => {
  it("\"bellevue\" answers which store", async () => {
    production(["STAFF_PICKER_REMEMBER_LOCATION_ENABLED"]);
    westDodge();
    setRole("location_manager");
    setScope(HER_SCOPE);
    const thread = new Thread();
    await thread.say("make a corrective action form for all team members");
    expect((await thread.say("bellevue")).content).toContain("Tobin Areli");
  });
});
