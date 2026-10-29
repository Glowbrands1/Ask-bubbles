import { randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { continuationFor } from "@/lib/forms/proposal-continuation";
import { createId } from "@/lib/utils/id";
import { rosterResultFor } from "@/test/roster-result";
import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import { JBA_MANUAL_CA_CHUNKS } from "@/test/fixtures/jba-manual-ca-sections";
import type { AccessScope, ChatFormProposal, ChatMessage } from "@/types";

/**
 * ============================================================================
 * AUDIT, 29 OCT 2026 — A CORRECT CARD IS NEVER REFUSED AT CREATE AS OUT OF DATE
 * ============================================================================
 *
 * Pau, live: a right card answered "This proposal is out of date: …" at
 * Create. Every way a card is reached — the person, the store, the title, the
 * date, the form, the warning level and payroll, an older card, a reload —
 * goes chat → answer → Create through the chat route and POST
 * /api/forms/instances with the production flags, and the form must be filed
 * with the card's values. A real correction must still be refused. Harness
 * from first-name-suggest-e2e.test.ts; people are invented.
 *
 * The full audit (every case, every flag combination) ran once offline. Kept
 * here: the cards it found refused — a preferred name with the surname
 * (PREFERRED_NAME_CARD_CURRENT_ENABLED), "make it a follow up coaching"
 * (SWITCH_KEEPS_NAMED_FORM_ENABLED), a card from a several-forms message
 * after a later turn (SEVERAL_FORMS_STAY_CURRENT_ENABLED) — refused as main
 * with their flags off, a sample of the cases that were never refused, and
 * the real corrections that must stay refused.
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
    const name = /\b(katrin)\b/i.exec(manager)?.[1] ?? null;
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
        templateKey: /\b(?:ca|corrective action)\b/i.test(text) ? "dpoa" : null,
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
  if (!response.ok) throw Object.assign(new Error(body.error ?? `HTTP ${response.status}`), { status: response.status });
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
  formProposals?: ChatFormProposal[];
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
        ...(payload.formProposals && payload.formProposals.length > 1 ? { formProposals: payload.formProposals } : {}),
      } as ChatMessage,
    );
    if (payload.formProposal) this.proposal = payload.formProposal;
    if (payload.formProposals?.length) this.cards.push(...payload.formProposals);
    else if (payload.formProposal) this.cards.push(payload.formProposal);
    return payload;
  }

  /** Every card the thread has shown, oldest first. */
  readonly cards: ChatFormProposal[] = [];

  /** The card's Create, as the browser does it. */
  async create(card?: ChatFormProposal): Promise<string> {
    const proposal = card ?? this.proposal;
    expect(proposal, "no card to create from").not.toBeNull();
    const result = await createInlineForm({ proposal: proposal!, messages: this.messages, call, onCreated: () => {} });
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


/* ========================================================================== *
 * THE AUDIT
 * ========================================================================== */

const PARTIAL = "PARTIAL_NAME_CARD_CURRENT_ENABLED";
const READER = "AI_READS_CODE_CHECKS_ENABLED";
const SWITCH = "FORM_TYPE_SWITCH_ENABLED";
const ADDITIONAL = "ADDITIONAL_LOCATION_TAKEN_ENABLED";
const PREFERRED = "PREFERRED_NAME_CARD_CURRENT_ENABLED";
const NAMED_FORM = "SWITCH_KEEPS_NAMED_FORM_ENABLED";
const SEVERAL = "SEVERAL_FORMS_STAY_CURRENT_ENABLED";
const OWNED = [PARTIAL, READER, SWITCH, ADDITIONAL, PREFERRED, NAMED_FORM, SEVERAL];

type Config = { label: string; fns: boolean; partial: boolean; reader: boolean; switch?: boolean; additional?: boolean; extra?: readonly string[] };
const A: Config = { label: "FNS on, PARTIAL on, reader on", fns: true, partial: true, reader: true };
const B: Config = { label: "FNS off, PARTIAL on, reader on", fns: false, partial: true, reader: true };
const C: Config = { label: "FNS on, PARTIAL off, reader on", fns: true, partial: false, reader: true };
const D: Config = { label: "FNS on, PARTIAL on, reader off", fns: true, partial: true, reader: false };
const E: Config = { label: "FNS off, PARTIAL off, reader off", fns: false, partial: false, reader: false };
const PERSON = [A, B, C, D, E];
const MOST = [A, B];
const SW = (config: Config, on: boolean): Config => ({ ...config, switch: on, label: `${config.label}, SWITCH ${on ? "on" : "off"}` });

const CAST = [
  { ...person("e-7", "Katrin", "Dovetail"), preferredFirstName: "Kit" },
  person("e-3", "Rowan", "Kestrel"),
  person("e-4", "Tessaly", "Brone"),
];

function configure(config: Config, roster: unknown[], scope?: unknown) {
  for (const name of OWNED) if (!saved.has(name)) saved.set(name, process.env[name]);
  production(config.fns, [...roster], scope);
  for (const name of OWNED) delete process.env[name];
  if (config.partial) process.env[PARTIAL] = "true";
  if (config.reader) process.env[READER] = "true";
  if (config.switch) process.env[SWITCH] = "true";
  if (config.additional) process.env[ADDITIONAL] = "true";
  for (const name of config.extra ?? []) process.env[name] = "true";
}

/** The audit's fixes, each on its own flag. */
const ON = (config: Config, ...flags: string[]): Config => ({ ...config, extra: flags, label: `${config.label}, ${flags.join(" + ")} on` });

/** A turn, or an answer said only when the last reply asked a question and showed no card. */
type Step = string | { ifAsked: string; pattern?: RegExp };
const ASKED = /^(?:Is this for|Did you mean|Do you mean)\b/;

type Row = { id: string; employee_name: string; location_id: string | null; form_date: string | null; template_id: string; employee_role?: string | null };
const templateOf = (row: Row | undefined) =>
  ((store as unknown as { form_templates: { id: string; key: string }[] }).form_templates ?? []).find((t) => t.id === row?.template_id)?.key;

async function talk(thread: Thread, steps: readonly Step[]) {
  const log: string[] = [];
  let last: Answer = { content: "" };
  for (const step of steps) {
    let turn: string;
    if (typeof step === "string") turn = step;
    // A "who is this for" card (no person yet) is still a question.
    else if (!last.formProposal?.employeeName && (step.pattern ?? ASKED).test(last.content)) turn = step.ifAsked;
    else continue;
    last = await thread.say(turn);
    const card = last.formProposal;
    log.push(`> ${turn} | ${last.content.split("\n")[0]!.slice(0, 90)}${card ? ` [card ${card.templateKey} ${card.employeeName} ${card.locationId ?? "-"} ${card.formDate ?? "-"}]` : ""}`);
  }
  return { log, last };
}

type Attempt = { ok: true; row: Row; reused: boolean } | { ok: false; status: number; reason: string };
async function attempt(thread: Thread, card?: ChatFormProposal): Promise<Attempt> {
  const before = store.form_instances.length;
  try {
    const id = await thread.create(card);
    const row = (store.form_instances as unknown as Row[]).find((r) => r.id === id)!;
    return { ok: true, row, reused: store.form_instances.length === before };
  } catch (error) {
    return { ok: false, status: (error as { status?: number }).status ?? 0, reason: (error as Error).message };
  }
}

function report(id: string, config: Config, log: string[], result: Attempt, card?: ChatFormProposal) {
  const outcome = result.ok
    ? `created ${templateOf(result.row)} ${result.row.employee_name} ${result.row.location_id ?? "-"} ${result.row.form_date ?? "-"}${result.reused ? " (reused)" : ""}`
    : `REFUSED ${result.status} ${result.reason}`;
  const line = `AUDIT|${id}|${config.label}|${outcome}|card=${card ? `${card.templateKey}/${card.employeeName}/${card.employeeRole ?? "-"}/${card.locationId ?? "-"}/${card.formDate ?? "-"}/${card.warningLevel ?? "-"}/${card.payrollDeduct ?? "-"}` : "none"}\n  ${log.join("\n  ")}\n`;
  // AUDIT_LOG: a file to collect every case's outcome in one place (the table in the audit report).
  if (process.env.AUDIT_LOG) appendFileSync(process.env.AUDIT_LOG, line);
}

type Case = {
  id: string;
  steps: readonly Step[];
  configs: readonly Config[];
  roster?: unknown[];
  scope?: unknown;
  /** Which card to press: the newest (default), the first, or a card picked from all shown. */
  press?: "newest" | "first" | ((cards: ChatFormProposal[]) => ChatFormProposal | undefined);
  employee?: string;
  template?: string;
  location?: string;
};

function audit(cases: readonly Case[]) {
  for (const entry of cases) {
    for (const config of entry.configs) {
      it(`${entry.id} [${config.label}]`, async () => {
        configure(config, entry.roster ?? CAST, entry.scope);
        const thread = new Thread();
        const { log } = await talk(thread, entry.steps);
        const card =
          typeof entry.press === "function" ? entry.press(thread.cards) : entry.press === "first" ? thread.cards[0] : thread.proposal ?? undefined;
        if (!card?.employeeName) {
          report(entry.id, config, log, { ok: false, status: -1, reason: `NO CARD FOR A PERSON (could not drive)${card ? " - card with no name" : ""}` });
          expect.fail(`no card for a person to press:\n${log.join("\n")}`);
        }
        const result = await attempt(thread, card);
        report(entry.id, config, log, result, card);
        expect(result.ok ? "created" : `${result.status} ${(result as { reason: string }).reason}`).toBe("created");
        const row = (result as { row: Row }).row;
        expect(row.employee_name).toBe(card!.employeeName);
        // The card's values are what the manager confirmed by pressing it; what the audit hoped the card would carry is noted, not asserted.
        expect(templateOf(row)).toBe(card!.templateKey);
        expect(row.location_id ?? null).toBe(card!.locationId ?? null);
        const hoped = [
          entry.employee && entry.employee !== row.employee_name ? `person ${row.employee_name} (hoped ${entry.employee})` : "",
          entry.template && entry.template !== templateOf(row) ? `form ${templateOf(row)} (hoped ${entry.template})` : "",
          entry.location && entry.location !== row.location_id ? `store ${row.location_id} (hoped ${entry.location})` : "",
        ].filter(Boolean);
        if (hoped.length && process.env.AUDIT_LOG) appendFileSync(process.env.AUDIT_LOG, `NOTE|${entry.id}|${config.label}|card differs from the hoped reading: ${hoped.join("; ")}\n`);
      });
    }
  }
}

const LATE = "she was late on 10/20";

const PREFERRED_CASE: Case = { id: "P4 preferred name + surname", steps: [`create a ca for kit dovetail. ${LATE}`, { ifAsked: "yes" }], configs: [], employee: "Katrin Dovetail" };
const FOLLOW_UP_CASE: Case = { id: "F2b coaching -> 'make it a follow up coaching'", steps: ["create a coaching form for katrin dovetail, she was late on 10/20", "make it a follow up coaching"], configs: [], employee: "Katrin Dovetail", template: "follow-up-coaching" };
const SEVERAL_CASE: Case = {
  id: "F5c two forms, then a detail for one -> the other's card",
  steps: ["create a coaching form for katrin dovetail and a CA for rowan kestrel", "rowan was late on 10/20"],
  press: (cards) => cards.find((c) => c.templateKey === "coaching"),
  configs: [],
  employee: "Katrin Dovetail",
  template: "coaching",
};

describe("refused before the audit's fixes, created with them", () => {
  audit([
    { ...PREFERRED_CASE, configs: PERSON.map((c) => ON(c, PREFERRED)) },
    { ...FOLLOW_UP_CASE, configs: MOST.map((c) => ON(SW(c, true), NAMED_FORM)) },
    { ...SEVERAL_CASE, configs: MOST.map((c) => ON(c, SEVERAL)) },
  ]);
});

/* Off, each is refused exactly as main refuses it. */
describe("with the audit's flags off, as main", () => {
  const refused = (entry: Case, config: Config, reason: RegExp) =>
    it(`${entry.id} is refused [${config.label}]`, async () => {
      configure(config, CAST);
      const thread = new Thread();
      await talk(thread, entry.steps);
      const card = typeof entry.press === "function" ? entry.press(thread.cards) : thread.proposal ?? undefined;
      const result = await attempt(thread, card);
      expect(result.ok ? "created" : `${result.status} ${(result as { reason: string }).reason}`).toMatch(reason);
    });
  refused(PREFERRED_CASE, A, /^409 .*now says the form is for kit dovetail/);
  refused(FOLLOW_UP_CASE, SW(A, true), /^409 .*asked for a different form/);
  refused(SEVERAL_CASE, A, /^409 .*names more than one person/);
});

/* Not refused before, and not after: the rest of the audit's list, with every flag on. */
const ALL = (config: Config) => ON(SW(config, true), PREFERRED, NAMED_FORM, SEVERAL);
describe("created, with every audit flag on", () => {
  audit([
    { id: "P2 partial surname", steps: ["pls create a coaching form for katrin dov", { ifAsked: "yes" }], configs: [ALL(A), ALL(B)], employee: "Katrin Dovetail" },
    { id: "P4b preferred + partial surname", steps: [`create a ca for kit dov. ${LATE}`, { ifAsked: "yes" }], configs: [ALL(A)], employee: "Katrin Dovetail" },
    { id: "P6 another person in an earlier sentence", steps: ["Rowan was great today. create a coaching form for katrin dovetail, she was late"], configs: [ALL(A), ALL(B)], employee: "Katrin Dovetail" },
    { id: "S1 store answered after the card", steps: [`create a ca for katrin dovetail. ${LATE}`, "Kearney"], configs: [ALL(A)], employee: "Katrin Dovetail" },
    { id: "T1 title typed abbreviated", steps: [`create a ca for katrin dovetail, ass't store manager. ${LATE}`], configs: [ALL(A)], employee: "Katrin Dovetail" },
    { id: "D1 date answered after the card", steps: ["create a ca for katrin dovetail, she was late last week", "it was on 10/20"], configs: [ALL(A)], employee: "Katrin Dovetail" },
    { id: "F1 'change to coaching'", steps: [`create a ca for katrin dovetail. ${LATE}`, "change to coaching"], configs: [ALL(A)], employee: "Katrin Dovetail", template: "coaching" },
    { id: "F2a follow-up coaching asked for", steps: ["create a follow up coaching form for katrin dovetail, she was late again on 10/20"], configs: [ALL(A)], employee: "Katrin Dovetail", template: "follow-up-coaching" },
    { id: "F5a two forms in one message -> coaching card", steps: ["create a coaching form for katrin dovetail and a CA for rowan kestrel"], press: (cards) => cards.find((c) => c.templateKey === "coaching"), configs: [ALL(A)], employee: "Katrin Dovetail" },
    { id: "F5b two forms in one message -> CA card", steps: ["create a coaching form for katrin dovetail and a CA for rowan kestrel"], press: (cards) => cards.find((c) => c.templateKey === "dpoa"), configs: [ALL(A)], employee: "Rowan Kestrel" },
    { id: "W1 'verbal warning'", steps: [`create a ca for katrin dovetail. ${LATE}`, "verbal warning"], configs: [ALL(A)], employee: "Katrin Dovetail" },
    { id: "R1 older card after 'written'", steps: [`create a ca for katrin dovetail. ${LATE}`, "written"], press: "first", configs: [ALL(A)], employee: "Katrin Dovetail" },
  ]);
});

/* A real correction is still refused, with every audit flag on. */
describe("real staleness is still refused (409)", () => {
  const stale = (id: string, steps: readonly Step[], correction: string, config: Config, press?: Case["press"]) =>
    it(`${id} [${config.label}]`, async () => {
      configure(config, CAST);
      const thread = new Thread();
      await talk(thread, steps);
      const old = typeof press === "function" ? press(thread.cards) : thread.proposal!;
      expect(old).toBeTruthy();
      await talk(thread, [correction]);
      const result = await attempt(thread, old);
      expect(result.ok ? "created" : result.status).toBe(409);
    });
  for (const config of [ALL(A), ALL(B)]) {
    stale("X1 'actually it's for Rowan Kestrel'", [`create a ca for katrin dovetail. ${LATE}`], "actually it's for Rowan Kestrel", config);
    stale("X1b after an accepted name", [`create a ca for katrin dov. ${LATE}`, { ifAsked: "yes" }], "actually it's for Rowan Kestrel", config);
    stale("X1c after a preferred name", [`create a ca for kit dovetail. ${LATE}`], "actually it's for Rowan Kestrel", config);
    stale("X2 'make it a coaching form instead' on the old CA card", [`create a ca for katrin dovetail. ${LATE}`], "make it a coaching form instead", config);
    stale("X3 'not for Katrin'", [`create a ca for katrin dovetail. ${LATE}`], "not for Katrin", config);
    stale("X3b 'this isn't for katrin dovetail' after an accepted name", [`create a ca for katrin dov. ${LATE}`, { ifAsked: "yes" }], "this isn't for katrin dovetail", config);
    const coaching = (cards: ChatFormProposal[]) => cards.find((c) => c.templateKey === "coaching");
    stale("X4 two forms, then 'the coaching form is for Tessaly Brone'", ["create a coaching form for katrin dovetail and a CA for rowan kestrel"], "actually the coaching form is for Tessaly Brone", config, coaching);
    stale("X5 two forms, then 'not for katrin'", ["create a coaching form for katrin dovetail and a CA for rowan kestrel"], "not for katrin", config, coaching);
    stale("X6 two forms, then another form asked for", ["create a coaching form for katrin dovetail and a CA for rowan kestrel"], "make katrin's a CA instead", config, coaching);
  }
});
