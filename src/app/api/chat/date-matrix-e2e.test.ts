import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, vi } from "vitest";

import { continuationFor } from "@/lib/forms/proposal-continuation";
import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { DateMatrixCase } from "@/test/date-matrix/cases";
import { cardLine, dateQuestionsIn, mentionedDates, runDateMatrix, type FormReading } from "@/test/date-matrix/run";
import type { ChatFormProposal, ChatMessage } from "@/types";

/**
 * ============================================================================
 * THE DATE-FORMAT MATRIX, THROUGH ASK BUBBLES' CHAT ROUTE
 * ============================================================================
 *
 * Pau (26 Oct 2026): "Please prioritize how apps read dates and map them in
 * the form even if they have different formats." The cases are shared with
 * Ask Sunny, byte for byte: `src/test/date-matrix/cases.ts`, run by
 * `src/test/date-matrix/run.ts` (its header documents the API another PR
 * calls). This file only drives THIS app: every case's turns go through
 * POST /api/chat, and the card's Date, Prior actions, What happened (this
 * app's name for the Observation), Follow-up and the exit card's date lines
 * are read back. An exit
 * case also creates the draft through the forms routes (`createInlineForm`,
 * the way `resign-method-followup-oct25.test.ts` does) and reads its date fields: a
 * card line and the draft field must agree.
 *
 * THE MODELS COPY THE MANAGER. This app's production form path is the full
 * remap: its extraction model returns the form, the employee and the warning
 * level as typed, What happened as the manager's own words after the request
 * clause ("ca for <name>, …" — the remap refuses a pasted message), "today"
 * as its `useToday` flag when the manager typed it, and NO date
 * (`incidentDateIso: null`, as Ask Sunny's production traces store it) — so
 * every date on the card is this app's own reading. The drafting model writes
 * no date.
 *
 * NO NEW FLAG. Tests and data only; the flags below are production's.
 *
 * KNOWN GAPS (`GAPS`, at the bottom). A cell that fails on main runs as
 * `it.fails` with a `gap:` note naming its owner — Code 1 (PRIOR_SENTENCE_FIX,
 * LATE_OPEN_DATE_FIX, PRIOR_ACTIONS_NO_COMMA #255/#187, DATE_READER_WIDE),
 * Code 4 (incident date #237/#167, exit notice dates #245/#177), Code 7 (edit
 * date rules #269/#201) — or "unowned". CI stays green and the gap stays
 * visible. WHEN A FIX LANDS its cells pass, `it.fails` turns red, and that PR
 * must delete the gap lines it closes (and turn its flag on in PROD_FLAGS
 * once it is on in production). Never widen a gap to get green.
 *
 * Run with DATE_MATRIX_IGNORE_GAPS=1 to see every failing cell, and
 * DATE_MATRIX_REPORT=<file> to write one JSON line per cell.
 */

/**
 * Ask Bubbles' production flag profile: the full remap (FORM_FULL_REMAP_ENABLED,
 * "on in production" in every route test here) with the warning level the
 * manager's only, the flags QA reads as on (`exit-intake-oct25.test.ts`:
 * NOT_A_NAME_GUARD, TYPED_NAME, FIELD_ACCURACY), plus the date and name fixes
 * known to be on — LATE_OPEN_DATE_ENABLED, PRIOR_ACTIONS_PARSE_ENABLED,
 * STATE_CODE_NOT_A_PERSON_ENABLED. Intent extraction is off in this app's
 * production, and the fixes still being built (PRIOR_SENTENCE_FIX,
 * LATE_OPEN_DATE_FIX, DATE_READER_WIDE, the edit date rules,
 * EXIT_INTAKE_FIX) are off: their cells are gaps.
 */
const PROD_FLAGS = [
  "FORM_FULL_REMAP_ENABLED",
  "WARNING_LEVEL_MANAGER_ONLY_ENABLED",
  "NOT_A_NAME_GUARD_ENABLED",
  "TYPED_NAME_ENABLED",
  "FIELD_ACCURACY_ENABLED",
  "LATE_OPEN_DATE_ENABLED",
  "PRIOR_ACTIONS_PARSE_ENABLED",
  "STATE_CODE_NOT_A_PERSON_ENABLED",
] as const;

/** Off in production; cleared so a developer's shell cannot change the matrix. */
const PROD_OFF = [
  "INTENT_EXTRACTION_ENABLED",
  "CODE_SLOTS_ENABLED",
  "FORM_STATE_ENABLED",
  "SLOT_RETENTION_ENABLED",
  "MANAGER_WORDS_ONLY_ENABLED",
  "CHAT_MEMORY_ENABLED",
  "SELF_CHECK_ENABLED",
  "FORM_EDIT_DATE_RULES_ENABLED",
  "EXIT_INTAKE_FIX_ENABLED",
  "PRIOR_SENTENCE_FIX_ENABLED",
  "LATE_OPEN_DATE_FIX_ENABLED",
  "DATE_READER_WIDE_ENABLED",
] as const;

/** This app's place for a live sentence's `{place}`. */
const PLACE = "Omaha NE";

const store = {
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
} as unknown as FakeStore;

const state = vi.hoisted(() => ({
  /** The intent model's reading for the turn being asked: a copy of the manager's words. */
  raw: {} as Record<string, unknown>,
  forms: new Map<string, unknown>(),
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
      if (!hasPermission(DEFAULT_PERMISSION_MATRIX, "location_manager" as never, permission as never)) {
        throw new AuthError("forbidden", "Your role does not have permission to do that.");
      }
      return {
        identity: {
          subject: "qa-manager",
          email: "qa-manager@example.test",
          displayName: "QA Manager",
          role: "location_manager",
          // One store, so every card resolves its store and a draft can be created.
          scope: { level: "location", primaryAreaId: "loc-264", alsoCoversAreaIds: [] },
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

vi.mock("@/lib/ai/call-claude", () => ({
  callClaude: async () => "A grounded answer.",
  callClaudeTool: async (input: { tool?: { name?: string } }) => {
    if (input.tool?.name !== "record_intent_slots") return null;
    return {
      employee: state.raw.employee ?? null,
      store: null,
      title: null,
      incidentType: null,
      incidentDate: null,
      payrollAmount: null,
      warningLevel: state.raw.warningLevel ?? null,
      formType: state.raw.formType ?? null,
      formTurn: true,
    };
  },
  /** The full remap's extraction: a copy of the manager's words, no date. */
  callClaudeToolDetailed: async () => ({
    input: {
      templateKey: state.raw.templateKey ?? null,
      employeeName: state.raw.employee ?? null,
      jobTitle: null,
      store: null,
      incidentDateIso: null,
      // "today" is copied as the schema's own flag for it; no date is ever written.
      useToday: state.raw.saysToday === true,
      warningLevel: state.raw.warningLevel ?? null,
      payrollDeduct: null,
      payrollAmount: null,
      policySection: null,
      observation: state.raw.observation ?? null,
      actionPlan: null,
    },
    inputTokens: 1,
    outputTokens: 1,
  }),
}));

/** The drafting model: a one-line account, no date (the exit dates are read by code). */
vi.mock("@/lib/ai/anthropic", () => ({
  getAnthropicClient: () => ({
    messages: {
      create: async (request: { tool_choice?: { name?: string } }) => ({
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            name: request.tool_choice?.name === "revise_form_fields" ? "revise_form_fields" : "write_form_fields",
            input: { values: {} },
          },
        ],
      }),
    },
  }),
}));

vi.mock("@/lib/ai/form-state-store", () => ({
  loadFormState: async (userId: string, conversationId: string) => state.forms.get(`${userId}:${conversationId}`) ?? null,
  saveFormState: async (userId: string, conversationId: string, saved: unknown) => {
    state.forms.set(`${userId}:${conversationId}`, saved);
  },
}));

vi.mock("@/lib/knowledge/providers/supabase", () => ({
  SupabaseKnowledgeProvider: class {
    async search() {
      return [];
    }
    async match() {
      return [];
    }
    async fetchRoleGrounding() {
      return { ok: false, failure: { code: "missing", detail: "not used", missingGroups: [] } };
    }
    async fetchOfficialPolicyManual() {
      return { ok: false, reason: "not needed" };
    }
    async fetchNamedHandbook() {
      return { ok: false, reason: "not needed" };
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
vi.mock("@/lib/forms/prior-forms", () => ({
  priorFormsReadingForChat: async () => ({ attach: [], possible: [], identity: "none" }),
}));

process.env.NEXT_PUBLIC_DEMO_MODE = "false";

/* Several hundred cases, each through the route; the first cell of a case runs it. */
vi.setConfig({ hookTimeout: 60_000, testTimeout: 60_000 });

const { ensureTemplateLibrary } = await import("@/lib/forms/repository");
const { createInlineForm } = await import("@/features/chat/create-inline-form");
const chatRoute = await import("./route");
const instancesRoute = await import("../forms/instances/route");
const instanceRoute = await import("../forms/instances/[id]/route");
const draftRoute = await import("../forms/instances/[id]/draft/route");

const saved = new Map<string, string | undefined>();

beforeAll(() => {
  for (const name of [...PROD_FLAGS, ...PROD_OFF]) saved.set(name, process.env[name]);
  for (const name of PROD_FLAGS) process.env[name] = "true";
  for (const name of PROD_OFF) delete process.env[name];
  vi.useFakeTimers({ toFake: ["Date"] });
});

afterAll(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  vi.useRealTimers();
});

/* ------------------------------------------------------------ the route -- */

function joinOverview(today: string) {
  for (const row of store.form_instances ?? []) {
    const template = store.form_templates!.find((entry) => entry.id === row.template_id);
    const version = store.form_template_versions.find((entry) => entry.id === row.template_version_id);
    Object.assign(row, {
      form_date: row.form_date ?? today,
      template_key: template?.key,
      template_name: template?.name,
      layout_family: template?.layout_family,
      template_version: version?.version,
    });
  }
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

type Answer = { content: string; formProposal?: ChatFormProposal; formOpened?: { instanceId: string } };

/** The names the matrix uses, as the intent model copies them: as typed. */
const NAMES = /\b(rowan pell|rory vance|odalys merriweather|test employee)\b/i;

/** A faithful copy of the manager's words: who, which form, which level, what happened. No date. */
function copiesTheManager(said: string): Record<string, unknown> {
  const formType = /\bexit\b/i.test(said)
    ? "Resignation/Exit Form"
    : /coaching form/i.test(said)
      ? "Coaching Form"
      : /\b(?:ca|corrective action|verbal|written)\b/i.test(said)
        ? "Corrective Action Form"
        : null;
  return {
    employee: NAMES.exec(said)?.[1] ?? null,
    formType,
    templateKey: formType === "Coaching Form" ? "coaching" : formType === "Corrective Action Form" ? "dpoa" : null,
    warningLevel: /\bwritten\b/i.test(said) && !/written warning (?:on|\d)/i.test(said) ? "written" : /\bverbal\b(?! warning)/i.test(said) ? "verbal" : null,
    // The manager's account after the request ("ca for <name>, …"): the model may not paste the whole message.
    saysToday: /\btoday\b/i.test(said),
    observation: said.replace(/\n/g, " ").replace(new RegExp(`^.*?${NAMES.source}[,.]?\\s*`, "i"), "") || null,
  };
}

let threads = 0;

async function converse(testCase: DateMatrixCase) {
  const today = testCase.today;
  const messages: ChatMessage[] = [];
  const conversationId = `conv_dm${(threads += 1).toString(36).padStart(5, "0")}`;
  let proposal: ChatFormProposal | null = null;
  let instanceId: string | null = null;
  const replies: Answer[] = [];
  for (const [index, question] of testCase.turns.entries()) {
    state.raw = copiesTheManager(testCase.turns.slice(0, index + 1).join("\n"));
    const continuation = instanceId ? null : continuationFor(messages);
    const id = `m${index + 1}`;
    const response = await chatRoute.POST(
      new Request("https://app.test/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question,
          mode: "standard",
          history: messages.map(({ id: messageId, role, content, formProposal }) => ({
            id: messageId,
            role,
            content,
            ...(formProposal ? { formProposal } : {}),
          })),
          questionMessageId: id,
          conversationId,
          ...(continuation ? { continueProposalTemplateKey: continuation.templateKey } : {}),
          ...(instanceId ? { activeFormInstanceId: instanceId } : {}),
        }),
      }),
    );
    const payload = (await response.json()) as Answer & { error?: string };
    if (response.status !== 200) throw new Error(`POST /api/chat ${response.status}: ${JSON.stringify(payload)}`);
    replies.push(payload);
    messages.push(
      { id, role: "user", content: question, createdAt: `${today}T15:00:00Z` } as ChatMessage,
      {
        id: `a${index + 1}`,
        role: "assistant",
        content: payload.content,
        createdAt: `${today}T15:00:01Z`,
        ...(payload.formProposal ? { formProposal: payload.formProposal } : {}),
      } as ChatMessage,
    );
    if (payload.formProposal) proposal = payload.formProposal;
    if (payload.formOpened) instanceId = toUuid(payload.formOpened.instanceId);
  }
  return { replies, messages, proposal };
}

async function call<T>(url: string, init: RequestInit | undefined, today: string): Promise<T> {
  const request = new Request(`https://app.test${url}`, init);
  const draft = /^\/api\/forms\/instances\/([^/]+)\/draft$/.exec(url);
  const response = draft
    ? await draftRoute.POST(request, { params: Promise.resolve({ id: draft[1]! }) })
    : url === "/api/forms/instances"
      ? await instancesRoute.POST(request)
      : null;
  if (!response) throw new Error(`no route for ${url}`);
  joinOverview(today);
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body;
}

/** The created exit draft's date fields, ISO, by key. */
async function exitDraftDates(proposal: ChatFormProposal, messages: ChatMessage[], today: string) {
  const result = await createInlineForm({
    proposal,
    messages,
    call: (url, init) => call(url, init, today),
    onCreated: () => {},
  });
  const id = toUuid(result.reference.instanceId);
  joinOverview(today);
  const response = await instanceRoute.GET(new Request(`https://app.test/api/forms/instances/${id}`), {
    params: Promise.resolve({ id }),
  });
  const body = (await response.json()) as { values?: { fieldKey: string; value: string | null }[] };
  const value = (key: string) => body.values?.find((entry) => entry.fieldKey === key)?.value || null;
  return {
    lastDayWorked: value("last_day_worked"),
    noticeDate: value("notice_given_date"),
    noticeFulfilledDate: value("notice_fulfilled_date"),
    resignationDate: value("resignation_date"),
  };
}

/** The first date a card line holds, ISO. */
function lineDate(content: string, label: string, today: string): string | null {
  const line = cardLine(content, label);
  return line ? (mentionedDates(line, today)[0]?.iso ?? `unread: ${line}`) : null;
}

/** A card line and the created draft must agree; when they do not, both are shown. */
function agreed(card: string | null, draft: string | null | undefined): string | null {
  if (draft === undefined || card === draft) return card;
  return `card ${card ?? "blank"} / draft ${draft ?? "blank"}`;
}

async function ask(testCase: DateMatrixCase): Promise<FormReading> {
  const today = testCase.today;
  for (const key of Object.keys(store) as (keyof FakeStore)[]) store[key] = [];
  state.forms.clear();
  vi.setSystemTime(new Date(`${today}T15:00:00Z`));
  await ensureTemplateLibrary("system");

  const { replies, messages, proposal } = await converse(testCase);
  const last = [...replies].reverse().find((reply) => reply.formProposal) ?? replies[replies.length - 1]!;
  const content = last.content;
  const card = Boolean(proposal);
  const priorLine =
    proposal?.priorActions ?? cardLine(content, "Prior actions")?.replace(/, as you said\b.*$/, "") ?? null;

  let draft: Awaited<ReturnType<typeof exitDraftDates>> | null = null;
  if (testCase.form === "exit" && proposal?.status === "ready") draft = await exitDraftDates(proposal, messages, today);

  return {
    card,
    templateKey: proposal?.templateKey ?? null,
    employee: proposal?.employeeName ?? null,
    formDate: proposal?.formDate ?? null,
    priorRows: priorLine ? priorLine.split(/;\s*|\n+/).filter(Boolean) : [],
    // This app's name for the Observation of Offense.
    observation: cardLine(content, "What happened") ?? cardLine(content, "Observation of Offense") ?? "",
    followUpDate: lineDate(content, "Follow-up", today),
    lastDayWorked: agreed(lineDate(content, "Last Day Worked", today), draft?.lastDayWorked),
    noticeDate: agreed(lineDate(content, "Date that notice was given", today), draft?.noticeDate),
    noticeFulfilledDate: agreed(lineDate(content, "Date that notice was fulfilled", today), draft?.noticeFulfilledDate),
    resignationDate: lineDate(content, "Resignation Date", today),
    effectiveDate: null,
    dateQuestions: replies.flatMap((reply) => dateQuestionsIn(reply.content)),
    transcript: replies.map((reply, index) => `[${index + 1}] ${reply.content}`).join("\n\n"),
  };
}

/* ------------------------------------------------------- the known gaps -- */

/** Who owns each gap. A fix PR deletes its lines below when its cells pass. */
const OWNER = {
  C4EXIT: "gap: Code 4 exit notice dates (#245/#177) — the notice-fulfilled / last-day dates are not read",
  C4INC: "gap: Code 4 incident date (#237/#167) — with several incident dates the Date is not the first one, and nothing is asked",
  C7: "gap: Code 7 edit date rules (#269/#201) — \"late today\" leaves the Date blank on the full remap",
  CAPS_NAME: "gap: unowned — in ALL CAPS a phrase is read as a second person (name reading), so the date is not filled",
  DRW: "gap: Code 1 DATE_READER_WIDE — the date is not read in this format and nothing is asked",
  FU_AS_DATE: "gap: unowned — a yearless follow-up (\"follow up on 11-2\") is read as last year's Date",
  NOCARD: "gap: unowned — \"do verbal for team member <name>\" gets an answer, not a card, on the full remap",
  NOCOMMA: "gap: Code 1 PRIOR_ACTIONS_NO_COMMA (#255/#187) — priors run together without commas are not read",
  NO_FU: "gap: unowned — the full-remap card reads no Follow-up date",
  OBS_BUB: "gap: unowned — What happened is reduced to the policy or a fragment, so the incident dates are not on it",
  PSF: "gap: Code 1 PRIOR_SENTENCE_FIX — an earlier step said as its own sentence is not a Prior actions row (its date becomes the Date, or the incident clause is lost)",
  RANGE: "gap: Code 4 incident date (#237/#167) — \"from 10-5 to 10-9\" is not dated from its first day, and nothing is asked",
} as const;

/** Every cell that fails on main today (26 Oct 2026, main 39f2df1; unchanged on 3b92650). */
const GAPS: Record<string, string> = {
"qa-late-coached/*:formDate": OWNER.PSF,
  "qa-late-coached/*:priorActions": OWNER.PSF,
  "qa-late-coached/*:priorNotFormDate": OWNER.PSF,
  "qa-late-open-coached/*:formDate": OWNER.PSF,
  "qa-late-open-coached/*:priorActions": OWNER.PSF,
  "qa-late-open-coached/*:priorNotFormDate": OWNER.PSF,
  "qa-coached-then-written/*:formDate": OWNER.PSF,
  "qa-coached-then-written/*:priorActions": OWNER.PSF,
  "qa-coached-then-written/*:priorNotFormDate": OWNER.PSF,
  "qa-coached-late-today/*:formDate": OWNER.PSF,
  "qa-coached-late-today/*:priorActions": OWNER.PSF,
  "qa-coached-late-today/*:priorNotFormDate": OWNER.PSF,
  "qa-came-late-coached/*:formDate": OWNER.PSF,
  "qa-came-late-coached/*:priorActions": OWNER.PSF,
  "qa-came-late-coached/*:priorNotFormDate": OWNER.PSF,
  "b12-puppy-two-dates/*:formDate": OWNER.NOCARD,
  "b12-puppy-two-dates/*:incidentDates": OWNER.NOCARD,
  "b12-puppy-two-dates/*:priorActions": OWNER.NOCARD,
  "b12-live-ncns-team-member/*:formDate": OWNER.C4INC,
  "b12-live-ncns-team-member/*:incidentDates": OWNER.OBS_BUB,
  "b12-live-ncns-no-title/*:formDate": OWNER.C4INC,
  "b12-live-ncns-no-title/*:incidentDates": OWNER.OBS_BUB,
  "b12-live-ncns-no-comma/*:formDate": OWNER.C4INC,
  "b12-live-ncns-no-comma/*:incidentDates": OWNER.OBS_BUB,
  "b12-live-ncns-short/*:formDate": OWNER.C4INC,
  "b12-live-ncns-short/*:incidentDates": OWNER.OBS_BUB,
  "b10-live-comma/*:incidentDates": OWNER.OBS_BUB,
  "b10-live-no-comma/*:incidentDates": OWNER.OBS_BUB,
  "b11-live-late-opening/*:incidentDates": OWNER.OBS_BUB,
  "priors-without-commas/*:formDate": OWNER.NOCOMMA,
  "priors-without-commas/*:incidentDates": OWNER.NOCOMMA,
  "priors-without-commas/*:priorActions": OWNER.NOCOMMA,
  "priors-without-commas/*:priorNotFormDate": OWNER.NOCOMMA,
  "incident-range-from-to/*:formDate": OWNER.RANGE,
  "exit-notice-and-fulfilled/*:lastDayWorked": OWNER.C4EXIT,
  "exit-notice-and-fulfilled/*:noticeFulfilledDate": OWNER.C4EXIT,
  "exit-notice-and-fulfilled/upper:noticeDate": OWNER.CAPS_NAME,
  "incident-today/*:formDate": OWNER.C7,
  "list-2_october/*:formDate": OWNER.DRW,
  "list-2nd_of_october/*:formDate": OWNER.DRW,
  "list-october_second/*:formDate": OWNER.DRW,
  "list-2-oct/*:formDate": OWNER.DRW,
  "list-10-2/*:formDate": OWNER.DRW,
  "list-10dot2/*:formDate": OWNER.DRW,
  "list-1002/*:formDate": OWNER.DRW,
  "list-the_2nd/*:formDate": OWNER.DRW,
  "list-10slash2/*:formDate": OWNER.C4INC,
  "list-10slash2slash26/*:formDate": OWNER.C4INC,
  "list-10dot2dot26/*:formDate": OWNER.C4INC,
  "list-10slash02slash2026/*:formDate": OWNER.C4INC,
  "list-2026-10-02/*:formDate": OWNER.C4INC,
  "list-october_2/*:formDate": OWNER.C4INC,
  "list-oct_2nd/*:formDate": OWNER.C4INC,
  "list-octdot_2/*:formDate": OWNER.C4INC,
  "list-oct_2nd_2026/*:formDate": OWNER.C4INC,
  "list-fri_10slash2/*:formDate": OWNER.C4INC,
  "prior-2_october/*:incidentDates": OWNER.OBS_BUB,
  "prior-2_october/*:priorActions": OWNER.DRW,
  "prior-2nd_of_october/*:incidentDates": OWNER.OBS_BUB,
  "prior-2nd_of_october/*:priorActions": OWNER.DRW,
  "prior-october_second/*:incidentDates": OWNER.OBS_BUB,
  "prior-october_second/*:priorActions": OWNER.DRW,
  "prior-2-oct/*:incidentDates": OWNER.OBS_BUB,
  "prior-2-oct/*:priorActions": OWNER.DRW,
  "prior-10-2/*:incidentDates": OWNER.OBS_BUB,
  "prior-10dot2/*:incidentDates": OWNER.OBS_BUB,
  "prior-10dot2/*:priorActions": OWNER.DRW,
  "prior-1002/*:incidentDates": OWNER.OBS_BUB,
  "prior-1002/*:priorActions": OWNER.DRW,
  "prior-the_2nd/*:incidentDates": OWNER.OBS_BUB,
  "prior-the_2nd/*:priorActions": OWNER.DRW,
  "prior-10slash2/*:incidentDates": OWNER.OBS_BUB,
  "prior-10slash2slash26/*:incidentDates": OWNER.OBS_BUB,
  "prior-10dot2dot26/*:incidentDates": OWNER.OBS_BUB,
  "prior-10slash02slash2026/*:incidentDates": OWNER.OBS_BUB,
  "prior-2026-10-02/*:incidentDates": OWNER.OBS_BUB,
  "prior-october_2/*:incidentDates": OWNER.OBS_BUB,
  "prior-oct_2nd/*:incidentDates": OWNER.OBS_BUB,
  "prior-octdot_2/*:incidentDates": OWNER.OBS_BUB,
  "prior-oct_2nd_2026/*:incidentDates": OWNER.OBS_BUB,
  "prior-fri_10slash2/*:incidentDates": OWNER.OBS_BUB,
  "follow-up-10slash2/*:followUpDate": OWNER.NO_FU,
  "follow-up-10slash2slash26/*:followUpDate": OWNER.NO_FU,
  "follow-up-10dot2dot26/*:followUpDate": OWNER.NO_FU,
  "follow-up-10slash02slash2026/*:followUpDate": OWNER.NO_FU,
  "follow-up-2026-10-02/*:followUpDate": OWNER.NO_FU,
  "follow-up-october_2/*:followUpDate": OWNER.NO_FU,
  "follow-up-oct_2nd/*:followUpDate": OWNER.NO_FU,
  "follow-up-octdot_2/*:followUpDate": OWNER.NO_FU,
  "follow-up-oct_2nd_2026/*:followUpDate": OWNER.NO_FU,
  "follow-up-fri_10slash2/*:followUpDate": OWNER.NO_FU,
  "follow-up-2_october/*:followUpDate": OWNER.NO_FU,
  "follow-up-2nd_of_october/*:followUpDate": OWNER.NO_FU,
  "follow-up-october_second/*:followUpDate": OWNER.NO_FU,
  "follow-up-2-oct/*:followUpDate": OWNER.NO_FU,
  "follow-up-10-2/*:formDate": OWNER.FU_AS_DATE,
  "follow-up-10-2/*:followUpDate": OWNER.NO_FU,
  "follow-up-10dot2/*:followUpDate": OWNER.NO_FU,
  "follow-up-1002/*:followUpDate": OWNER.NO_FU,
  "edit-2_october/*:formDate": OWNER.DRW,
  "edit-2nd_of_october/*:formDate": OWNER.DRW,
  "edit-october_second/*:formDate": OWNER.DRW,
  "edit-2-oct/*:formDate": OWNER.DRW,
  "edit-10dot2/*:formDate": OWNER.DRW,
  "edit-1002/*:formDate": OWNER.DRW,
  "edit-the_2nd/*:formDate": OWNER.DRW,
  "edit-probe-with-prior/*:formDate": OWNER.PSF,
  "edit-probe-with-prior/*:priorActions": OWNER.PSF,
  "edit-probe-with-prior/*:priorNotFormDate": OWNER.PSF,
  "edit-probe-unread-with-prior/*:formDate": OWNER.DRW,
  "edit-probe-unread-with-prior/*:priorActions": OWNER.DRW,
  "edit-probe-unread-with-prior/*:priorNotFormDate": OWNER.DRW,
  "edit-probe-two-dates/*:asksWhichDate": OWNER.DRW,
  "last-day-2_october/*:lastDayWorked": OWNER.DRW,
  "last-day-2nd_of_october/*:lastDayWorked": OWNER.DRW,
  "last-day-october_second/*:lastDayWorked": OWNER.DRW,
  "last-day-2-oct/*:lastDayWorked": OWNER.DRW,
  "last-day-10-2/*:lastDayWorked": OWNER.DRW,
  "last-day-10dot2/*:lastDayWorked": OWNER.DRW,
  "last-day-1002/*:lastDayWorked": OWNER.DRW,
  "last-day-the_2nd/*:lastDayWorked": OWNER.DRW,
  "notice-2_october/*:noticeDate": OWNER.DRW,
  "notice-2nd_of_october/*:noticeDate": OWNER.DRW,
  "notice-october_second/*:noticeDate": OWNER.DRW,
  "notice-2-oct/*:noticeDate": OWNER.DRW,
  "notice-10-2/*:noticeDate": OWNER.DRW,
  "notice-10dot2/*:noticeDate": OWNER.DRW,
  "notice-1002/*:noticeDate": OWNER.DRW,
  "notice-the_2nd/*:noticeDate": OWNER.DRW,
  "quit-2_october/*:resignationDate": OWNER.DRW,
  "quit-2nd_of_october/*:resignationDate": OWNER.DRW,
  "quit-october_second/*:resignationDate": OWNER.DRW,
  "quit-2-oct/*:resignationDate": OWNER.DRW,
  "quit-10-2/*:resignationDate": OWNER.DRW,
  "quit-10dot2/*:resignationDate": OWNER.DRW,
  "quit-1002/*:resignationDate": OWNER.DRW,
  "quit-the_2nd/*:resignationDate": OWNER.DRW,
};

/*
 * flags-off-parity.test.ts re-runs src/app/api/chat with every new flag "off"
 * inside one 540 s child. The matrix sets its own production profile, so it
 * adds nothing there, and its several hundred route calls would only push that
 * child past its limit: it is skipped in that child and runs everywhere else.
 */
const IN_FLAGS_OFF_PARITY_CHILD = process.env.FLAGS_OFF_PARITY_CHILD === "1";

runDateMatrix({ app: "Ask Bubbles", ask, gaps: GAPS, place: PLACE, skip: IN_FLAGS_OFF_PARITY_CHILD });
