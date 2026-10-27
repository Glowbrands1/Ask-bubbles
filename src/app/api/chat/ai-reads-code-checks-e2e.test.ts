import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { continuationFor } from "@/lib/forms/proposal-continuation";
import { createId } from "@/lib/utils/id";
import { rosterResultFor } from "@/test/roster-result";
import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { AccessScope, ChatFormProposal, ChatMessage } from "@/types";

/**
 * ============================================================================
 * THE AI READS, THE CODE CHECKS (AI_READS_CODE_CHECKS_ENABLED) — END TO END
 * ============================================================================
 *
 * QA's seeds from the variation report (27 Oct 2026), word for word, every
 * name invented, through the same server path the browser uses: POST
 * /api/chat, `createInlineForm`, the create and draft routes, in this app's
 * production env. The reader's reply is a recorded-style stub (`state.reading`):
 * the tests check what the code does with a reading, not how the model reads.
 *
 *   - flag off, or a reply that is null, unusable, an error or over two
 *     seconds (the timed call throws): the form is exactly the flag-off form;
 *   - QA S12 "this should be a written and note a verbal ca was given on
 *     9-1-26": Type of warning was blank, now Written;
 *   - QA S1 "first name only" / "Last, First": the employee was saved as
 *     "quinn" / "Marlowe", now Quinn Marlowe;
 *   - QA S3 "i need to issue a ca for someone being late" ... "dodge": no form
 *     could be created, now it is, with the prior step "10.1" and payroll yes.
 *
 * Harness: the variation report's (support/variation-report/run.report.ts).
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
  reading: null as unknown,
  readerCalls: 0,
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

vi.mock("@/lib/ai/call-claude", () => ({
  // AI_READS_CODE_CHECKS_ENABLED: the reader's model, a recorded-style reply per test (`state.reading`).
  callClaudeToolTimed: async () => {
    state.readerCalls += 1;
    if (state.reading instanceof Error) throw state.reading;
    return { input: state.reading, usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } };
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

/** Production as the variation report's second mode sets it: PRODUCTION, the flags live since, and this week's fixes. */
const LIVE_SINCE = ["PRIOR_SENTENCE_FIX_ENABLED", "REMAP_DRAFT_SOURCES_ENABLED", "NEXT_PUBLIC_REMAP_DRAFT_SOURCES_ENABLED"];
const NEW_FIXES = [
  "DATE_ANSWER_APPLIED_ENABLED", "DATE_ANSWER_KEEPS_OPEN_ENABLED", "REQUEST_LINE_ACCOUNT_ENABLED", "PAYROLL_TYPO_NOT_A_NAME_ENABLED",
  "POSITION_ANSWER_GUARD_ENABLED", "PRIOR_ROW_NOT_ON_INCIDENT_DATE_ENABLED", "NOT_DEDUCTIBLE_READ_ENABLED", "PRIOR_STEP_SENTENCE_ENABLED",
  "EXIT_FULFILLED_IS_LAST_DAY_ENABLED", "DATE_LINE_NO_ECHO_ENABLED", "FUTURE_PRIOR_ROW_DROP_ENABLED", "MEETING_NOT_LATENESS_PLAN_ENABLED",
  "PLAN_PAYROLL_SENTENCE_ENABLED", "NAME_QUESTION_ONLY_ENABLED", "ANIMAL_ANYWHERE_ENABLED",
];
const READER_FLAG = "AI_READS_CODE_CHECKS_ENABLED";

function setProduction(reader: boolean) {
  for (const name of [...ALL_FLAGS, ...LIVE_SINCE, ...NEW_FIXES, READER_FLAG]) {
    if (!saved.has(name)) saved.set(name, process.env[name]);
    delete process.env[name];
  }
  for (const name of [...PRODUCTION, ...LIVE_SINCE, ...NEW_FIXES]) process.env[name] = "true";
  if (reader) process.env[READER_FLAG] = "true";
}

beforeEach(() => {
  state.reading = null;
  state.readerCalls = 0;
});

async function reset() {
  for (const key of Object.keys(store) as (keyof FakeStore)[]) store[key] = [];
  store.form_instances = new JoiningRows() as never;
  state.draft = { values: {} };
  state.directory = [...ROSTER];
  await ensureTemplateLibrary("system");
}

/** The chat, then the card's Create: the saved form's fields, and every reply. */
async function run(turns: readonly string[], reader: boolean): Promise<{ replies: string[]; fields: Record<string, { value: string; checked: string[] }> }> {
  setProduction(reader);
  await reset();
  const thread = new Thread();
  const replies: string[] = [];
  for (const turn of turns) replies.push((await thread.say(turn)).content);
  const id = await thread.create();
  const fields: Record<string, { value: string; checked: string[] }> = {};
  for (const row of store.form_instance_values.filter((entry) => entry.instance_id === id)) {
    fields[String(row.field_key)] = { value: String(row.value ?? ""), checked: Array.isArray(row.checked) ? (row.checked as string[]) : [] };
  }
  return { replies, fields };
}

const S12 = [
  "create a CA form for quinn marlowe, team member at grand island, for opening store late on 9-28-26",
  "this should be a written and note a verbal ca was given on 9-1-26",
  "Create a form from this conversation.",
];
const S12_READING = {
  employee: { value: "quinn marlowe", evidence: "quinn marlowe" },
  incidentDate: { value: "2026-09-28", evidence: "9-28-26" },
  warningLevel: { value: "written", evidence: "this should be a written" },
  priorSteps: [{ kind: "verbal", date: "2026-09-01", evidence: "a verbal ca was given on 9-1-26" }],
};

describe("flag off, or no usable reply: the flag-off form", () => {
  it("off: the reader is never called", async () => {
    state.reading = S12_READING;
    await run(S12, false);
    expect(state.readerCalls).toBe(0);
  });

  it.each([
    ["a null reply", null],
    ["an error, or a reply over two seconds (the timed call throws)", new Error("timeout")],
    ["a reply that is not a reading", "hello"],
  ])("%s gives the flag-off replies and fields", async (_label, reply) => {
    const off = await run(S12, false);
    state.reading = reply;
    const on = await run(S12, true);
    expect(state.readerCalls).toBeGreaterThan(0);
    expect(on.replies).toEqual(off.replies);
    expect(on.fields).toEqual(off.fields);
  });

});

describe("QA S12: \"this should be a written and note a verbal ca was given on 9-1-26\"", () => {
  it("Type of warning was blank; with the reader it is Written, and the verbal on 9/1 is a prior step", async () => {
    const off = await run(S12, false);
    expect(off.fields.warning_type?.checked ?? []).not.toContain("written");
    state.reading = S12_READING;
    const on = await run(S12, true);
    expect(on.fields.warning_type?.checked).toContain("written");
    expect(on.fields.prior_actions?.value).toContain("09/01/2026");
    expect(on.fields.employee_name?.value).toBe("Quinn Marlowe");
  });

  it("a level the quote does not say is dropped by the code", async () => {
    state.reading = { ...S12_READING, warningLevel: { value: "verbal", evidence: "this should be a written" } };
    const on = await run(S12, true);
    expect(on.fields.warning_type?.checked ?? []).toEqual([]);
  });
});

const S1 = [
  "My employee quinn marlowe has was 10 minutes late on her last two shifts. On the first shift I verbally coached her on our policy and expectations. Then she was late again. Please create a CA form so I can document. She was late on 10/5 and 10/15",
  "I already told you the employee name. She is at Dodge",
  "10/15",
];

describe("QA S1 name forms: the employee is saved as the roster spells them", () => {
  it.each([
    ["first name only", "quinn", "quinn"],
    ["Last, First", "Marlowe, Quinn", "Marlowe, Quinn"],
  ])("%s", async (_label, typed, evidence) => {
    const turns = S1.map((turn) => turn.replace(/quinn marlowe/i, typed));
    const off = await run(turns, false);
    expect(off.fields.employee_name?.value).not.toBe("Quinn Marlowe");
    state.reading = { employee: { value: typed, evidence }, incidentDate: { value: "2026-10-15", evidence: "10/15" } };
    const on = await run(turns, true);
    expect(on.fields.employee_name?.value).toBe("Quinn Marlowe");
    expect(on.fields.form_date?.value).toBe("2026-10-15");
  });

  it("a name the roster does not have is not put on the card", async () => {
    const turns = S1.map((turn) => turn.replace(/quinn marlowe/i, "quinn"));
    const off = await run(turns, false);
    state.reading = { employee: { value: "Quinn Ashby", evidence: "Quinn Ashby" } };
    const on = await run(turns, true);
    expect(on.fields.employee_name?.value).toBe(off.fields.employee_name?.value);
  });
});

const S3 = [
  "i need to issue a ca for someone being late",
  "quinn marlowe was late on 10/20 and the store was opened late",
  "she was issued a verbal ca on 10.1 for this same thing",
  "yes payrol ldeduct",
  "i dont know the amount",
  "dodge",
];

describe("QA S3: \"she was issued a verbal ca on 10.1\" ... \"yes payrol ldeduct\" ... \"dodge\"", () => {
  it("no form could be created; with the reader it is, with the 10/1 verbal and payroll yes", async () => {
    setProduction(false);
    await reset();
    const thread = new Thread();
    for (const turn of S3) await thread.say(turn);
    await expect(thread.create()).rejects.toThrow();

    state.reading = {
      employee: { value: "quinn marlowe", evidence: "quinn marlowe" },
      incidentDate: { value: "2026-10-20", evidence: "10/20" },
      payroll: { value: "yes", evidence: "yes payrol ldeduct" },
      location: { value: "dodge", evidence: "dodge" },
      priorSteps: [{ kind: "verbal", date: "2026-10-01", evidence: "she was issued a verbal ca on 10.1" }],
    };
    const on = await run(S3, true);
    expect(on.fields.employee_name?.value).toBe("Quinn Marlowe");
    expect(on.fields.form_date?.value).toBe("2026-10-20");
    expect(on.fields.prior_actions?.value).toContain("10/01/2026");
    expect((on.fields.payroll_deduct?.checked ?? []).join(",")).toContain("yes");
  });
});
