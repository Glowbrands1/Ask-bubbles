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
 * PAU, 28 OCT 2026 — "CAN WE CHANGE THE TYPE OF FORM MID CONVERSATION?"
 * ============================================================================
 *
 * "Sometimes a manager asks for a CA, then wants to change to coaching." With
 * the card open, the manager's next turn asks for the other form. The card
 * must switch to it and keep the employee, the date and the store. QA's
 * wordings and Pau's own, exactly. Off (main), most kept the old form or
 * answered with no card; FORM_TYPE_SWITCH_ENABLED switches them, keeping the
 * account. After Create nothing changes (a separate decision). Names are
 * invented.
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

/** The notes each draft request carried: what the manager's draft is written from. */
const draftNotes: string[] = [];

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const request = new Request(`https://app.test${url}`, init);
  const draft = /^\/api\/forms\/instances\/([^/]+)\/draft$/.exec(url);
  if (draft && typeof init?.body === "string") draftNotes.push(String((JSON.parse(init.body) as { notes?: unknown }).notes ?? ""));
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

const CA = "create a ca for dale ferris at dodge. she was late on 10/20";
const COACHING = "create a coaching form for dale ferris at dodge. she was late on 10/20";

const FLAG_SWITCH = "FORM_TYPE_SWITCH_ENABLED";

function production(on = true) {
  if (!saved.has(FLAG_SWITCH)) saved.set(FLAG_SWITCH, process.env[FLAG_SWITCH]);
  setProduction(true);
  if (on) process.env[FLAG_SWITCH] = "true";
  else delete process.env[FLAG_SWITCH];
  (state as { scope?: unknown }).scope = undefined;
  state.directory = [
    { id: "e-9", firstName: "Dale", lastName: "Ferris", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: null },
  ];
}

type Card = { templateKey?: string; employeeName?: string | null; formDate?: string | null; locationId?: string | null; issue?: string | null };

async function switched(open: string, wording: string) {
  const thread = new Thread();
  const before = ((await thread.say(open)) as { formProposal?: Card }).formProposal!;
  const answer = (await thread.say(wording)) as { formProposal?: Card; content: string };
  return { before, after: answer.formProposal, content: answer.content };
}

const CASES: readonly (readonly [string, string, string, string])[] = [
  [CA, "dpoa", "actually make it a coaching form", "coaching"],
  [CA, "dpoa", "change this to a coaching form", "coaching"],
  [CA, "dpoa", "can this be a coaching instead", "coaching"],
  [CA, "dpoa", "coaching form instead of ca", "coaching"],
  [CA, "dpoa", "switch it to coaching", "coaching"],
  [COACHING, "coaching", "actually make it a ca", "dpoa"],
  [COACHING, "coaching", "change this to a corrective action", "dpoa"],
  [COACHING, "coaching", "can this be a ca instead", "dpoa"],
  [COACHING, "coaching", "ca instead of coaching", "dpoa"],
  [COACHING, "coaching", "switch it to a ca", "dpoa"],
  // Pau's own wording, in lower case, sentence case and capitals.
  [CA, "dpoa", "change to coaching", "coaching"],
  [CA, "dpoa", "Change to coaching", "coaching"],
  [CA, "dpoa", "CHANGE TO COACHING", "coaching"],
  [COACHING, "coaching", "change to ca", "dpoa"],
  [COACHING, "coaching", "Change to ca", "dpoa"],
  [COACHING, "coaching", "CHANGE TO CA", "dpoa"],
  [COACHING, "coaching", "change to corrective action", "dpoa"],
  [COACHING, "coaching", "Change to corrective action", "dpoa"],
  [COACHING, "coaching", "CHANGE TO CORRECTIVE ACTION", "dpoa"],
];

describe("the open card switches form and keeps the employee, the date and the store", () => {
  beforeEach(() => production());
  for (const [open, from, wording, to] of CASES) {
    it(`${from} -> ${to}: "${wording}"`, async () => {
      const { before, after, content } = await switched(open, wording);
      expect(before.templateKey).toBe(from);
      // The open card is never dropped, and the account is kept: never asked again what happened.
      expect(content).not.toMatch(/haven't told me what happened/i);
      expect(after?.templateKey).toBe(to);
      expect([after?.employeeName, after?.formDate, after?.locationId]).toEqual([before.employeeName, before.formDate, before.locationId]);
      if (to === "dpoa") expect(after?.issue).toBeTruthy();
    });
  }

  it("a later turn keeps the new form", async () => {
    const thread = new Thread();
    await thread.say(CA);
    await thread.say("change to coaching");
    expect(((await thread.say("she was also on her phone")) as { formProposal?: Card }).formProposal?.templateKey).toBe("coaching");
  });

  it("asking for the form that is already open changes nothing", async () => {
    const { after } = await switched(CA, "change to ca");
    expect(after?.templateKey).toBe("dpoa");
  });
});

describe("flag off, as main", () => {
  it("Pau's wording keeps the old form or drops the card", async () => {
    production(false);
    expect((await switched(CA, "change to coaching")).after?.templateKey).toBe("dpoa");
    expect((await switched(COACHING, "change to ca")).after).toBeUndefined();
  });
});

describe("after Create, unchanged for now (a separate decision)", () => {
  it("\"change to coaching\" on a created CA is answered as on main", async () => {
    production(true);
    const on = new Thread();
    await on.say(CA);
    await on.create();
    const withFlag = ((await on.say("change to coaching")) as { formProposal?: Card }).formProposal?.templateKey ?? null;
    production(false);
    const off = new Thread();
    await off.say(CA);
    await off.create();
    expect(withFlag).toBe(((await off.say("change to coaching")) as { formProposal?: Card }).formProposal?.templateKey ?? null);
  });
});

/*
 * QA LIVE, 28 OCT 2026: the switch worked but "Create draft" on the switched
 * card saved nothing. The create route checks the card against the stored
 * conversation, which still read "create a ca …" as the last form asked for.
 * Create after a switch must file the switched form.
 */
describe("Create after a switch files the switched form", () => {
  const templateOf = (id: string) => {
    const row = (store.form_instances as unknown as { id: string; template_id?: string }[]).find((r) => r.id === id);
    const templates = ((store as unknown as Record<string, unknown>).form_templates ?? []) as { id: string; key: string }[];
    return templates.find((t) => t.id === row?.template_id)?.key;
  };
  for (const [open, from, wording, to] of [
    [CA, "dpoa", "change to coaching", "coaching"],
    [CA, "dpoa", "switch it to coaching", "coaching"],
    [COACHING, "coaching", "change to ca", "dpoa"],
    [COACHING, "coaching", "CHANGE TO CORRECTIVE ACTION", "dpoa"],
  ] as const) {
    it(`${from} -> "${wording}" -> Create`, async () => {
      production(true);
      const thread = new Thread();
      const before = ((await thread.say(open)) as { formProposal?: Card }).formProposal!;
      const switched = ((await thread.say(wording)) as { formProposal?: Card }).formProposal!;
      expect(switched.templateKey).toBe(to);
      const forms = store.form_instances.length;
      const id = await thread.create();
      const row = (store.form_instances as unknown as { id: string; employee_name: string; form_date: string; location_id: string }[]).find((r) => r.id === id)!;
      expect(templateOf(id)).toBe(to);
      expect([row.employee_name, row.form_date, row.location_id]).toEqual([before.employeeName, before.formDate, before.locationId]);
      expect(store.form_instances).toHaveLength(forms + 1);
      expect((store.form_instance_events as unknown as { instance_id: string; kind: string }[]).filter((e) => e.instance_id === id).map((e) => e.kind)).toContain("drafted");
    });
  }

  it("the old card after the switch is still refused, and nothing is filed", async () => {
    production(true);
    const thread = new Thread();
    const before = ((await thread.say(CA)) as { formProposal?: Card }).formProposal!;
    await thread.say("change to coaching");
    const forms = store.form_instances.length;
    (thread as unknown as { proposal: unknown }).proposal = before;
    await expect(thread.create()).rejects.toThrow(/out of date/);
    expect(store.form_instances).toHaveLength(forms);
  });
});


describe("after Create, with FORM_TYPE_SWITCH_AFTER_CREATE_NOTE_ENABLED: the draft is left, the reply says so, the other form starts", () => {
  const NOTE_FLAG = "FORM_TYPE_SWITCH_AFTER_CREATE_NOTE_ENABLED";
  const AFTER: readonly (readonly [string, string, string, string])[] = [
    [CA, "dpoa", "change to coaching", "coaching"],
    [CA, "dpoa", "Change to coaching", "coaching"],
    [CA, "dpoa", "CHANGE TO COACHING", "coaching"],
    [COACHING, "coaching", "change to ca", "dpoa"],
    [COACHING, "coaching", "Change to ca", "dpoa"],
    [COACHING, "coaching", "CHANGE TO CA", "dpoa"],
    [COACHING, "coaching", "change to corrective action", "dpoa"],
    [COACHING, "coaching", "Change to corrective action", "dpoa"],
    [COACHING, "coaching", "CHANGE TO CORRECTIVE ACTION", "dpoa"],
  ];
  const NOTE = {
    coaching: "You already have a Corrective Action draft for **Dale Ferris**. I'll start a Coaching Form too, and the Corrective Action draft stays in the Forms Register until you delete it.",
    dpoa: "You already have a Coaching Form draft for **Dale Ferris**. I'll start a Corrective Action Form too, and the Coaching Form draft stays in the Forms Register until you delete it.",
  } as const;
  const snapshot = (id: string) =>
    JSON.stringify([
      (store.form_instances as unknown as { id: string }[]).filter((row) => row.id === id),
      (store.form_instance_values as unknown as { instance_id: string }[]).filter((row) => row.instance_id === id),
    ]);

  for (const [open, from, wording, to] of AFTER) {
    it(`${from} created, then "${wording}"`, async () => {
      production(true);
      if (!saved.has(NOTE_FLAG)) saved.set(NOTE_FLAG, process.env[NOTE_FLAG]);
      process.env[NOTE_FLAG] = "true";
      const thread = new Thread();
      const before = ((await thread.say(open)) as { formProposal?: Card }).formProposal!;
      const id = await thread.create();
      const forms = store.form_instances.length;
      const draft = snapshot(id);
      const answer = (await thread.say(wording)) as { content: string; formProposal?: Card };
      expect(snapshot(id)).toBe(draft);
      expect(store.form_instances).toHaveLength(forms);
      expect(answer.content.split(NOTE[to as keyof typeof NOTE])).toHaveLength(2);
      expect(answer.content).not.toMatch(/haven't told me what happened/i);
      expect(answer.formProposal?.templateKey).toBe(to);
      expect([answer.formProposal?.employeeName, answer.formProposal?.formDate, answer.formProposal?.locationId]).toEqual([before.employeeName, before.formDate, before.locationId]);
      if (to === "dpoa") expect(answer.formProposal?.issue).toBeTruthy();
    });
  }

  it("Create on the new card files the other form; the first draft is still there, unchanged", async () => {
    production(true);
    process.env.FORM_TYPE_SWITCH_AFTER_CREATE_NOTE_ENABLED = "true";
    const thread = new Thread();
    await thread.say(CA);
    const forms = store.form_instances.length;
    const first = await thread.create();
    const draft = snapshot(first);
    await thread.say("change to coaching");
    (thread as unknown as { instanceId: string | null }).instanceId = null;
    const second = await thread.create();
    expect(second).not.toBe(first);
    expect(store.form_instances).toHaveLength(forms + 2);
    expect(snapshot(first)).toBe(draft);
    const templates = ((store as unknown as Record<string, unknown>).form_templates ?? []) as { id: string; key: string }[];
    const row = (store.form_instances as unknown as { id: string; template_id?: string; employee_name: string }[]).find((r) => r.id === second)!;
    expect(templates.find((t) => t.id === row.template_id)?.key).toBe("coaching");
    expect(row.employee_name.toLowerCase()).toBe("dale ferris");
  });

  it("with only the after-Create flag on, Create on the new card still files the other form", async () => {
    production(false);
    process.env.FORM_TYPE_SWITCH_AFTER_CREATE_NOTE_ENABLED = "true";
    const thread = new Thread();
    await thread.say(CA);
    const forms = store.form_instances.length;
    await thread.create();
    const answer = (await thread.say("change to coaching")) as { formProposal?: Card };
    expect(answer.formProposal?.templateKey).toBe("coaching");
    (thread as unknown as { instanceId: string | null }).instanceId = null;
    await thread.create();
    expect(store.form_instances).toHaveLength(forms + 2);
  });
});

/*
 * QA LIVE, 28 OCT 2026 (after-Create note, flag on): the new Coaching draft
 * read "Observed:\nA change to coaching was noted for Dale Ferris." — it was
 * drafted from the switch turn alone, and the lateness was lost. The card's
 * draft sources were the turns about the new form, which after Create is only
 * "change to coaching". The draft must be written from the original account,
 * never from the switch turn, before Create and after.
 */
describe("the switched form's draft is written from the account, never from the switch turn", () => {
  const lastNotes = () => draftNotes[draftNotes.length - 1] ?? "";

  for (const [open, wording] of [
    [CA, "change to coaching"],
    [COACHING, "change to ca"],
  ] as const) {
    it(`before Create: "${wording}" -> Create`, async () => {
      production(true);
      const thread = new Thread();
      await thread.say(open);
      await thread.say(wording);
      await thread.create();
      expect(lastNotes()).toContain("late on 10/20");
      expect(lastNotes().toLowerCase()).not.toContain(wording.toLowerCase());
    });

    it(`after Create: "${wording}" -> Create on the new card`, async () => {
      production(true);
      process.env.FORM_TYPE_SWITCH_AFTER_CREATE_NOTE_ENABLED = "true";
      const thread = new Thread();
      await thread.say(open);
      await thread.create();
      await thread.say(wording);
      (thread as unknown as { instanceId: string | null }).instanceId = null;
      await thread.create();
      expect(lastNotes()).toContain("late on 10/20");
      expect(lastNotes().toLowerCase()).not.toContain(wording.toLowerCase());
    });
  }

  it("a turn asking for the form that is already open stays a draft source", async () => {
    production(true);
    const thread = new Thread();
    await thread.say(CA);
    await thread.say("make it a written ca");
    await thread.create();
    expect(lastNotes()).toContain("late on 10/20");
    expect(lastNotes()).toContain("make it a written ca");
  });
});

