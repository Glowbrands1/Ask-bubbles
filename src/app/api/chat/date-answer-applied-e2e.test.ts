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
 * QA, 26 OCT 2026 — THE ANSWER TO "WHICH DATE GOES ON THE FORM?" DATES IT
 * ============================================================================
 *
 * Live (this app, chat bb8128db; tester drafts e945e0ae, 26d9ef3a), a real
 * one-star chat word for word, the name invented:
 *
 *   1 "My employee quinn marlowe has was 10 minutes late on her last two
 *      shifts. … She was late on 10/5 and 10/15"
 *      → "You mentioned more than one date (**10/5**, **10/15**). Which date
 *        goes on the form? …"
 *   2 "I already told you the employee name. She is at Dodge"
 *   3 "10/15"
 *      → the question went away, the card kept no date, and Create dated the
 *        form TODAY. "10-15", "the 15th" and "most recent" also left the card
 *        (plain chat), and after turn 2 "most recent" became the employee.
 *
 * DATE_ANSWER_APPLIED_ENABLED (default off, same flag in both apps): a short
 * reply that only answers the open date question sets the date — also after a
 * turn in between — "10-15" and "the 15th" pick the date asked about with that
 * day, and "most recent" is never a person. Every turn through POST /api/chat,
 * Create through the draft route, in this app's production env; with the flag
 * off each answer reads as main does today.
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
        employeeName: /quinn marlowe/i.test(text) ? "Quinn Marlowe" : null,
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
      actual.scopeRoster(state.directory as never, scope).map((person) => ({ ...person, title: "Team Member", primaryLocationName: "Kearney, NE" })),
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
    { id: "e-1", firstName: "Quinn", lastName: "Marlowe", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-66"], positionName: "Team Member Part Time" },
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




const DA_FLAG = "DATE_ANSWER_APPLIED_ENABLED";
const T1 =
  "My employee quinn marlowe has was 10 minutes late on her last two shifts. On the first shift I verbally coached her on our policy and expectations. Then she was late again. Please create a CA form so I can document. She was late on 10/5 and 10/15";
const T2 = "I already told you the employee name. She is at Dodge";
/** What a manager types back, and the date it means. */
const ANSWERS: readonly (readonly [string, string | null])[] = [
  ["10/15", "2026-10-15"],
  ["10-15", "2026-10-15"],
  ["10/15/26", "2026-10-15"],
  ["most recent", "2026-10-15"],
  ["the 15th", "2026-10-15"],
  ["oct 15", "2026-10-15"],
  ["today", null],
];
const sentenceCase = (text: string) => text.replace(/^([a-z])/, (letter) => letter.toUpperCase()).replace(/\bi\b/g, "I");
const CASINGS = [
  ["lowercase", (text: string) => text.replace(/^My employee/, "my employee")],
  ["Sentence case", sentenceCase],
] as const;

function useProduction(on: boolean) {
  for (const name of [...ALL_FLAGS, DA_FLAG]) delete process.env[name];
  for (const name of PRODUCTION) process.env[name] = "true";
  // PRIOR_SENTENCE_FIX is live in this app since #245.
  process.env[FLAG] = "true";
  if (on) process.env[DA_FLAG] = "true";
  process.env.REMAP_DRAFT_SOURCES_ENABLED = "true";
  process.env.NEXT_PUBLIC_REMAP_DRAFT_SOURCES_ENABLED = "true";
}

async function answered(turns: readonly string[], create = true) {
  const thread = new Thread();
  let last: Answer | null = null;
  for (const turn of turns) last = await thread.say(turn);
  const draft = create && thread.proposal
    ? await createdDate(thread, "Observed: Quinn Marlowe arrived late on October 5, 2026, and again on October 15, 2026.")
    : null;
  return { last: last!, proposal: last!.formProposal ?? null, draft };
}


/** Create, as the browser does it, and the saved form's date. */
async function createdDate(thread: Thread, observationText: string) {
  state.draft = { values: { observation: observationText, prior_actions: "" } };
  const id = await thread.create();
  return store.form_instance_values.find((row) => row.instance_id === id && row.field_key === "form_date")?.value ?? null;
}

describe(`${DA_FLAG} on`, () => {
  beforeEach(() => useProduction(true));

  describe.each(CASINGS)("%s", (_casing, cased) => {
    for (const between of [false, true]) {
      it.each(ANSWERS)(`${between ? "after \"She is at Dodge\", " : ""}"%s" dates the card and the draft`, async (reply, iso) => {
        const { last, proposal, draft } = await answered([cased(T1), ...(between ? [cased(T2)] : []), cased(reply)]);
        expect(proposal?.templateKey, last.content).toBe("dpoa");
        expect(proposal?.employeeName).toBe("Quinn Marlowe");
        expect(proposal?.formDate ?? null).toBe(iso);
        expect(last.content).not.toMatch(/Which date goes on the form\?/);
        expect(draft).toBe(iso ?? TODAY);
      });
    }
  });
});

/*
 * QA's negatives (26 Oct 2026): a reply that names a person is no date
 * answer, and a reply with two dates ("10/5 and 10/15") picks neither — on
 * main, straight after the question, it dated the form with the last one.
 */
describe(`${DA_FLAG} on: not an answer`, () => {
  beforeEach(() => useProduction(true));

  for (const between of [false, true]) {
    it.each(["payton rolls", "10/5 and 10/15"])(`${between ? "after a turn, " : ""}"%s" leaves the form undated`, async (reply) => {
      const { proposal } = await answered([T1, ...(between ? [T2] : []), reply], false);
      expect(proposal?.formDate ?? null).toBeNull();
      // "payton rolls" is read as a person here (the app asks about her); never a date.
      if (proposal) expect(proposal.employeeName).toBe("Quinn Marlowe");
    });
  }
});

/*
 * QA BT4, live 26 Oct 2026 (conv_mvpnbveu27l2dv3): the date question, then
 * two answers to the other questions, then the date. The question vanished
 * from the card after the first answer, and "10-15" did not date the form:
 * the app's own lines added to the reply ("No payroll deduction. Warning
 * level: verbal.") made it more than a short answer. With the flag on the
 * question stays on every card until answered, and the answer dates it.
 */
const BT4 = [
  "create a ca for quinn marlowe at omaha ne, she was late on 10-5 and 10-15. i coached her on 10-16 about being late",
  "verbal",
  "no payroll deduct",
  "10-15",
];

describe(`${DA_FLAG} on: BT4`, () => {
  beforeEach(() => useProduction(true));

  it.each(CASINGS)("%s", async (_casing, cased) => {
    const thread = new Thread();
    const asked: boolean[] = [];
    let last: Answer | null = null;
    for (const turn of BT4) {
      last = await thread.say(cased(turn));
      asked.push(/Which date goes on the form\?/.test(last.content));
    }
    expect(asked).toEqual([true, true, true, false]);
    expect(last!.formProposal?.formDate).toBe("2026-10-15");
    expect(last!.formProposal?.employeeName).toBe("Quinn Marlowe");
    expect(await createdDate(thread, "Observed: Quinn Marlowe arrived late on October 5, 2026, and again on October 15, 2026.")).toBe("2026-10-15");
  });
});

/*
 * NEVER-BREAK: with the flag off, main today (this app's production env).
 * Straight after the question "10/15", "10/15/26" and "oct 15" already date
 * it; "10-15", "the 15th" and "most recent" leave the card. After a turn in
 * between, no answer dates it, and Create on the card still shown is refused:
 * "most recent" is read as the employee.
 */
const MAIN: Record<string, Record<string, unknown>> = {
  "10/15": { card: true, formDate: "2026-10-15" },
  "10-15": { card: false, formDate: null },
  "10/15/26": { card: true, formDate: "2026-10-15" },
  "most recent": { card: false, formDate: null },
  "the 15th": { card: false, formDate: null },
  "oct 15": { card: true, formDate: "2026-10-15" },
  today: { card: true, formDate: null },
};
const MAIN_AFTER_A_TURN: Record<string, Record<string, unknown>> = {
  "10/15": { card: true, formDate: null },
  "10-15": { card: false, formDate: null },
  "10/15/26": { card: true, formDate: null },
  "most recent": { card: false, formDate: null },
  "the 15th": { card: false, formDate: null },
  "oct 15": { card: true, formDate: null },
  today: { card: true, formDate: null },
};

describe(`${DA_FLAG} off: as main`, () => {
  beforeEach(() => useProduction(false));

  for (const [between, expected] of [[false, MAIN], [true, MAIN_AFTER_A_TURN]] as const) {
    it.each(Object.keys(expected))(`${between ? "after a turn, " : ""}%s`, async (reply) => {
      const { proposal } = await answered([T1, ...(between ? [T2] : []), reply], false);
      expect({ card: proposal !== null, formDate: proposal?.formDate ?? null }).toEqual(expected[reply]);
    });
  }

  it('"10/5 and 10/15" straight after the question dates the form with the last one', async () => {
    const { proposal } = await answered([T1, "10/5 and 10/15"], false);
    expect(proposal?.formDate).toBe("2026-10-15");
  });

  it('after a turn, "most recent" is read as the employee and Create on the earlier card is refused', async () => {
    await expect(answered([T1, T2, "most recent"])).rejects.toThrow(
      "This proposal is out of date: the conversation now says the form is for most recent, not Quinn Marlowe. Use the newest proposal.",
    );
  });

  it("BT4: the question is asked once and \"10-15\" after two other answers leaves the form undated", async () => {
    const thread = new Thread();
    const asked: boolean[] = [];
    let last: Answer | null = null;
    for (const turn of BT4) {
      last = await thread.say(turn);
      asked.push(/Which date goes on the form\?/.test(last.content));
    }
    expect(asked).toEqual([true, false, false, false]);
    expect(last!.formProposal?.formDate ?? null).toBeNull();
  });

  it("the flag reads off by default", async () => {
    const { dateAnswerAppliedEnabled } = await import("@/lib/config/chat-quality-flags");
    expect(dateAnswerAppliedEnabled()).toBe(false);
  });
});
