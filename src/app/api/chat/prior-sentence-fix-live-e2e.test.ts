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
 * PRIOR_SENTENCE_FIX_ENABLED IN THIS APP'S PRODUCTION ENV (PORTED, 26 OCT 2026)
 * ============================================================================
 *
 * Ported from the sibling app (its QA-6/QA-7 turns, word for word, with this
 * file's invented name, Quinn Marlowe). Here, on main with this app's
 * production flags (pinned below, flag off):
 *
 *   D1 "ca for quinn marlowe, coached her 10-16, written warning on 10-20"
 *      → dated 10/20, the prior written warning's, Issue "coached her 10-16".
 *   D2 "create a ca for quinn marlowe at kearney, she was late on 10-5 and
 *       10-15. i coached her on 10-16 about being late"
 *      → dated 10/16, the coaching's, with the coaching in the Issue.
 *   "i coached her on 10-16 and <another name> on 10-17" dated the form with
 *   the other person's 10/17, and "i coached her coworker, not her, on 10-16"
 *   dated it 10/16. A Coaching Form "create a coaching form for … i coached
 *   her on 10-16" is dated 10/16 — the flag must leave it so.
 *
 * Coordinator's ruling (PRIOR_SENTENCE_FIX_ENABLED, Corrective Action only):
 * two incident dates are asked ONCE ("Which date goes on the form?"), both
 * stay in the Issue, and the form is dated the day it is created until the
 * manager answers; the answer sets it; an earlier step's or another person's
 * date is never an incident date; a range is one incident dated its first
 * day; one date asks nothing.
 *
 * Every turn through POST /api/chat, and Create through the draft route, in
 * this app's production env (the full remap off) and again with the full
 * remap on. FORM_DATE_INCIDENT_ONLY_ENABLED is pinned (unset, and a run with
 * it on). Flag off, each case reads as main does today. "Corvin Mallow" is
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
 * INTENT_EXTRACTION is set by `INTENT_EXTRACTION_IN_PRODUCTION` below.
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


/*
 * INTENT_EXTRACTION_ENABLED is 0 in this app's production (QA read it
 * decrypted on Vercel, 26 Oct 2026): the card shows on the first turn.
 */
const INTENT_EXTRACTION_IN_PRODUCTION = false;

function useProfile(fix: boolean, fio = false, remap = false) {
  for (const name of ALL_FLAGS) delete process.env[name];
  for (const name of PRODUCTION) process.env[name] = "true";
  if (INTENT_EXTRACTION_IN_PRODUCTION) process.env.INTENT_EXTRACTION_ENABLED = "true";
  if (remap) for (const name of REMAP_EXTRA) process.env[name] = "true";
  if (fix) process.env[FLAG] = "true";
  if (fio) process.env[FIO] = "true";
}

const SAID = {
  D1: "ca for quinn marlowe, coached her 10-16, written warning on 10-20",
  D2: "create a ca for quinn marlowe at kearney, she was late on 10-5 and 10-15. i coached her on 10-16 about being late",
  TWO: "create a ca for quinn marlowe at kearney, she was late on 10-5 and 10-15",
  THREE: "create a ca for quinn marlowe at kearney, she was late 10/5, 10/15 and 10/16",
  RANGE: "create a ca for quinn marlowe at kearney, she was late from 10-5 to 10-9",
  ONE: "create a ca for quinn marlowe at kearney, she was late on 10-5",
  OTHER_IN_LIST: "create a ca for quinn marlowe at kearney, she was late on 10-5. i coached her on 10-16 and corvin mallow on 10-17",
  COWORKER: "create a ca for quinn marlowe at kearney, she was late on 10-5. i coached her coworker, not her, on 10-16",
  HISTORY:
    "My employee quinn marlowe has was 10 minutes late on her last two shifts. On the first shift I verbally coached her on our policy and expectations. Then she was late again. Please create a CA form so I can document. She was late on 10/5 and 10/15",
  COACHING_FORM: "create a coaching form for quinn marlowe at kearney, i coached her on 10-16",
} as const;

/** Sentence case: each sentence opens with a capital, and "i" is "I". */
function sentenceCase(text: string): string {
  return text.replace(/(^|[.!?]\s+)([a-z])/g, (_, lead: string, letter: string) => `${lead}${letter.toUpperCase()}`).replace(/\bi\b/g, "I");
}

const CASINGS = [
  ["lowercase", (text: string) => text],
  ["Sentence case", sentenceCase],
  ["CAPS", (text: string) => text.toUpperCase()],
] as const;

const FIO_RUNS = [
  ["D3 unset", false],
  ["D3 on", true],
] as const;

const ASKS = /Which date goes on the form\?/;
const asksAbout = (dates: readonly string[]) =>
  new RegExp(String.raw`You mentioned more than one date \(${dates.map((day) => `\\*\\*${day.replace("/", "\\/")}\\*\\*`).join(", ")}\)\. Which date goes on the form\?`);

/** The card's "Prior actions" line, without its confirmation; the Observation line. */
function priorLine(content: string): string | null {
  const line = /\*\*Prior actions:\*\*\s*([^\n]+)/.exec(content)?.[1];
  return line ? line.replace(/, as you said\b.*$/, "") : null;
}
/** This app's card reads the incident back as "Issue" (`correctiveActionIssue`). */
function observation(content: string): string {
  return /\*\*Issue:\*\*\s*([^·\n]*)/.exec(content)?.[1]?.trim() ?? "";
}

async function card(said: string) {
  const thread = new Thread();
  const answer = await thread.say(said);
  return { thread, answer, proposal: answer.formProposal ?? null };
}

const MODEL_OBSERVATION =
  "Observed: Quinn Marlowe arrived late on October 5, 2026, and again on October 15, 2026. Quinn Marlowe was coached about being late on October 16, 2026.";

/** Create, as the browser does it. A remap card names the manager's turns only with REMAP_DRAFT_SOURCES_ENABLED. */
function draftSources() {
  process.env.REMAP_DRAFT_SOURCES_ENABLED = "true";
  process.env.NEXT_PUBLIC_REMAP_DRAFT_SOURCES_ENABLED = "true";
}

async function created(thread: Thread, observationText: string) {
  state.draft = { values: { observation: observationText, prior_actions: "" } };
  const id = await thread.create();
  const value = (key: string) =>
    (store.form_instance_values.find((row) => row.instance_id === id && row.field_key === key)?.value as string | undefined) ?? null;
  return { observation: value("observation"), priorActions: value("prior_actions"), formDate: value("form_date") };
}

/*
 * ============================================================================
 * PRODUCTION: this app's env (the full remap off), and the remap on
 * ============================================================================
 */
const REMAP_RUNS = [
  ["full remap off (production)", false],
  ["full remap on (not production, extra coverage)", true],
] as const;

describe.each(REMAP_RUNS)("%s", (_remapLabel, remap) => {
describe.each(FIO_RUNS)("production env, flag on, %s", (_fioLabel, fio) => {
  beforeEach(() => useProfile(true, fio, remap));

  describe.each(CASINGS)("%s", (casing, cased) => {
    it("D1: undated (never 10/20 or 10/16), both priors listed, no prior clause as the Observation; the draft too", async () => {
      const { thread, answer, proposal } = await card(cased(SAID.D1));
      expect(proposal?.templateKey).toBe("dpoa");
      expect(proposal?.formDate ?? null).toBeNull();
      expect(answer.content).not.toMatch(/\*\*Date:\*\*/);
      expect(priorLine(answer.content)).toBe("Coaching — 10/16/2026; Written warning — 10/20/2026");
      expect(observation(answer.content)).not.toMatch(/coach|written warning/i);
      const draft = await created(thread, "Observed: Quinn Marlowe has prior coaching and a written warning on file.");
      expect(draft.formDate).toBe(TODAY);
      expect(draft.priorActions).toBe("Coaching — 10/16/2026\nWritten warning — 10/20/2026");
      expect(draft.observation ?? "").not.toMatch(/coached her/i);
    });

    it("D2: asks once about 10/5 and 10/15, both stay in the Observation, the coaching is the prior row", async () => {
      const { answer, proposal } = await card(cased(SAID.D2));
      expect(proposal?.formDate ?? null).toBeNull();
      expect(answer.content).toMatch(asksAbout(["10/5", "10/15"]));
      expect(observation(answer.content)).toMatch(/she was late on 10-5 and 10-15/i);
      expect(observation(answer.content)).not.toMatch(/coach/i);
      expect(priorLine(answer.content)?.toLowerCase()).toBe("coaching about being late — 10/16/2026");
    });

    it("\"late on 10-5 and 10-15\" asks and keeps both dates; \"late 10/5, 10/15 and 10/16\" asks about all three", async () => {
      const two = await card(cased(SAID.TWO));
      expect(two.proposal?.formDate ?? null).toBeNull();
      expect(two.answer.content).toMatch(asksAbout(["10/5", "10/15"]));
      expect(observation(two.answer.content)).toMatch(/she was late on 10-5 and 10-15/i);
      const three = await card(cased(SAID.THREE));
      expect(three.proposal?.formDate ?? null).toBeNull();
      expect(three.answer.content).toMatch(asksAbout(["10/5", "10/15", "10/16"]));
    });

    it("a range is one incident dated its first day, and a single date asks nothing; the incident clause stays", async () => {
      const range = await card(cased(SAID.RANGE));
      expect(range.proposal?.formDate).toBe("2026-10-05");
      expect(range.answer.content).not.toMatch(ASKS);
      expect(observation(range.answer.content)).toMatch(/she was late from 10-5 to 10-9/i);
      const one = await card(cased(SAID.ONE));
      expect(one.proposal?.formDate).toBe("2026-10-05");
      expect(one.answer.content).not.toMatch(ASKS);
      expect(observation(one.answer.content)).toMatch(/she was late on 10-5/i);
    });

    it("the answer sets the date, and the draft then carries it with every date the manager gave", async () => {
      draftSources();
      const { thread } = await card(cased(SAID.D2));
      const answered = await thread.say(cased("10/15"));
      expect(answered.formProposal?.formDate).toBe("2026-10-15");
      expect(answered.content).not.toMatch(ASKS);
      const draft = await created(thread, MODEL_OBSERVATION);
      expect(draft.formDate).toBe("2026-10-15");
      expect(draft.observation).toContain("on October 5, 2026, and again on October 15, 2026.");
      // QA, 26 Oct 2026: the old port left a dangling "and again." with the second date cut.
      expect(draft.observation).not.toMatch(/and again\.(?:\s|$)/);
      expect(draft.observation).toContain("coached about being late on October 16, 2026.");
      expect(draft.priorActions?.toLowerCase()).toBe("coaching about being late — 10/16/2026");
    });

    it("before the answer the draft is dated today, and a coaching put on a lateness date gets the manager's 10/16", async () => {
      draftSources();
      const { thread } = await card(cased(SAID.D2));
      const draft = await created(thread, MODEL_OBSERVATION.replace("October 16", "October 5"));
      expect(draft.formDate).toBe(TODAY);
      expect(draft.observation).toContain("on October 5, 2026, and again on October 15, 2026.");
      expect(draft.observation).toContain("coached about being late on October 16, 2026.");
    });

    it("QA-7 defect 1: another person in the same list is never Quinn's prior or a date", async () => {
      const { thread, answer, proposal } = await card(cased(SAID.OTHER_IN_LIST));
      expect(priorLine(answer.content)).toBe("Coaching — 10/16/2026");
      expect(proposal?.formDate).toBe("2026-10-05");
      expect(answer.content).not.toMatch(ASKS);
      // In capitals the create route reads "CORVIN MALLOW" as a second person and asks which (as on main); the card is pinned.
      if (casing === "CAPS") return;
      const draft = await created(thread, "Observed: Quinn Marlowe arrived late on October 5, 2026.");
      expect(draft.priorActions).toBe("Coaching — 10/16/2026");
    });

    it("QA-7 defect 2: \"i coached her coworker, not her, on 10-16\" is no prior of Quinn's", async () => {
      const { thread, answer } = await card(cased(SAID.COWORKER));
      expect(priorLine(answer.content)).toBeNull();
      const draft = await created(thread, "Observed: Quinn Marlowe arrived late on October 5, 2026.");
      expect(draft.priorActions ?? null).toBeNull();
    });

    it("a Coaching Form is dated by the coaching held, 10/16, on the card and the draft", async () => {
      const { thread, answer, proposal } = await card(cased(SAID.COACHING_FORM));
      expect(proposal?.templateKey).toBe("coaching");
      expect(proposal?.formDate).toBe("2026-10-16");
      // This app's Coaching Form card has no "**Date:**" line; the proposal's date is what Create files.
      expect(answer.content).not.toMatch(ASKS);
      const draft = await created(thread, "Observed: Quinn Marlowe was coached.");
      expect(draft.formDate).toBe("2026-10-16");
    });
  });
});

});

/*
 * QA's wording from this app's own history (26 Oct 2026, the name invented):
 * both late dates stay, the form asks which one dates it, and the coaching
 * sentence is never the Issue. The coaching here has no date, so no Prior
 * actions row is written for it with the flag on or off (an undated step is
 * outside this flag; reported to QA).
 */
describe.each(REMAP_RUNS)("%s: QA's history wording", (_remapLabel, remap) => {
  describe.each(CASINGS.filter(([casing]) => casing !== "CAPS"))("%s", (_casing, cased) => {
    it("keeps both late dates, asks once, and the draft keeps both", async () => {
      useProfile(true, false, remap);
      draftSources();
      const { thread, answer, proposal } = await card(cased(SAID.HISTORY));
      expect(proposal?.templateKey).toBe("dpoa");
      expect(proposal?.formDate ?? null).toBeNull();
      expect(answer.content).toMatch(asksAbout(["10/5", "10/15"]));
      expect(observation(answer.content)).not.toMatch(/coach/i);
      const draft = await created(
        thread,
        "Observed: Quinn Marlowe arrived late on October 5, 2026, and again on October 15, 2026.",
      );
      expect(draft.formDate).toBe(TODAY);
      expect(draft.observation).toContain("on October 5, 2026, and again on October 15, 2026.");
      expect(draft.observation).not.toMatch(/and again\.(?:\s|$)/);
    });
  });
});

/*
 * NEVER-BREAK: with the flag off, each case reads exactly as this app's
 * production does today (main 9016e3d9, this env), the failures pinned: D1
 * dated the written warning's 10/20 with "coached her 10-16" as the Issue,
 * D2 dated the coaching's 10/16, the other person's coaching dating the form.
 * The full remap on reads the same here.
 */
const PROD_MAIN: Record<string, Record<string, unknown>> = {
  D1: { formDate: "2026-10-20", observation: "coached her 10-16", priorLine: null, asks: false },
  D2: { formDate: "2026-10-16", observation: "create a ca for Quinn Marlowe at kearney, she was late on 10-5 and 10-15. i coached her on 10-16 about being late", priorLine: null, asks: false },
  TWO: { formDate: "2026-10-05", observation: "create a ca for Quinn Marlowe at kearney, she was late on 10-5 and 10-15", priorLine: null, asks: false },
  THREE: { formDate: null, observation: "create a ca for Quinn Marlowe at kearney, she was late 10/5, 10/15 and 10/16", priorLine: null, asks: true },
  RANGE: { formDate: null, observation: "create a ca for Quinn Marlowe at kearney, she was late from 10-5 to 10-9", priorLine: null, asks: false },
  ONE: { formDate: "2026-10-05", observation: "create a ca for Quinn Marlowe at kearney, she was late on 10-5", priorLine: null, asks: false },
  OTHER_IN_LIST: { formDate: "2026-10-17", observation: "create a ca for Quinn Marlowe at kearney, she was late on 10-5", priorLine: null, asks: false },
  COWORKER: { formDate: "2026-10-16", observation: "create a ca for Quinn Marlowe at kearney, she was late on 10-5", priorLine: null, asks: false },
  COACHING_FORM: { formDate: "2026-10-16", observation: "", priorLine: null, asks: false },
};
/** Where D3 (FORM_DATE_INCIDENT_ONLY_ENABLED) on changes it. */
const PROD_FIO_MAIN: Record<string, Record<string, unknown>> = {
  TWO: { formDate: "2026-10-15", observation: "create a ca for Quinn Marlowe at kearney, she was late on 10-5 and 10-15", priorLine: null, asks: false },
};

describe.each(REMAP_RUNS)("%s", (_remapLabel, remap) => {
  describe.each(FIO_RUNS)("production env, flag off, %s: as main", (_fioLabel, fio) => {
    beforeEach(() => useProfile(false, fio, remap));

    it.each(Object.entries(PROD_MAIN))("%s", async (key, expected) => {
      const { answer, proposal } = await card(SAID[key as keyof typeof SAID]);
      expect({
        formDate: proposal?.formDate ?? null,
        observation: observation(answer.content),
        priorLine: priorLine(answer.content),
        asks: ASKS.test(answer.content),
      }).toEqual(fio && PROD_FIO_MAIN[key] ? PROD_FIO_MAIN[key] : expected);
    });
  });
});
