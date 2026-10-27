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
 * QA ITEM 3, 27 OCT 2026 — THE JOB TITLE THE MANAGER TYPED, OR ASKED ONCE
 * ============================================================================
 *
 * LS-B2 (a manager's chat, 16 Oct: "I would like it to ask the position of the
 * employee"), word for word, names invented: "I need a CA form for <name> at
 * Kearney for being out of dress code on October 11" / "This is a verbal
 * warning. Her prior coaching is her policy manual ackwnelegement on 9/01.
 * payroll deduction is not applicable." / "Use Kearney as the location" — the
 * Job Title stayed empty and the position was never asked. BF8 (exit form,
 * QA's wording with this app's title): "<name> was a makery associate at dodge
 * location" — Job Title not set. B-H1's later turn "She is a makery associate"
 * the same. JOB_TITLE_FROM_WORDS_ENABLED (default off): the title the manager
 * typed is kept as typed; with none typed and none on record, it is asked once.
 * Through POST /api/chat in this app's production env.
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
  callClaude: async () => {
    state.chatModelCalls += 1;
    return ANSWER;
  },
  callClaudeTool: async (input: { tool?: { name?: string }; messages?: { content?: unknown }[] }) => {
    if (input.tool?.name === "extract_form_fields") {
      const text = JSON.stringify(input.messages ?? []);
      return {
        templateKey: /\b(?:ca|corrective action)\b/i.test(text) ? "dpoa" : null,
        employeeName: /quinn marlowe/i.test(text) ? "Quinn Marlowe" : /dale ferris/i.test(text) ? "Dale Ferris" : /ivy hollis/i.test(text) ? "Ivy Hollis" : null,
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
const ASKED = "position (job title)?";

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

async function chat(turns: readonly string[]) {
  const thread = new Thread();
  const replies: string[] = [];
  for (const turn of turns) replies.push((await thread.say(turn)).content);
  return { thread, replies, title: thread.proposal?.employeeRole ?? null, asked: replies.filter((reply) => reply.includes(ASKED)).length };
}

const LS_B2 = [
  "I need a CA form for dale ferris at Kearney for being out of dress code on October 11",
  "This is a verbal warning. Her prior coaching is her policy manual ackwnelegement on 9/01. payroll deduction is not applicable.",
  "Use Kearney as the location",
];
/** QA's BF8, word for word ("salon" as typed): the title is not one of this company's, which is the case the reader misses. */
const BF8 = [
  "create an exit form. employee name is ivy hollis. ivy was a tanning consultant at dodge location. on 9-15-26 ivy provided her resignation to management and her last day worked was 9-28-26",
  "ivy gave and worked 2 week notice. ivy messaged management her resignation via woven. all salon items were returned and she is eligible for rehire",
];
const BF8_NO_TITLE = [BF8[0]!.replace(" ivy was a tanning consultant at dodge location.", ""), BF8[1]!];
const B_H1 = [
  "My employee quinn marlowe has was 10 minutes late on her last two shifts. On the first shift I verbally coached her on our policy and expectations. Then she was late again. Please create a CA form so I can document. She was late on 10/5 and 10/15",
  "I already told you the employee name. She is at Dodge",
  "Create the coaching form with the information given. Her name is quinn marlowe and she is at Dodge. She is a makery associate",
];

describe(`${JT} on`, () => {
  beforeEach(() => setProduction(true));

  it.each([
    ["as typed", BF8],
    ["Sentence case", BF8.map((turn) => turn.replace(/^([a-z])/, (letter) => letter.toUpperCase()).replace(/tanning consultant/, "Tanning Consultant"))],
  ])("BF8 %s: the exit form keeps the typed title, nothing asked", async (_casing, turns) => {
    const { thread, title, asked } = await chat(turns);
    expect(title).toBe("Tanning Consultant");
    expect(asked).toBe(0);
    state.draft = { values: {} };
    const id = await thread.create();
    expect(store.form_instances.find((row) => row.id === id)?.employee_role).toBe("Tanning Consultant");
  });

  it("BF8 with no title typed: the exit form asks for the position, once", async () => {
    const { title, asked } = await chat(BF8_NO_TITLE);
    expect(title).toBeNull();
    expect(asked).toBe(1);
  });

  it("BF8 with no title typed: the answer is the Job Title", async () => {
    const { thread } = await chat(BF8_NO_TITLE);
    await thread.say("she was a makery associate");
    expect(thread.proposal?.employeeRole).toBe("Makery Associate");
  });

  // Already right on main with this company's titles; the flag keeps them so.
  it("LS-B2: no title typed, none on record: asked once, as main", async () => {
    const { asked, title } = await chat(LS_B2);
    expect(asked).toBe(1);
    expect(title).toBeNull();
  });

  it("B-H1: \"She is a makery associate\" is the Job Title, as main", async () => {
    const { title } = await chat(B_H1);
    expect(title).toBe("Makery Associate");
  });

  it("a title on record is not asked about", async () => {
    state.directory = state.directory.map((row) => ({ ...(row as object), positionName: "Team Member" }));
    const { asked } = await chat(BF8_NO_TITLE);
    expect(asked).toBe(0);
  });
});

describe(`${JT} off: as main`, () => {
  beforeEach(() => setProduction(false));

  it("BF8: the typed title is lost and the position is never asked", async () => {
    const typed = await chat(BF8);
    expect([typed.title, typed.asked]).toEqual([null, 0]);
    const none = await chat(BF8_NO_TITLE);
    expect([none.title, none.asked]).toEqual([null, 0]);
  });

  it("the flag reads off by default", async () => {
    const { jobTitleFromWordsEnabled } = await import("@/lib/config/chat-quality-flags");
    expect(jobTitleFromWordsEnabled()).toBe(false);
  });
});

/*
 * QA S12 / SF4 (ported from the sibling app), with this app's store and title,
 * the name invented: "create a CA form for <name>, makery associate at
 * kearney, for opening late on 9-28-26" / "this should be a written and note
 * a verbal ca was given on 9-1-26" / "Create a form from this conversation."
 * The warning level stayed blank and the card asked "Verbal Warning or Written
 * Warning?". WARNING_LEVEL_AND_CLAUSE_ENABLED reads the level in a clause of
 * its own; JOB_TITLE_APPOSITION_ENABLED reads "<name>, <title> at <store>".
 */
const WL = "WARNING_LEVEL_AND_CLAUSE_ENABLED";
const AP = "JOB_TITLE_APPOSITION_ENABLED";
const S12 = [
  "create a CA form for quinn marlowe, makery associate at kearney, for opening late on 9-28-26",
  "this should be a written and note a verbal ca was given on 9-1-26",
  "Create a form from this conversation.",
];

function s12Production(on: boolean) {
  setProduction(on);
  for (const name of [WL, AP]) {
    if (!saved.has(name)) saved.set(name, process.env[name]);
    delete process.env[name];
    if (on) process.env[name] = "true";
  }
}

describe(`${WL} on`, () => {
  beforeEach(() => s12Production(true));

  it.each([
    ["as written", S12],
    ["lowercase", S12.map((turn) => turn.toLowerCase())],
    ["Sentence case", S12.map((turn) => turn.replace(/quinn marlowe/g, "Quinn Marlowe").replace(/^([a-z])/, (letter) => letter.toUpperCase()))],
  ])("S12 %s: Written, as said, and the typed title", async (_casing, turns) => {
    const { thread, replies, title } = await chat(turns);
    expect(thread.proposal?.warningLevel).toBe("written");
    expect(replies[2]).toContain("**Type of warning:** Written Warning, as you said");
    expect(replies[2]).not.toContain("Is this new corrective action a **Verbal Warning** or a **Written Warning**?");
    expect(title).toBe("Makery Associate");
  });


  it("a level only in the step's history states nothing", async () => {
    const { thread } = await chat([S12[0]!, "note a verbal ca was given on 9-1-26 and she was late again", S12[2]!]);
    expect(thread.proposal?.warningLevel ?? null).toBeNull();
  });
});

describe(`${WL} and ${AP} off: as main`, () => {
  beforeEach(() => s12Production(false));

  it("S12: the level stays blank and is asked", async () => {
    const { thread, replies, title } = await chat(S12);
    expect(thread.proposal?.warningLevel ?? null).toBeNull();
    expect(replies[2]).toContain("Is this new corrective action a **Verbal Warning** or a **Written Warning**?");
    // This company's own title is read from its list on main; the apposition flag matters for one off the list.
    expect(title).toBe("Makery Associate");
  });
});

/*
 * QA, 27 Oct 2026 (live, BF8 shape): the exit form's read-back said "Left
 * blank for you to review: Job Title" while the card and the draft had the
 * typed title. EXIT_READBACK_JOB_TITLE_ENABLED: the read-back matches.
 */
const RB = "EXIT_READBACK_JOB_TITLE_ENABLED";

describe(`${RB}`, () => {
  for (const on of [true, false]) {
    it(`${on ? "on: the read-back lists the Job Title" : "off: as main, listed as blank"}`, async () => {
      setProduction(true);
      if (!saved.has(RB)) saved.set(RB, process.env[RB]);
      delete process.env[RB];
      if (on) process.env[RB] = "true";
      const { replies, title } = await chat(BF8);
      expect(title).toBe("Tanning Consultant");
      const first = replies[0]!;
      if (on) {
        expect(first).toContain("- **Job Title:** Tanning Consultant");
        expect(first).not.toMatch(/Left blank for you to review:\*\*[^\n]*Job Title/);
      } else {
        expect(first).toMatch(/Left blank for you to review:\*\* Job Title/);
      }
    });
  }
});
