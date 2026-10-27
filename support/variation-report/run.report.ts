import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { continuationFor } from "@/lib/forms/proposal-continuation";
import { createId } from "@/lib/utils/id";
import { rosterResultFor } from "@/test/roster-result";
import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { AccessScope, ChatFormProposal, ChatMessage } from "@/types";

/**
 * ============================================================================
 * THE VARIATION REPORT — HOW MUCH THE WORDING MOVES THE RESULT (MEASURING ONLY)
 * ============================================================================
 *
 * Pau, 27 Oct 2026: "try it and see how big of a change it will be". Real
 * manager chats (names invented) are replayed through the same server path
 * the e2e tests use — POST /api/chat, `createInlineForm`, the draft route —
 * with this app's production flags, the full production manual and the model
 * stubbed out (the extraction model names nobody; the drafting model writes
 * nothing, so the manager's-words fallback is what lands). Each seed is
 * rewritten automatically (case, punctuation, typos, date formats, name
 * forms, spacing) and every variant is scored against the seed's expected
 * form. It PRINTS pass rates; it asserts nothing, so it never turns CI red,
 * and it is not part of `npm test` (its own config, outside `src/`).
 *
 * Ported from the sibling app's report; the harness is this app's own e2e
 * harness (src/app/api/chat/date-answer-applied-e2e.test.ts).
 *
 *   npm run variation-report
 *
 * AI_READS_CODE_CHECKS_ENABLED adds a third mode, "+ AI reader", run only when
 * VARIATION_READER is set. Its model replies are recorded once and replayed
 * after (`src/lib/ai/reader/replay.ts`, `recordings/<app>/reader/`), the same
 * format as the sibling app:
 *
 *   VARIATION_READER=replay npm run variation-report    offline; a missing reply = flag off
 *   VARIATION_READER=record npm run variation-report    calls the model (ANTHROPIC_API_KEY)
 *   VARIATION_READER=oracle npm run variation-report    a perfect reader built from each
 *                                                       seed's expected form: what the hook
 *                                                       can reach, never the gate
 *
 * VARIATION_MODES=2,3, VARIATION_SEEDS=S1,S12 and VARIATION_LIMIT=20 (the first
 * 20 variants of each mode, the smoke run) run part of it.
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

const reader = vi.hoisted(() => ({
  call: null as null | ((input: never) => Promise<{ input: unknown; usage: unknown }>),
}));

vi.mock("@/lib/ai/call-claude", () => ({
  // AI_READS_CODE_CHECKS_ENABLED: the recorded (or recording, or oracle) model; none outside the AI mode.
  callClaudeToolTimed: async (input: never) => {
    if (!reader.call) throw new Error("no reader model in this mode");
    return reader.call(input);
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



/* ======================================================================= *
 * THE REPORT
 * ======================================================================= */

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { checkDate } from "@/lib/ai/reader/check";
import { replayTransport } from "@/lib/ai/reader/replay";

import { SEEDS, type Seed } from "./seeds";
import { variantsOf, type Variant } from "./variants";

/**
 * Production as this app's e2e harness sets it (`useProduction` in
 * date-answer-applied-e2e.test.ts): PRODUCTION above, plus these. Every
 * other flag is off — INTENT_EXTRACTION and ACTION_PLAN_MANAGER_ONLY among them.
 */
const LIVE_SINCE = [
  "PRIOR_SENTENCE_FIX_ENABLED",
  "REMAP_DRAFT_SOURCES_ENABLED",
  "NEXT_PUBLIC_REMAP_DRAFT_SOURCES_ENABLED",
] as const;
/** The fixes merged this week (26-27 Oct 2026), default off in production. */
const NEW_FIXES = [
  "DATE_ANSWER_APPLIED_ENABLED",
  "DATE_ANSWER_KEEPS_OPEN_ENABLED",
  "REQUEST_LINE_ACCOUNT_ENABLED",
  "PAYROLL_TYPO_NOT_A_NAME_ENABLED",
  "POSITION_ANSWER_GUARD_ENABLED",
  "PRIOR_ROW_NOT_ON_INCIDENT_DATE_ENABLED",
  "NOT_DEDUCTIBLE_READ_ENABLED",
  "PRIOR_STEP_SENTENCE_ENABLED",
  "EXIT_FULFILLED_IS_LAST_DAY_ENABLED",
  "DATE_LINE_NO_ECHO_ENABLED",
  "FUTURE_PRIOR_ROW_DROP_ENABLED",
  "MEETING_NOT_LATENESS_PLAN_ENABLED",
  "PLAN_PAYROLL_SENTENCE_ENABLED",
  "NAME_QUESTION_ONLY_ENABLED",
  "ANIMAL_ANYWHERE_ENABLED",
  "PRIVATE_CREATOR_FORMS_ENABLED",
  "NEXT_PUBLIC_ASD_NO_FORM_MONITORING_ENABLED",
] as const;
const READER_MODE = (["replay", "record", "oracle"] as const).find((mode) => mode === process.env.VARIATION_READER) ?? null;
const WITH_AI = "production + this week's fixes + AI reader";
const MODES: readonly { name: string; flags: readonly string[]; reader?: boolean }[] = [
  { name: "production", flags: [] },
  { name: "production + this week's fixes", flags: NEW_FIXES },
  ...(READER_MODE ? [{ name: WITH_AI, flags: [...NEW_FIXES, "AI_READS_CODE_CHECKS_ENABLED"], reader: true }] : []),
];
const recordings = fileURLToPath(new URL(`./recordings/${process.env.VARIATION_APP ?? "app"}/reader/`, import.meta.url));
const transport = READER_MODE === "replay" || READER_MODE === "record" ? replayTransport(recordings, READER_MODE) : null;
let current: Seed | null = null;

/* ------------------------------------------------- the oracle (not a gate) -- */

const DATE_TOKEN =
  /\b(?:the\s+)?\d{1,2}(?:st|nd|rd|th)\b|\b\d{1,2}[-/.]\d{1,2}(?:[-/.]\d{2,4})?\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?\b/gi;

/** The manager's lines of the reader's user block. */
function managerLines(user: string): string[] {
  return user.split("\n").filter((line) => line.startsWith("Manager: ")).map((line) => line.slice(9));
}

function dateSpan(lines: readonly string[], iso: string, clause = false): string | null {
  for (const line of [...lines].reverse()) {
    for (const match of line.matchAll(DATE_TOKEN)) {
      if (checkDate(iso, match[0], TODAY) !== iso) continue;
      if (!clause) return match[0];
      const start = Math.max(line.lastIndexOf(".", match.index) + 1, line.lastIndexOf(",", match.index) + 1, 0);
      return line.slice(start, match.index + match[0].length).trim();
    }
  }
  return null;
}

/** What a perfect reader returns for the current seed: its expected form, quoted from the variant's words. */
function oracleReading(user: string): Record<string, unknown> {
  const blank = { value: null, evidence: null };
  const out: Record<string, unknown> = {
    employee: blank, location: blank, jobTitle: blank, incident: blank, incidentDate: blank, warningLevel: blank,
    payroll: blank, payrollAmount: blank, policyHeading: blank, priorSteps: [], otherDates: [],
  };
  if (!current) return out;
  const e = current.expect;
  const lines = managerLines(user);
  const all = lines.join("\n");
  if (e.employee && current.name) {
    const { first, last } = current.name;
    for (const form of [new RegExp(`\\b${first}\\s+${last}\\b`, "i"), new RegExp(`\\b${last},\\s*${first}\\b`, "i"), new RegExp(`\\b${first}\\b`, "i")]) {
      const hit = form.exec(all);
      if (hit) {
        out.employee = { value: hit[0], evidence: hit[0] };
        break;
      }
    }
  }
  if (e.date) {
    const span = dateSpan(lines, e.date);
    if (span) out.incidentDate = { value: e.date, evidence: span };
  }
  if (e.warning) {
    const word = new RegExp(`\\b${e.warning}\\b`, "i");
    const line = [...lines].reverse().find((text) => word.test(text));
    if (line) out.warningLevel = { value: e.warning, evidence: word.exec(line)![0] };
  }
  if (e.payroll) {
    const line = [...lines].reverse().find((text) => /payrol|deduct/i.test(text));
    if (line) out.payroll = { value: e.payroll, evidence: line };
  }
  if (e.amountInPlan && all.includes(e.amountInPlan)) out.payrollAmount = { value: e.amountInPlan.replace("$", ""), evidence: e.amountInPlan };
  if (e.prior) {
    out.priorSteps = e.prior.flatMap((signed) => {
      const [m, d, y] = signed.split("/");
      const iso = `${y}-${m}-${d}`;
      const span = dateSpan(lines, iso, true);
      return span ? [{ kind: /coach/i.test(span) ? "coaching" : /written/i.test(span) ? "written" : /verbal/i.test(span) ? "verbal" : "other", date: iso, evidence: span }] : [];
    });
  }
  if (e.jobTitle) {
    const hit = new RegExp(e.jobTitle.source, "i").exec(all);
    if (hit) out.jobTitle = { value: hit[0], evidence: hit[0] };
  }
  return out;
}

const NO_USAGE = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

function setFlags(extra: readonly string[]) {
  for (const name of [...ALL_FLAGS, ...LIVE_SINCE, ...NEW_FIXES, "ACTION_PLAN_MANAGER_ONLY_ENABLED"]) {
    if (!saved.has(name)) saved.set(name, process.env[name]);
    delete process.env[name];
  }
  for (const name of [...PRODUCTION, ...LIVE_SINCE, ...extra]) process.env[name] = "true";
}

async function reset() {
  for (const key of Object.keys(store) as (keyof FakeStore)[]) store[key] = [];
  store.form_instances = new JoiningRows() as never;
  state.slotReading = "none";
  state.remapObservation = null;
  state.draft = { values: {} };
  state.revision = { values: {} };
  state.directory = [...ROSTER];
  await ensureTemplateLibrary("system");
}

interface Field {
  readonly value: string;
  readonly checked: readonly string[];
}
interface Outcome {
  readonly replies: string[];
  readonly fields: Record<string, Field>;
  readonly error: string | null;
}

async function replay(turns: readonly string[], chatOnly: boolean, openingQuestion = false): Promise<Outcome> {
  const thread = new Thread();
  const replies: string[] = [];
  if (openingQuestion) {
    // A plain question first: this harness answers questions by a policy search it does not stub, so it is history.
    thread.messages.push(
      { id: "m0", role: "user", content: turns[0]!, createdAt: `${TODAY}T12:27:00Z` } as ChatMessage,
      { id: "a0", role: "assistant", content: ANSWER, createdAt: `${TODAY}T12:27:01Z` } as ChatMessage,
    );
    replies.push(ANSWER);
  }
  for (const turn of openingQuestion ? turns.slice(1) : turns) {
    try {
      replies.push((await thread.say(turn)).content);
    } catch (error) {
      return { replies, fields: {}, error: `turn "${turn.slice(0, 40)}": ${String((error as Error).message).slice(0, 120)}` };
    }
  }
  if (chatOnly) return { replies, fields: {}, error: null };
  if (!thread.proposal) return { replies, fields: {}, error: "no form card" };
  try {
    state.draft = { values: {} };
    const id = await thread.create();
    const fields: Record<string, Field> = {};
    for (const row of store.form_instance_values.filter((entry) => entry.instance_id === id)) {
      fields[String(row.field_key)] = {
        value: String(row.value ?? ""),
        checked: Array.isArray(row.checked) ? (row.checked as string[]) : [],
      };
    }
    return { replies, fields, error: null };
  } catch (error) {
    return { replies, fields: {}, error: `create: ${String((error as Error).message).slice(0, 160)}` };
  }
}

const LIST = /I'll need a few details first|please provide me with these details/i;
const PAYROLL_OPEN = /Is payroll deduct applicable\?(?!\s*\*\*(?:Yes|No)\*\*)/;

/** Each check the seed names: [check, passed, what was read]. */
function score(seed: Seed, out: Outcome): [string, boolean, string][] {
  const e = seed.expect;
  const f = (key: string) => out.fields[key] ?? { value: "", checked: [] };
  const results: [string, boolean, string][] = [];
  const check = (name: string, ok: boolean, read: string) => results.push([name, ok, read]);
  const yesNo = (field: Field) => (field.checked.join(",") || field.value).toLowerCase();
  if (out.error && !seed.chatOnly) {
    check("form created", false, out.error);
    return results;
  }
  // Counted on success too, so the row reads as a rate.
  if (!seed.chatOnly) check("form created", true, "");
  if (e.employee) check("employee", f("employee_name").value.toLowerCase() === e.employee.toLowerCase(), f("employee_name").value);
  if (e.date) check("date", f("form_date").value === e.date, f("form_date").value);
  if (e.prior) {
    const rows = f("prior_actions").value.split("\n").filter((line) => line.trim() !== "");
    const all = e.prior.every((date) => rows.some((row) => row.includes(date)));
    check("prior", all && (!e.priorExact || rows.length === e.prior.length), rows.join(" | ") || "(none)");
  }
  if (e.payroll) check("payroll", yesNo(f("payroll_deduct")).includes(e.payroll), yesNo(f("payroll_deduct")) || "(blank)");
  if (e.amountInPlan) check("amount in plan", f("action_plan").value.includes(e.amountInPlan), f("action_plan").value.slice(0, 90));
  if (e.warning) check("warning", yesNo(f("warning_type")).includes(e.warning), yesNo(f("warning_type")) || "(blank)");
  if (e.policy) {
    const both = `${f("policy_violated").value} / ${f("policy_language").value.slice(0, 40)}`;
    check("policy", e.policy.test(both), both);
  }
  if (e.planNot) check("plan fits", !e.planNot.test(f("action_plan").value), f("action_plan").value.slice(0, 90));
  if (e.observedNot) check("observation", !e.observedNot.test(f("observation").value.trim()), f("observation").value.slice(0, 60));
  if (e.jobTitle) check("job title", e.jobTitle.test(f("job_title").value), f("job_title").value || "(blank)");
  if (e.location) check("location", e.location.test(f("location").value), f("location").value || "(blank)");
  if (e.noticeGiven) check("notice given", f("notice_given_date").value === e.noticeGiven, f("notice_given_date").value || "(blank)");
  if (e.noticeFulfilled) check("notice fulfilled", f("notice_fulfilled_date").value === e.noticeFulfilled, f("notice_fulfilled_date").value || "(blank)");
  if (e.lastDay) check("last day", f("last_day_worked").value === e.lastDay, f("last_day_worked").value || "(blank)");
  if (e.rehire) check("rehire", yesNo(f("eligible_for_rehire")).includes(e.rehire), yesNo(f("eligible_for_rehire")) || "(blank)");
  if (e.oneQuestion) {
    const listed = out.replies.some((reply) => LIST.test(reply));
    const twice = out.replies.some((reply, i) => i > 0 && reply === out.replies[i - 1] && /\?/.test(reply));
    check("one question", !listed && !twice && !out.error, out.error ?? (listed ? "asked a list" : twice ? "asked the same twice" : "ok"));
  }
  if (e.payrollAskedOnce) {
    const asked = out.replies.slice(1).filter((reply) => PAYROLL_OPEN.test(reply)).length;
    check("payroll asked again", asked === 0, `${asked} repeat(s)`);
  }
  return results;
}

interface Row {
  readonly mode: string;
  readonly seed: string;
  readonly variant: Variant;
  readonly checks: [string, boolean, string][];
}

const pct = (pass: number, total: number) => (total === 0 ? "—" : `${Math.round((100 * pass) / total)}% (${pass}/${total})`);

function table(title: string, rows: Row[], key: (row: Row) => string): string {
  const groups = new Map<string, { pass: number; total: number; checksPass: number; checksTotal: number }>();
  for (const row of rows) {
    const g = groups.get(key(row)) ?? { pass: 0, total: 0, checksPass: 0, checksTotal: 0 };
    g.total += 1;
    if (row.checks.every(([, ok]) => ok)) g.pass += 1;
    g.checksTotal += row.checks.length;
    g.checksPass += row.checks.filter(([, ok]) => ok).length;
    groups.set(key(row), g);
  }
  const lines = [`| ${title} | variants fully right | checks right |`, "|---|---|---|"];
  for (const [name, g] of groups) lines.push(`| ${name} | ${pct(g.pass, g.total)} | ${pct(g.checksPass, g.checksTotal)} |`);
  return lines.join("\n");
}

function byCheck(rows: Row[]): string {
  const groups = new Map<string, { pass: number; total: number }>();
  for (const row of rows) for (const [name, ok] of row.checks) {
    const g = groups.get(name) ?? { pass: 0, total: 0 };
    g.total += 1;
    if (ok) g.pass += 1;
    groups.set(name, g);
  }
  const lines = ["| field | right |", "|---|---|"];
  for (const [name, g] of groups) lines.push(`| ${name} | ${pct(g.pass, g.total)} |`);
  return lines.join("\n");
}

it("variation report", async () => {
  const rows: Row[] = [];
  const only = (process.env.VARIATION_MODES ?? "").split(",").map(Number).filter(Boolean);
  const seeds = (process.env.VARIATION_SEEDS ?? "").split(",").filter(Boolean);
  // VARIATION_LIMIT=20: the smoke run, the first N variants of each mode (the same in the sibling app).
  const limit = Number(process.env.VARIATION_LIMIT ?? "") || Number.POSITIVE_INFINITY;
  for (const mode of MODES.filter((_, index) => only.length === 0 || only.includes(index + 1))) {
    reader.call = !mode.reader
      ? null
      : READER_MODE === "oracle"
        ? (async (input: { messages: { content: string }[] }) => ({ input: oracleReading(input.messages.map((m) => m.content).join("\n")), usage: NO_USAGE })) as never
        : (transport!.call as never);
    for (const seed of SEEDS.filter((entry) => seeds.length === 0 || seeds.includes(entry.id))) {
      current = seed;
      for (const variant of variantsOf(seed)) {
        if (rows.filter((row) => row.mode === mode.name).length >= limit) break;
        setFlags([...mode.flags, ...(mode.flags.length > 0 ? (seed.flags ?? []) : [])]);
        await reset();
        const out = await replay(variant.turns, seed.chatOnly === true, seed.openingQuestion === true);
        rows.push({ mode: mode.name, seed: seed.id, variant, checks: score(seed, out) });
      }
    }
  }
  const sections: string[] = [
    `# Variation report — ${process.env.VARIATION_APP ?? "this app"}`,
    "",
    `Production flags: ${[...PRODUCTION, ...LIVE_SINCE].join(", ")}.`,
    "",
    `This week's fixes (second mode, on top of production): ${NEW_FIXES.join(", ")}.`,
    "",
  ];
  if (READER_MODE) {
    const fully = (row: Row) => row.checks.every(([, ok]) => ok);
    // THE GATE: a variant fully right with this week's fixes and not with the reader is a loss, whatever else it gains.
    const lost = rows
      .filter((row) => row.mode === WITH_AI && !fully(row))
      .filter((row) => rows.some((before) => before.mode === MODES[1]!.name && before.seed === row.seed && before.variant.label === row.variant.label && fully(before)));
    sections.push(`AI reader replies: ${READER_MODE}${READER_MODE === "oracle" ? " (a perfect reader from the seeds; not the gate)" : ""}.`, "");
    if (transport) {
      const t = transport.stats;
      sections.push(`Reader calls: ${t.calls}; recorded now ${t.recorded}; no recording (ran as flag off) ${t.missing}; slower than 2 s ${t.slow}; tokens in/out ${t.inputTokens}/${t.outputTokens}.`, "");
    }
    sections.push(`Variants right with this week's fixes and wrong with the reader: ${lost.length}${lost.length ? ` (${lost.map((row) => `${row.seed} · ${row.variant.label}`).join(", ")})` : ""}.`, "");
  }
  for (const mode of MODES) {
    const mine = rows.filter((row) => row.mode === mode.name);
    if (mine.length === 0) continue;
    const all = mine.length;
    const right = mine.filter((row) => row.checks.every(([, ok]) => ok)).length;
    sections.push(`## ${mode.name}: ${pct(right, all)} of variants fully right`, "");
    sections.push(table("seed", mine, (row) => row.seed), "");
    sections.push(table("variation", mine, (row) => row.variant.kind), "");
    sections.push(byCheck(mine), "");
    sections.push("### Failing variants", "");
    for (const row of mine.filter((entry) => entry.checks.some(([, ok]) => !ok))) {
      const wrong = row.checks.filter(([, ok]) => !ok).map(([name, , read]) => `${name}: ${read}`).join("; ");
      sections.push(`- **${row.seed} · ${row.variant.label}** — ${wrong}  \n  \`${row.variant.turns.join(" / ").slice(0, 220)}\``);
    }
    sections.push("");
  }
  const report = sections.join("\n");
  mkdirSync(new URL("./out/", import.meta.url), { recursive: true });
  writeFileSync(new URL(`./out/report-${process.env.VARIATION_APP ?? "app"}.md`, import.meta.url), report);
  process.stdout.write(`\n${report}\n`);
}, 3_600_000);
