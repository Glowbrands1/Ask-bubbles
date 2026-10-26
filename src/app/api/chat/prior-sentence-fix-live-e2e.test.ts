import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { continuationFor } from "@/lib/forms/proposal-continuation";
import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { ChatFormProposal, ChatMessage } from "@/types";

/**
 * ============================================================================
 * QA-6 / QA-7, 26 OCT 2026 — PRIOR SENTENCES AND TWO INCIDENT DATES, ON THE
 * LIVE PATH (THE FULL REMAP)
 * ============================================================================
 *
 * Ported from the sibling app: QA-6 re-ran PRIOR_SENTENCE_FIX there with the
 * full production env (FORM_FULL_REMAP on) through POST /api/chat, card and
 * created draft; QA-7 probed this app at cba3ec31 the same way. QA's turns,
 * word for word, with this file's invented name (Rory Vance) for theirs and
 * this app's store wording:
 *
 *   D1 "ca for rory vance, coached her 10-16, written warning on 10-20"
 *      → dated a prior's date (see MAIN), What happened "written warning".
 *   D2 "create a ca for rory vance at omaha ne, she was late on 10-5 and 10-15.
 *       i coached her on 10-16 about being late"
 *      → dated one of the two lateness dates without asking (here, as main
 *        reads it today: see MAIN), What happened missing a date.
 *
 * QA-7: "i coached her on 10-16 and <another name> on 10-17" listed the other
 * person's 10/17 as Rory's prior, and "i coached her coworker, not her, on
 * 10-16" gave Rory a prior.
 *
 * Coordinator's ruling (PRIOR_SENTENCE_FIX_ENABLED, both apps): two incident
 * dates are asked ONCE ("Which date goes on the form?"), both stay in What
 * happened, and the form is dated the day it is created until the manager
 * answers; the answer sets it; "change the date to …" still works; an earlier
 * step's date is never an incident date; a range ("from 10-5 to 10-9") is one
 * incident dated its first day; one date asks nothing.
 *
 * Every turn through POST /api/chat, and Create through the draft route, with
 * the production env below; FORM_DATE_INCIDENT_ONLY_ENABLED pinned (unset, and
 * an extra run with it on). Flag off, each case reads as production does
 * today. "Corvin Mallow" is invented.
 */

const store: FakeStore & Record<string, Record<string, unknown>[]> = {
  form_instances: [],
  form_instance_values: [],
  form_instance_events: [],
  form_template_versions: [],
  form_templates: [],
  form_template_current: [],
  form_template_assets: [],
  chat_traces: [],
  chat_form_state: [],
} as unknown as FakeStore & Record<string, Record<string, unknown>[]>;

const state = vi.hoisted(() => ({
  /** The extraction model's reading for the turn. Production's readings were not recorded. */
  remap: {} as Record<string, unknown>,
  draft: {} as { values?: Record<string, unknown>; checked?: Record<string, unknown> },
  revision: {} as { values?: Record<string, unknown>; checked?: Record<string, unknown>; clear?: string[] },
}));

vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin: () => fakeSupabase(store) }));
vi.mock("@/lib/api/respond", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/respond")>();
  return { ...actual, assertLiveMode: () => {}, assertNoConfigurationProblems: () => {}, assertWithinRateLimit: () => {} };
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

/** The form the latest manager turn names, as the extraction model copies it. */
function namedForm(text: string): string | null {
  if (/follow-?up coaching/i.test(text)) return "follow-up-coaching";
  if (/coaching/i.test(text)) return "coaching";
  if (/\b(?:ca|corrective action)\b/i.test(text)) return "dpoa";
  return null;
}

vi.mock("@/lib/ai/call-claude", () => ({
  callClaude: async () => "A grounded answer.",
  callClaudeTool: async () => null,
  callClaudeToolDetailed: async (input: { messages?: { content?: unknown }[] }) => {
    const text = JSON.stringify(input.messages ?? []);
    const last = text.split(/Manager:|User:/i).pop() ?? text;
    return {
      input: { templateKey: namedForm(last), employeeName: null, observation: null, actionPlan: null, ...state.remap },
      inputTokens: 1,
      outputTokens: 1,
    };
  },
}));
vi.mock("@/lib/ai/anthropic", () => ({
  getAnthropicClient: () => ({
    messages: {
      create: async (request: { tool_choice?: { name?: string } }) => {
        const revising = request.tool_choice?.name === "revise_form_fields";
        return {
          stop_reason: "tool_use",
          content: [
            { type: "tool_use", name: revising ? "revise_form_fields" : "write_form_fields", input: revising ? state.revision : state.draft },
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
          ok: true as const,
          documentId: "doc-jba",
          documentTitle: "2025 JBA Policy Manual - Edited 5-2025",
          documentCategory: "policies_compliance",
          matchedBy: "fallback" as const,
          ownerConfirmed: true,
          chunks: (rows.chunks as Parameters<typeof manualChunkFromRow>[0][]).map(manualChunkFromRow),
        };
      }
    },
  };
});
vi.mock("@/lib/knowledge", () => ({
  getKnowledgeProvider: () => {
    throw new Error("not on the server");
  },
}));
vi.mock("@/lib/reporting/read/report-briefing", () => ({ loadReportBriefing: async () => null }));
vi.mock("@/lib/reporting/read/employee-facts", () => ({
  loadEmployeeFacts: async () => null,
  NO_EMPLOYEE_DATA_REASON: "no dataset",
  NO_EMPLOYEE_DATASET_REASON: "no dataset",
  EMPLOYEE_DATA_HEADING: "CURRENT EMPLOYEE PERFORMANCE DATA",
}));
vi.mock("@/lib/forms/prior-forms", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/forms/prior-forms")>()),
  priorFormsReadingForChat: async () => ({ attach: [], possible: [], identity: "none" }),
}));

process.env.NEXT_PUBLIC_DEMO_MODE = "false";
vi.setConfig({ hookTimeout: 30_000, testTimeout: 60_000 });

const { ensureTemplateLibrary } = await import("@/lib/forms/repository");
const { createInlineForm } = await import("@/features/chat/create-inline-form");
const chatRoute = await import("./route");
const instancesRoute = await import("../forms/instances/route");
const draftRoute = await import("../forms/instances/[id]/draft/route");

/**
 * The production env QA-6/QA-7 run (coordinator, 26 Oct 2026), on this app's
 * form path: the full remap with the flags on with it here, and intent
 * extraction off, as this app's production runs (`edits-dates-replay-e2e`).
 */
const PROD_FLAGS = [
  "FORM_FULL_REMAP_ENABLED",
  "KEEP_FORM_EMPLOYEE_ENABLED",
  "DRAFT_ACTIONS_ENABLED",
  "CONVERSATION_DRAFT_REUSE_ENABLED",
  "WARNING_LEVEL_MANAGER_ONLY_ENABLED",
  "LATE_OPEN_DATE_ENABLED",
  "PRIOR_ACTIONS_PARSE_ENABLED",
  "FIELD_ACCURACY_ENABLED",
  "REMAP_INCIDENT_FIX_ENABLED",
  "NOT_A_NAME_GUARD_ENABLED",
  "MANAGER_WORDS_ONLY_ENABLED",
  "SLOT_RETENTION_ENABLED",
  "TYPED_NAME_PROCEEDS_ENABLED",
  "EXIT_INTAKE_FIX_ENABLED",
  "REOPEN_VERB_GUARD_ENABLED",
  "PLACE_SPAN_GUARD_ENABLED",
  "STATE_CODE_NOT_A_PERSON_ENABLED",
] as const;
const FLAG = "PRIOR_SENTENCE_FIX_ENABLED";
/**
 * FORM_DATE_INCIDENT_ONLY_ENABLED (D3, on main since 5e151777, off in
 * production) is pinned by each case, never read from the shell. Unset
 * everywhere except the "D3 on" runs.
 */
const FIO = "FORM_DATE_INCIDENT_ONLY_ENABLED";
const TODAY = "2026-10-26";
const saved = new Map<string, string | undefined>();

function joinOverview() {
  for (const row of store.form_instances ?? []) {
    const template = store.form_templates!.find((entry) => entry.id === row.template_id);
    const version = store.form_template_versions.find((entry) => entry.id === row.template_version_id);
    Object.assign(row, {
      form_date: row.form_date ?? TODAY,
      template_key: template?.key,
      template_name: template?.name,
      layout_family: template?.layout_family,
      template_version: version?.version,
    });
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
  for (const key of Object.keys(store)) (store as Record<string, unknown[]>)[key] = [];
  store.form_instances = new JoiningRows() as never;
  for (const name of [...PROD_FLAGS, FLAG, "INTENT_EXTRACTION_ENABLED", "REMAP_INCIDENT_FIX_ENABLED", "MANAGER_WORDS_ONLY_ENABLED", "REMAP_DRAFT_SOURCES_ENABLED", "NEXT_PUBLIC_REMAP_DRAFT_SOURCES_ENABLED", FIO]) {
    saved.set(name, process.env[name]);
  }
  state.remap = {};
  state.draft = { values: {} };
  state.revision = { values: {} };
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T15:00:00Z`));
  await ensureTemplateLibrary("system");
});

afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  vi.useRealTimers();
});

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const request = new Request(`https://app.test${url}`, init);
  const draft = /^\/api\/forms\/instances\/([^/]+)\/draft$/.exec(url);
  const response = draft
    ? await draftRoute.POST(request, { params: Promise.resolve({ id: draft[1]! }) })
    : url === "/api/forms/instances"
      ? await instancesRoute.POST(request)
      : null;
  if (!response) throw new Error(`no route for ${url}`);
  joinOverview();
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body;
}

function toUuid(id: string): string {
  if (/^[0-9a-f-]{36}$/.test(id)) return id;
  const uuid = randomUUID();
  for (const table of ["form_instances", "form_instance_values", "form_instance_events"] as const) {
    for (const row of store[table]) {
      if (row.id === id) row.id = uuid;
      if (row.instance_id === id) row.instance_id = uuid;
      if (row.revises_instance_id === id) row.revises_instance_id = uuid;
    }
  }
  return uuid;
}

type Answer = {
  content: string;
  formProposal?: ChatFormProposal;
  formOpened?: { instanceId: string; templateName: string; revisesInstanceId: string | null };
};

let threads = 0;

class Thread {
  readonly messages: ChatMessage[] = [];
  readonly conversationId = `conv_${Date.now().toString(36)}${(threads += 1).toString(36).padStart(4, "0")}`;
  instanceId: string | null = null;
  private sequence = 0;

  async say(question: string, remap: Record<string, unknown> = READING, recorded?: string): Promise<Answer> {
    state.remap = remap;
    const history = this.messages.map(({ id, role, content, formProposal }) => ({ id, role, content, ...(formProposal ? { formProposal } : {}) }));
    const continuation = this.instanceId ? null : continuationFor(this.messages);
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
          ...(continuation ? { continueProposalTemplateKey: continuation.templateKey } : {}),
          ...(this.instanceId ? { activeFormInstanceId: this.instanceId } : {}),
        }),
      }),
    );
    const payload = (await response.json()) as Answer & { error?: string };
    expect(response.status, JSON.stringify(payload)).toBe(200);
    /* Production reads the last turn's remap slots back from chat_traces; the harness writes that row. */
    if (payload.formProposal) {
      store.chat_traces.push({
        user_id: "qa-manager",
        conversation_id: this.conversationId,
        created_at: `${TODAY}T15:00:${String(this.sequence).padStart(2, "0")}Z`,
        slots: { templateKey: payload.formProposal.templateKey, employeeName: payload.formProposal.employeeName },
      });
    }
    this.messages.push(
      { id, role: "user", content: question, createdAt: `${TODAY}T15:00:00Z` } as ChatMessage,
      {
        id: `a${this.sequence}`,
        role: "assistant",
        content: recorded ?? payload.content,
        createdAt: `${TODAY}T15:00:01Z`,
        ...(payload.formProposal ? { formProposal: payload.formProposal } : {}),
      } as ChatMessage,
    );
    if (payload.formOpened) {
      payload.formOpened.instanceId = toUuid(payload.formOpened.instanceId);
      this.instanceId = payload.formOpened.instanceId;
    }
    return payload;
  }

  get proposal(): ChatFormProposal | null {
    for (let index = this.messages.length - 1; index >= 0; index -= 1) {
      const proposal = this.messages[index]!.formProposal;
      if (proposal) return proposal;
    }
    return null;
  }

  async create() {
    expect(this.proposal, "no card to create from").not.toBeNull();
    const result = await createInlineForm({ proposal: this.proposal!, messages: this.messages, call, onCreated: () => {} });
    this.instanceId = toUuid(result.reference.instanceId);
    return this.instanceId;
  }
}

/** The extraction model's reading: the employee typed, nothing else guessed. */
const READING = { employeeName: "Rory Vance" };

function useProfile(fix: boolean, fio = false) {
  for (const name of saved.keys()) delete process.env[name];
  for (const name of PROD_FLAGS) process.env[name] = "true";
  if (fix) process.env[FLAG] = "true";
  if (fio) process.env[FIO] = "true";
}

const SAID = {
  D1: "ca for rory vance, coached her 10-16, written warning on 10-20",
  D2: "create a ca for rory vance at omaha ne, she was late on 10-5 and 10-15. i coached her on 10-16 about being late",
  TWO: "create a ca for rory vance at omaha ne, she was late on 10-5 and 10-15",
  THREE: "create a ca for rory vance at omaha ne, she was late 10/5, 10/15 and 10/16",
  RANGE: "create a ca for rory vance at omaha ne, she was late from 10-5 to 10-9",
  ONE: "create a ca for rory vance at omaha ne, she was late on 10-5",
  OTHER_IN_LIST: "create a ca for rory vance at omaha ne, she was late on 10-5. i coached her on 10-16 and corvin mallow on 10-17",
  COWORKER: "create a ca for rory vance at omaha ne, she was late on 10-5. i coached her coworker, not her, on 10-16",
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

async function card(said: string) {
  const thread = new Thread();
  const answer = await thread.say(said);
  return { thread, answer, proposal: answer.formProposal ?? null };
}

const MODEL_OBSERVATION =
  "Observed: Rory Vance arrived late on October 5, 2026, and again on October 15, 2026. Rory Vance was coached about being late on October 16, 2026.";

/**
 * Create, as the browser does it. A remap card names the manager's turns only
 * with REMAP_DRAFT_SOURCES_ENABLED (production drafts from those turns, as
 * QA-6's saved drafts show), so `draftSources()` turns it on before the turns
 * of each draft case, on both sides of the flag.
 */
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

describe.each(FIO_RUNS)("flag on, %s", (_fioLabel, fio) => {
  beforeEach(() => useProfile(true, fio));

  describe.each(CASINGS)("%s", (_casing, cased) => {
    it("D1: never dated 10/20 or 10/16; \"written warning\" is not What happened; both priors listed", async () => {
      const { answer, proposal } = await card(cased(SAID.D1));
      expect(proposal?.templateKey).toBe("dpoa");
      expect(proposal?.formDate ?? null).toBeNull();
      expect(answer.content).not.toMatch(/\*\*Date:\*\*/);
      expect(proposal?.issue ?? "").not.toMatch(/written warning|coach/i);
      expect(proposal?.priorActions).toBe("Coaching — 10/16/2026\nWritten warning — 10/20/2026");
    });

    it("D2: asks once which of 10/5 and 10/15, both stay in What happened, the coaching is the prior action", async () => {
      const { answer, proposal } = await card(cased(SAID.D2));
      expect(proposal?.formDate ?? null).toBeNull();
      expect(answer.content).toMatch(asksAbout(["10/5", "10/15"]));
      expect(proposal?.issue ?? "").toMatch(/late on 10-5 and 10-15/i);
      // The manager's words, as typed: "about being late" in their casing.
      expect(proposal?.priorActions?.toLowerCase()).toBe("coaching about being late — 10/16/2026");
    });

    it("\"late on 10-5 and 10-15\" asks, and keeps both dates", async () => {
      const { answer, proposal } = await card(cased(SAID.TWO));
      expect(proposal?.formDate ?? null).toBeNull();
      expect(answer.content).toMatch(asksAbout(["10/5", "10/15"]));
      expect(proposal?.issue ?? "").toMatch(/late on 10-5 and 10-15/i);
    });

    it("\"late 10/5, 10/15 and 10/16\" asks, and keeps all three dates", async () => {
      const { answer, proposal } = await card(cased(SAID.THREE));
      expect(proposal?.formDate ?? null).toBeNull();
      expect(answer.content).toMatch(asksAbout(["10/5", "10/15", "10/16"]));
      expect(proposal?.issue ?? "").toMatch(/late 10\/5, 10\/15 and 10\/16/i);
    });

    it("\"from 10-5 to 10-9\" is one incident: no question, dated its first day, the range kept", async () => {
      const { answer, proposal } = await card(cased(SAID.RANGE));
      expect(proposal?.formDate).toBe("2026-10-05");
      expect(answer.content).not.toMatch(ASKS);
      expect(proposal?.issue ?? "").toMatch(/late from 10-5 to 10-9/i);
    });

    it("a single date asks nothing", async () => {
      const { answer, proposal } = await card(cased(SAID.ONE));
      expect(proposal?.formDate).toBe("2026-10-05");
      expect(answer.content).not.toMatch(ASKS);
    });

    it("the answer sets the date, the question is not asked again, and \"change the date to …\" still works", async () => {
      const { thread } = await card(cased(SAID.D2));
      const answered = await thread.say(cased("10/15"));
      expect(answered.formProposal?.formDate).toBe("2026-10-15");
      expect(answered.content).not.toMatch(ASKS);
      expect(answered.formProposal?.issue ?? "").toMatch(/late on 10-5 and 10-15/i);
      const changed = await thread.say(cased("change the date to 10-20"));
      expect(changed.formProposal?.formDate).toBe("2026-10-20");
      expect(changed.content).not.toMatch(ASKS);
    });

    it.each([
      ["most recent", "2026-10-15"],
      ["the first one", "2026-10-05"],
    ] as const)("the answer \"%s\" sets the date", async (reply, iso) => {
      const { thread } = await card(cased(SAID.TWO));
      const answered = await thread.say(cased(reply));
      expect(answered.formProposal?.formDate).toBe(iso);
    });

    it("QA-7: another person in the same list stays off Rory's priors", async () => {
      draftSources();
      const { thread, proposal } = await card(cased(SAID.OTHER_IN_LIST));
      expect(proposal?.priorActions).toBe("Coaching — 10/16/2026");
      expect(proposal?.formDate).toBe("2026-10-05");
      // In capitals the create route may read "CORVIN MALLOW" as a second person and ask which (as on main); the card is pinned.
      if (_casing === "CAPS") return;
      const draft = await created(thread, "Observed: Rory Vance arrived late on October 5, 2026.");
      expect(draft.priorActions).toBe("Coaching — 10/16/2026");
    });

    it("QA-7: \"i coached her coworker, not her, on 10-16\" is no prior of Rory's", async () => {
      draftSources();
      const { thread, proposal } = await card(cased(SAID.COWORKER));
      expect(proposal?.priorActions ?? null).toBeNull();
      const draft = await created(thread, "Observed: Rory Vance arrived late on October 5, 2026.");
      expect(draft.priorActions ?? null).toBeNull();
    });

    it("the created draft from D2, once answered: card Date = draft Date, both lateness dates and the coaching's 10/16 kept, the coaching the prior action", async () => {
      draftSources();
      const { thread } = await card(cased(SAID.D2));
      const answered = await thread.say(cased("10/15"));
      const draft = await created(thread, MODEL_OBSERVATION);
      expect(draft.formDate).toBe(answered.formProposal?.formDate);
      expect(draft.formDate).toBe("2026-10-15");
      expect(draft.observation).toContain("on October 5, 2026, and again on October 15, 2026.");
      expect(draft.observation).toContain("coached about being late on October 16, 2026.");
      expect(draft.priorActions?.toLowerCase()).toBe("coaching about being late — 10/16/2026");
    });

    it("the created draft from D2, before the answer, is dated today and keeps every date", async () => {
      draftSources();
      const { thread } = await card(cased(SAID.D2));
      const draft = await created(thread, MODEL_OBSERVATION.replace("October 16", "October 5"));
      expect(draft.formDate).toBe(TODAY);
      expect(draft.observation).toContain("on October 5, 2026, and again on October 15, 2026.");
      // A coaching put on a lateness date gets the manager's 10/16.
      expect(draft.observation).toContain("coached about being late on October 16, 2026.");
    });

    it("the created draft from D1: dated today, both priors listed", async () => {
      draftSources();
      const { thread } = await card(cased(SAID.D1));
      const draft = await created(thread, "Observed: Rory Vance has prior coaching and a written warning on file.");
      expect(draft.formDate).toBe(TODAY);
      expect(draft.priorActions).toBe("Coaching — 10/16/2026\nWritten warning — 10/20/2026");
    });
  });
});

/** Production today (main 5e151777, flag off, D3 unset), the live failures pinned. */
const MAIN: Record<string, { formDate: string | null; issue: string | null; priorActions: string | null }> = {
  D1: { formDate: "2026-10-20", issue: "written warning", priorActions: null },
  D2: { formDate: "2026-10-16", issue: "late on 10-5 and", priorActions: null },
  TWO: { formDate: "2026-10-15", issue: "late on 10-5 and", priorActions: null },
  THREE: { formDate: "2026-10-16", issue: "and", priorActions: null },
  RANGE: { formDate: "2026-10-09", issue: "late from 10-5 to", priorActions: null },
  ONE: { formDate: "2026-10-05", issue: "late", priorActions: null },
  OTHER_IN_LIST: { formDate: "2026-10-17", issue: "late", priorActions: null },
  COWORKER: { formDate: "2026-10-16", issue: "not her", priorActions: null },
};
/** Where D3 (FORM_DATE_INCIDENT_ONLY_ENABLED) on changes production's reading. */
const FIO_MAIN: Record<string, { formDate: string | null; issue: string | null; priorActions: string | null } | undefined> = {
  D2: { formDate: "2026-10-15", issue: "late on 10-5 and", priorActions: null },
};

/*
 * NEVER-BREAK: with the flag off, each case reads exactly as production does
 * today (main 5e151777), the live failures included.
 */
describe.each(FIO_RUNS)("flag off, %s: as production", (_fioLabel, fio) => {
  beforeEach(() => useProfile(false, fio));

  it.each(Object.entries(MAIN))("%s", async (key, expected) => {
    const { proposal } = await card(SAID[key as keyof typeof SAID]);
    const want = fio && FIO_MAIN[key] ? FIO_MAIN[key]! : expected;
    expect({ formDate: proposal?.formDate ?? null, issue: proposal?.issue ?? null, priorActions: proposal?.priorActions ?? null }).toEqual(want);
  });
});
