import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { continuationFor } from "@/lib/forms/proposal-continuation";
import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { ChatFormProposal, ChatMessage } from "@/types";

/**
 * ============================================================================
 * QA, 26 OCT 2026 — A COACHING SENTENCE ON A CORRECTIVE ACTION IS A PRIOR
 * ============================================================================
 *
 * Ported from the sibling app (its QA tester's four cases, word for word;
 * "rory vance" is the tester's invented name), and this app's production
 * evidence: "create a ca for <name> at omaha ne, she was late to open on
 * 10-5 and 10-15. i coached her on 10-16 about being late" was dated
 * 2026-10-16 — the COACHING — and the created draft had no prior action, the
 * coaching only inside the Observation text.
 *
 * Here, through POST /api/chat on this app's live form path (the full remap):
 *
 *   T1 "...she was late on 10-5 and 10-15. i coached her on 10-16 about being
 *       late" → dated 10/16, no prior action.
 *   D1 "...i coached her on 10-16 about being late. she was late again today"
 *       → dated 10/16, no prior action.
 *   D2 "ca for rory vance, she came in late on 10-5, i coached her on 10-16"
 *       → dated 10/16, no prior action.
 *   D3 "ca for rory vance, coached her 10-16, written warning on 10-20"
 *       → dated 10/20, What happened "written warning", no prior action.
 *
 * Behind PRIOR_SENTENCE_FIX_ENABLED (default off, same flag in both apps):
 * the form's date is never an earlier step's — the NEWEST incident date
 * dates it, as LATE_OPEN_DATE_ENABLED's newest-date rule already reads (T1:
 * 10/15); a request whose only dates are earlier steps (D3) is dated as one
 * with no date; "i coached her on 10-16", "coached her 10-16" and "written
 * warning on 10-20" are Prior actions rows; a clause holding only earlier
 * steps' dates is never What happened. On the created draft, every date the
 * manager typed stays as given, a coaching sentence carries the coaching's
 * own date, and the coaching is the Prior actions row. Off, as production.
 * "Corvin Mallow" is invented.
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
 * This app's production form path: the full remap and the flags on with it
 * (the same set as `edits-dates-replay-e2e.test.ts`), with
 * WARNING_LEVEL_MANAGER_ONLY_ENABLED and PRIOR_ACTIONS_PARSE_ENABLED.
 */
const PROD_FLAGS = [
  "FORM_FULL_REMAP_ENABLED",
  "KEEP_FORM_EMPLOYEE_ENABLED",
  "LATE_OPEN_DATE_ENABLED",
  "DRAFT_ACTIONS_ENABLED",
  "CONVERSATION_DRAFT_REUSE_ENABLED",
  "WARNING_LEVEL_MANAGER_ONLY_ENABLED",
  "PRIOR_ACTIONS_PARSE_ENABLED",
] as const;
const FLAG = "PRIOR_SENTENCE_FIX_ENABLED";
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
  for (const name of [...PROD_FLAGS, FLAG, "INTENT_EXTRACTION_ENABLED", "REMAP_INCIDENT_FIX_ENABLED", "MANAGER_WORDS_ONLY_ENABLED", "REMAP_DRAFT_SOURCES_ENABLED"]) {
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

const LIVE = {
  T1: "create a ca for rory vance at omaha ne, she was late on 10-5 and 10-15. i coached her on 10-16 about being late",
  T1_OPEN: "create a ca for rory vance at omaha ne, she was late to open on 10-5 and 10-15. i coached her on 10-16 about being late",
  D1: "create a ca for rory vance. i coached her on 10-16 about being late. she was late again today",
  D2: "ca for rory vance, she came in late on 10-5, i coached her on 10-16",
  D3: "ca for rory vance, coached her 10-16, written warning on 10-20",
} as const;

/** The same words in Sentence case: each sentence opens with a capital, and "i" is "I". */
function sentenceCase(text: string): string {
  return text.replace(/(^|[.!?]\s+)([a-z])/g, (_, lead: string, letter: string) => `${lead}${letter.toUpperCase()}`).replace(/\bi\b/g, "I");
}

const CASINGS = [
  ["lowercase", (text: string) => text],
  ["Sentence case", sentenceCase],
] as const;

function useProfile(fix: boolean) {
  for (const name of saved.keys()) delete process.env[name];
  for (const name of PROD_FLAGS) process.env[name] = "true";
  if (fix) process.env[FLAG] = "true";
}

async function card(said: string) {
  const thread = new Thread();
  const answer = await thread.say(said);
  return { thread, answer, proposal: answer.formProposal ?? null };
}

describe.each(CASINGS)("flag on (%s)", (_casing, cased) => {
  beforeEach(() => useProfile(true));

  it.each([
    ["T1", LIVE.T1],
    ["T1, late to open", LIVE.T1_OPEN],
  ] as const)("%s: dated the newest lateness, 10/15, never the coaching; the coaching is the prior action", async (_label, said) => {
    const { proposal } = await card(cased(said));
    expect(proposal?.templateKey).toBe("dpoa");
    expect(proposal?.formDate).toBe("2026-10-15");
    expect(proposal?.priorActions).toBe("Coaching about being late — 10/16/2026");
    expect(proposal?.issue ?? "").not.toMatch(/coach/i);
  });

  it("D1: never dated 10/16; the coaching is the prior action", async () => {
    const undated = await card(cased("create a ca for rory vance. she was late again today"));
    const { proposal } = await card(cased(LIVE.D1));
    expect(proposal?.formDate ?? null).toBe(undated.proposal?.formDate ?? null);
    expect(proposal?.priorActions).toBe("Coaching about being late — 10/16/2026");
    expect(proposal?.issue ?? "").not.toMatch(/coach/i);
  });

  it("D2: dated 10/5; the coaching is the prior action", async () => {
    const { proposal } = await card(cased(LIVE.D2));
    expect(proposal?.formDate).toBe("2026-10-05");
    expect(proposal?.priorActions).toBe("Coaching — 10/16/2026");
    expect(proposal?.issue ?? "").not.toMatch(/coach/i);
  });

  it('D3: dated as a request with no date; both priors listed; "written warning" is not What happened', async () => {
    const undated = await card(cased("ca for rory vance"));
    const { proposal } = await card(cased(LIVE.D3));
    expect(proposal?.formDate ?? null).toBe(undated.proposal?.formDate ?? null);
    expect(proposal?.formDate ?? null).not.toBe("2026-10-20");
    expect(proposal?.priorActions).toBe("Coaching — 10/16/2026\nWritten warning — 10/20/2026");
    expect(proposal?.issue ?? "").not.toMatch(/written warning|coach/i);
  });
});

describe("flag on: probes", () => {
  beforeEach(() => useProfile(true));

  it('negation: "she was never coached before" lists no prior action', async () => {
    const { proposal } = await card("create a ca for rory vance, she was late on 10-20. she was never coached before");
    expect(proposal?.formDate).toBe("2026-10-20");
    expect(proposal?.priorActions ?? null).toBeNull();
  });

  it('negation: "i never coached her on 10-16" lists no prior action', async () => {
    const { proposal } = await card("create a ca for rory vance, she was late on 10-20. i never coached her on 10-16");
    expect(proposal?.priorActions ?? null).toBeNull();
  });

  it('another person: "i coached Corvin Mallow on 10-16" stays off Rory\'s priors', async () => {
    const { proposal } = await card("create a ca for rory vance, she was late on 10-20. i coached Corvin Mallow on 10-16");
    expect(proposal?.priorActions ?? "").not.toMatch(/10\/16/);
  });

  it("two clauses: two coachings are two prior actions, and the lateness dates the form", async () => {
    const { proposal } = await card("create a ca for rory vance, she was late on 10-20. i coached her on 10-1 and i coached her on 10-16");
    expect(proposal?.formDate).toBe("2026-10-20");
    expect(proposal?.priorActions).toBe("Coaching — 10/01/2026\nCoaching — 10/16/2026");
  });

  it("a real incident date after the coaching dates the form", async () => {
    const { proposal } = await card("create a ca for rory vance. i coached her on 10-16 about being late, she was late again on 10-22");
    expect(proposal?.formDate).toBe("2026-10-22");
    expect(proposal?.priorActions).toBe("Coaching about being late — 10/16/2026");
  });
});

describe("a Coaching Form is unchanged: the coaching held is never a prior action there", () => {
  it("flag on reads it exactly as flag off", async () => {
    const said = "coaching form for rory vance at omaha ne, she was late on 10-5 and 10-15, I coached her on 10-16 about being late";
    useProfile(false);
    const off = await card(said);
    useProfile(true);
    const on = await card(said);
    expect(on.proposal?.templateKey).toBe(off.proposal?.templateKey);
    expect(on.proposal?.formDate).toBe(off.proposal?.formDate);
    expect(on.proposal?.priorActions ?? null).toBe(off.proposal?.priorActions ?? null);
  });
});

/* NEVER-BREAK: with the flag off, each case reads exactly as production did. */
describe("flag off: as production", () => {
  beforeEach(() => useProfile(false));

  it.each([
    ["T1", LIVE.T1],
    ["T1, late to open", LIVE.T1_OPEN],
    ["D1", LIVE.D1],
    ["D2", LIVE.D2],
  ] as const)("%s: dated the coaching, 10/16, with no prior action", async (_label, said) => {
    const { proposal } = await card(said);
    expect(proposal?.formDate).toBe("2026-10-16");
    expect(proposal?.priorActions ?? null).toBeNull();
  });

  it('D3: dated 10/20, What happened "written warning", no prior action', async () => {
    const { proposal } = await card(LIVE.D3);
    expect(proposal?.formDate).toBe("2026-10-20");
    expect(proposal?.issue).toBe("written warning");
    expect(proposal?.priorActions ?? null).toBeNull();
  });
});

/*
 * ============================================================================
 * THE CREATED DRAFT (the draft route)
 * ============================================================================
 */
const MODEL_OBSERVATION =
  "Observed: Rory Vance arrived late to open the store on October 5, 2026, and again on October 15, 2026. Rory Vance was coached about being late on October 16, 2026.\n\nExpectation: Rory Vance is expected to open the store on time.";

/**
 * What this app's draft route saves for MODEL_OBSERVATION with the flag off
 * (main 39f2df1d), as in production: the form is dated 10/16, the yearless
 * "10-5" and "10-15" are not read as the manager's, so the lateness sentence
 * holds two "invented" dates and is removed — only the coaching is left.
 */
const FLAG_OFF_OBSERVATION =
  "Observed:\nRory Vance was coached about being late on October 16, 2026.\n\nExpectation:\nRory Vance is expected to open the store on time.";

/**
 * Create needs the card to name the manager's turns, as production's remap
 * card does with REMAP_DRAFT_SOURCES_ENABLED; this harness turns it on for
 * the draft cases, on both sides of the flag.
 */
async function createdDraft(said: string, observationText: string) {
  process.env.REMAP_DRAFT_SOURCES_ENABLED = "true";
  state.draft = { values: { observation: observationText, prior_actions: "" } };
  const thread = new Thread();
  await thread.say(said);
  const id = await thread.create();
  const value = (key: string) =>
    (store.form_instance_values.find((entry) => entry.instance_id === id && entry.field_key === key)?.value as string | undefined) ?? null;
  return { observation: value("observation"), priorActions: value("prior_actions"), formDate: value("form_date") };
}

describe.each(CASINGS)("the created draft from T1, late to open (%s)", (_casing, cased) => {
  it("flag on: both lateness dates and the coaching's 10/16 stay, and the coaching is the prior action", async () => {
    useProfile(true);
    const draft = await createdDraft(cased(LIVE.T1_OPEN), MODEL_OBSERVATION);
    expect(draft.formDate).toBe("2026-10-15");
    expect(draft.observation).toContain("on October 5, 2026, and again on October 15, 2026.");
    expect(draft.observation).toContain("coached about being late on October 16, 2026.");
    expect(draft.priorActions).toBe("Coaching about being late — 10/16/2026");
  });

  it("flag on: a model that puts the coaching on a lateness date is corrected to the manager's 10/16", async () => {
    useProfile(true);
    const draft = await createdDraft(cased(LIVE.T1_OPEN), MODEL_OBSERVATION.replace("October 16", "October 5"));
    expect(draft.observation).toContain("coached about being late on October 16, 2026.");
    expect(draft.observation).not.toContain("coached about being late on October 5");
  });

  it("flag off: as production", async () => {
    useProfile(false);
    const draft = await createdDraft(cased(LIVE.T1_OPEN), MODEL_OBSERVATION);
    expect(draft.formDate).toBe("2026-10-16");
    expect(draft.observation).toBe(FLAG_OFF_OBSERVATION);
    expect(draft.priorActions).toBeNull();
  });
});

describe("the created draft: probes", () => {
  it("another person's coaching date stays off Rory's coaching sentence and priors", async () => {
    useProfile(true);
    const draft = await createdDraft(
      "create a ca for rory vance, she was late on 10-20. i coached Corvin Mallow on 10-16",
      "Observed: Rory Vance arrived late on October 20, 2026. Rory Vance was coached about being late on October 20, 2026.",
    );
    expect(draft.observation).not.toContain("October 16");
    expect(draft.priorActions ?? "").not.toContain("10/16");
  });

  it("a date the manager gave for the incident stays as given", async () => {
    useProfile(true);
    const draft = await createdDraft(
      "create a ca for rory vance. i coached her on 10-16 about being late, she was late again on 10-22",
      "Observed: Rory Vance arrived late on October 22, 2026, after being coached about being late on October 16, 2026.",
    );
    expect(draft.formDate).toBe("2026-10-22");
    expect(draft.observation).toContain("arrived late on October 22, 2026, after being coached about being late on October 16, 2026.");
    expect(draft.priorActions).toBe("Coaching about being late — 10/16/2026");
  });
});
