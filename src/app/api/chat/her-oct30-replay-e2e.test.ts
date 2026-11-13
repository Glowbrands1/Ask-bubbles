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
 * HER 30 OCT CHATS, REPLAYED WITH TODAY'S FLAGS
 * ============================================================================
 *
 * The same Location Manager rated two chats low on 30 Oct 2026: "I'd like it
 * to copy and paste a coaching form but change the employee name and
 * position" and "i wanted a coaching form and needed help writting the
 * detailsand it did help but it would never automatically put it in the
 * coaching form, I had to copy and paste it myself". An Assistant Manager at
 * her store was told "Your role cannot create a **Coaching Form**" twice that
 * evening. Their wording, turn by turn, through POST /api/chat with this
 * app's production flags of 3 Nov 2026; people invented.
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
const ALL_FLAGS = [...PRODUCTION, ...CHAT_QUALITY_FLAG_NAMES, "INTENT_EXTRACTION_ENABLED", "SLOT_RETENTION_ENABLED", ...REMAP_EXTRA, FLAG, FIO, "CODE_SLOTS_ENABLED", "POLICY_CITATION_ENABLED", "FORM_STATE_ENABLED", "REMAP_DRAFT_SOURCES_ENABLED", "NEXT_PUBLIC_REMAP_DRAFT_SOURCES_ENABLED", "INTENT_PAYROLL_MANAGER_ONLY_ENABLED", "CHAT_DATA_TOOLS_ENABLED", "CHAT_MEMORY_ENABLED", "EDIT_SEES_SAVED_FORM_ENABLED", "CARD_CHECKED_AGAINST_WORDS_ENABLED"];

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





const FIXES = ["WHOLE_TEAM_COACHING_ENABLED", "STAFF_PICKER_REMEMBER_LOCATION_ENABLED", "SHARED_LOGIN_NOT_STAFF_ENABLED", "STAFF_PICKER_NO_REPEAT_ENABLED"] as const;

function production(extra: readonly string[] = []) {
  for (const name of [...ALL_FLAGS, ...FIXES]) {
    if (!saved.has(name)) saved.set(name, process.env[name]);
    delete process.env[name];
  }
  for (const name of PRODUCTION) process.env[name] = "true";
  for (const name of extra) {
    if (!saved.has(name)) saved.set(name, process.env[name]);
    process.env[name] = "true";
  }
}

const HER_SCOPE = { level: "location", primaryAreaId: "loc-67", alsoCoversAreaIds: ["loc-264"] };
const STORE = { level: "location", primaryAreaId: "loc-264", alsoCoversAreaIds: [] };

function westDodge() {
  state.directory = [
    { id: "e-1", firstName: "Marnie", lastName: "Holloway", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Assistant General Manager" },
    { id: "e-2", firstName: "Remy", lastName: "Calder", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" },
    { id: "e-3", firstName: "Juno", lastName: "Paxton", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" },
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

/** Which code path answered: a revision of the open draft, a card, or the answering model. */
async function path(thread: Thread, turn: string): Promise<{ path: string; reply: Answer }> {
  const before = state.chatModelCalls;
  const reply = await thread.say(turn);
  const which = reply.formUpdate ? "revision" : reply.formProposal ? "card" : state.chatModelCalls > before ? "model" : "code";
  return { path: which, reply };
}

const REFERS = "FORM_EDIT_REFERS_BACK_ENABLED";

/** Her first chat up to the second person's draft: one person's Details, then "Do the same coaching form for remy calder". */
async function twoDrafts(): Promise<Thread> {
  westDodge();
  setRole("location_manager");
  setScope(HER_SCOPE);
  const thread = new Thread();
  await thread.say("Create a coaching form.");
  await thread.say("Marnie");
  await thread.say("yes");
  if (thread.proposal?.status === "needs_location") await thread.say("dodge");
  state.draft = { values: { coaching_details: "Coaching on managing the Ship From Store operation." } };
  await thread.create();
  state.revision = { values: { coaching_details: "Ship From Store: print packing slips, pin them on the rolling rack with clips, first come first serve; pick, customize, pack, label." } };
  const details = await path(
    thread,
    "this is what i am wanting to coach on: managing our ship from store operation, here are the details of the process: print packing slip, use rolling rack and use clips to pin them in order of first come first serve. Pick and customize products, pack, once the order is ready, then print shipping label to tape on box.",
  );
  expect(details.path).toBe("revision");
  await thread.say("Do the same coaching form for remy calder");
  state.draft = { values: {} };
  await thread.create();
  return thread;
}

describe("chat 1 (30 Oct): \"Do the same coaching form for <another>\" — fixed today", () => {
  it("the second person's draft gets the first one's Details at Create (SAME_FORM_COPY, on)", async () => {
    production();
    const thread = await twoDrafts();
    const remy = store.form_instance_values.find((row) => row.instance_id === thread.instanceId && row.field_key === "coaching_details");
    expect(String(remy?.value ?? "")).toContain("rolling rack");
  });

  it("\"can you create the same draft that we did with marnie holloway by changing the name and position?\" is answered by the copy path, not the model", async () => {
    production();
    const thread = await twoDrafts();
    const { path: which, reply } = await path(thread, "can you create the same draft that we did with marnie holloway by changing the name and position?");
    expect(which).toBe("code");
    expect(reply.content).toContain("Marnie Holloway");
  });

  it("\"ok, create the draft, but include the details of rolling rack.\": today the answering model", async () => {
    production();
    const thread = await twoDrafts();
    expect((await path(thread, "ok, create the draft, but include the details of rolling rack.")).path).toBe("model");
  });

  it("FORM_EDIT_REFERS_BACK_ENABLED: \"ok, create the draft, but include the details of rolling rack.\" is written into the draft", async () => {
    production([REFERS]);
    const thread = await twoDrafts();
    state.revision = { values: { coaching_details: "Ship From Store … the rolling rack holds the slips in order, clipped first come first serve." } };
    expect((await path(thread, "ok, create the draft, but include the details of rolling rack.")).path).toBe("revision");
  });
});

/** Her second chat: one person's draft open, then the answering model offers the details. */
async function offered(): Promise<Thread> {
  westDodge();
  setRole("location_manager");
  setScope(HER_SCOPE);
  const thread = new Thread();
  await thread.say("Create a coaching form.");
  await thread.say("Remy");
  await thread.say("yes");
  if (thread.proposal?.status === "needs_location") await thread.say("dodge");
  state.draft = { values: { coaching_details: "" } };
  await thread.create();
  said.answer =
    "Marking an order as Shipped is meant to happen only once the guest is in the store and picking it up.\n\n**Details of Coaching:** \"Remy marked a guest's order as Shipped before the guest had picked it up.\"\n\nWant me to put that on the card?";
  await thread.say("ship from store, when to press ready for pick up and when to press mark as shipped");
  return thread;
}

describe("chat 2 (30 Oct): \"yes, do that\" and \"the details we just discussed!!!\"", () => {
  for (const turn of ["yes, do that", "the details we just discussed!!!"]) {
    it(`"${turn}": today the answering model`, async () => {
      production();
      const thread = await offered();
      said.answer = null;
      expect((await path(thread, turn)).path).toBe("model");
    });

    it(`FORM_EDIT_REFERS_BACK_ENABLED: "${turn}" writes the offered Details into the draft`, async () => {
      production([REFERS]);
      const thread = await offered();
      said.answer = null;
      state.revision = { values: { coaching_details: "Remy marked a guest's order as Shipped before the guest had picked it up." } };
      const { path: which, reply } = await path(thread, turn);
      expect(which).toBe("revision");
      expect(reply.formUpdate?.updated).toContain("coaching_details");
    });
  }

  const CLAIM =
    "Updating the draft now.\n\n**Details of Coaching:** \"Remy marked a guest's order as Shipped before the guest had picked it up.\"\n\nThat's on the card. Let me know if you want to add an expectation.";

  it("today: the answer's \"Updating the draft now.\" / \"That's on the card.\" reach her though nothing was written", async () => {
    production();
    const thread = await offered();
    said.answer = CLAIM;
    expect((await thread.say("what else should go on it?")).content).toContain("That's on the card");
    said.answer = null;
  });

  it("FORM_EDIT_REFERS_BACK_ENABLED: those claims are caught, and the reply says nothing changed", async () => {
    production([REFERS]);
    const thread = await offered();
    said.answer = CLAIM;
    const fixed = await thread.say("what else should go on it?");
    expect(fixed.formUpdate).toBeUndefined();
    expect(fixed.content).toMatch(/^\*\*Nothing on the form has changed yet\.\*\*/);
    expect(fixed.content).not.toContain("That's on the card");
    expect(fixed.content).not.toContain("Updating the draft now");
    said.answer = null;
  });
});

describe("the Assistant Manager at her store (30 Oct): \"Your role cannot create a **Coaching Form**\" — fixed today", () => {
  for (const turn of ["coaching form", "can you create a weekly coaching form using the promotions from the most recent weekly newsletter, make it for a week, on days there is no sale use google review"]) {
    it(JSON.stringify(turn.slice(0, 60)), async () => {
      production();
      westDodge();
      setRole("assistant_manager");
      setScope(STORE);
      const reply = await new Thread().say(turn);
      expect(reply.content).not.toContain("Your role cannot create");
      expect(reply.formProposal).toMatchObject({ templateKey: "coaching" });
    });
  }
});
