import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { rosterResultFor } from "@/test/roster-result";
import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import { JBA_MANUAL_CA_CHUNKS } from "@/test/fixtures/jba-manual-ca-sections";
import type { AccessScope, ChatFormProposal, ChatMessage } from "@/types";

/**
 * ============================================================================
 * STORED_SLOTS_NOT_A_REQUEST_ENABLED — A SLOT ANSWER IS NOT A NEW REQUEST
 * ============================================================================
 *
 * Ported from the sibling app (Pau approved the form-proposal.ts edit for both
 * apps on 26 Oct 2026). There the stored-slot lines put ahead of a slot answer
 * ("The form is the Corrective Action Form. The employee is … Policy
 * reference: …") made `turnsAboutThisForm` start the form over at that turn,
 * so a card created after "yes" and "$25" was drafted from "$25" alone.
 *
 * Live here (conv_mvp2eerf23op5u7): a Corrective Action, then "yes", then
 * "$25", then Create draft, gave a blank draft. This replays that flow through
 * POST /api/chat, `createInlineForm` and the real draft route with this app's
 * production flag list (FORM_FULL_REMAP off), each case in lowercase and
 * Sentence case, with the flag on and off: the card keeps the incident turn
 * among its sources and the created draft keeps the observation. On this
 * replay the card already kept every turn with the flag off, so these cases
 * pass on main as well; they pin the flow, and the flag changes nothing in it.
 * Faked: identity (a store manager at Kearney), the database (in memory), the
 * directory, the models, analytics. Invented names.
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
  role: "location_manager",
  draft: {} as { values?: Record<string, unknown>; checked?: Record<string, unknown> },
  revision: {} as { values?: Record<string, unknown>; checked?: Record<string, unknown>; clear?: string[] },
  revisionCalls: 0,
  chatModelCalls: 0,
  directory: [] as unknown[],
  draftNotes: [] as string[],
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
      if (!hasPermission(DEFAULT_PERMISSION_MATRIX, state.role as never, permission as never)) {
        throw new AuthError("forbidden", "Your role does not have permission to do that.");
      }
      return {
        identity: {
          subject: "qa-manager",
          email: "qa-manager@example.test",
          displayName: "QA Manager",
          role: state.role,
          scope: { level: "location", primaryAreaId: "loc-66", alsoCoversAreaIds: [] },
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

/** The slot model: the manager's words copied, nothing guessed. */
vi.mock("@/lib/ai/call-claude", () => ({
  callClaude: async () => "A grounded answer.",
  callClaudeTool: async (input: { tool?: { name?: string }; messages?: { content?: unknown }[] }) => {
    if (input.tool?.name !== "record_intent_slots") return null;
    const conversation = JSON.stringify(input.messages ?? []);
    const manager = (conversation.split("Manager:").pop() ?? conversation).replace(/\\n/g, "\n");
    return {
      employee: /mara quill/i.exec(manager)?.[0] ?? null,
      store: /kearney/i.test(manager) ? "Kearney" : null,
      title: /team member/i.test(manager) ? "team member" : null,
      incidentType: /\blate\b/i.test(manager) ? "late to open" : null,
      incidentDate: /\b\d{1,2}[-/]\d{1,2}(?:[-/]\d{2,4})?\b/.exec(manager)?.[0] ?? null,
      payrollAmount: /\$\s?(\d+)/.exec(manager)?.[1] ?? null,
      warningLevel: /\bverbal\b/i.test(manager) ? "verbal" : /\bwritten\b/i.test(manager) ? "written" : null,
      formType: /\b(?:ca|corrective action)\b/i.test(manager) ? "Corrective Action Form" : null,
      formTurn: /\b(?:ca|corrective action)\b/i.test(manager),
      policyHeading: /\blate\b/i.test(conversation) ? "Attendance" : null,
    };
  },
  callClaudeToolDetailed: async () => ({ input: {}, inputTokens: 1, outputTokens: 1 }),
}));

/** The drafting model: it writes only what the notes it is given describe. */
vi.mock("@/lib/ai/anthropic", () => ({
  getAnthropicClient: () => ({
    messages: {
      create: async (request: { messages?: { content?: unknown }[] }) => {
        const text = JSON.stringify(request.messages ?? []);
        state.chatModelCalls += 1;
        state.draftNotes.push(text);
        const late = /\blate\b/i.test(text);
        return {
          stop_reason: "tool_use",
          content: [
            {
              type: "tool_use",
              name: "write_form_fields",
              input: late ? LATE_DRAFT : { values: {}, checked: {} },
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
    loadScopedRosterResult: async (scope: AccessScope | null) =>
      rosterResultFor(actual.scopeRoster, state.directory as never, scope),
  };
});

process.env.NEXT_PUBLIC_DEMO_MODE = "false";

/* Each case loads the template library and runs several routes; a shared machine needs more than 5s. */
vi.setConfig({ hookTimeout: 30_000, testTimeout: 30_000 });

const { ensureTemplateLibrary } = await import("@/lib/forms/repository");
const { createInlineForm } = await import("@/features/chat/create-inline-form");
const chatRoute = await import("./route");
const instancesRoute = await import("../forms/instances/route");
const draftRoute = await import("../forms/instances/[id]/draft/route");

const TODAY = "2026-10-22";

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

/** The chat route only accepts a UUID for the open form; the fake numbers rows `fake-N`. */
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
  formUpdate?: { instanceId: string; updated: string[] };
};

/** The thread as the browser holds it: a card opened by an answer becomes the open form. */
class Thread {
  readonly messages: ChatMessage[] = [];
  proposal: ChatFormProposal | null = null;
  instanceId: string | null = null;
  private sequence = 0;
  private readonly conversationId = `conv_${randomUUID().slice(0, 12)}`;

  /** A production turn pair the stand-in model could not have written, replayed as history. */
  replay(question: string, answer: string) {
    const id = `m${(this.sequence += 1)}`;
    this.messages.push(
      { id, role: "user", content: question, createdAt: `${TODAY}T14:58:59Z` } as ChatMessage,
      { id: `a${this.sequence}`, role: "assistant", content: answer, createdAt: `${TODAY}T14:59:16Z` } as ChatMessage,
    );
  }

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
          ...(this.proposal && !this.instanceId ? { continueProposalTemplateKey: this.proposal.templateKey } : {}),
          ...(this.instanceId ? { activeFormInstanceId: this.instanceId } : {}),
        }),
      }),
    );
    const payload = (await response.json()) as Answer & { error?: string };
    expect(response.status, JSON.stringify(payload)).toBe(200);
    this.messages.push(
      { id, role: "user", content: question, createdAt: `${TODAY}T15:00:00Z` } as ChatMessage,
      {
        id: `a${this.sequence}`,
        role: "assistant",
        content: payload.content,
        createdAt: `${TODAY}T15:00:01Z`,
        ...(payload.formProposal ? { formProposal: payload.formProposal } : {}),
      } as ChatMessage,
    );
    if (payload.formProposal) {
      this.proposal = payload.formProposal;
      this.instanceId = null;
    }
    if (payload.formOpened) {
      payload.formOpened.instanceId = toUuid(payload.formOpened.instanceId);
      this.instanceId = payload.formOpened.instanceId;
    }
    return payload;
  }

  async create() {
    expect(this.proposal, "no card to create from").not.toBeNull();
    const result = await createInlineForm({
      proposal: this.proposal!,
      messages: this.messages,
      call,
      onCreated: () => {},
    });
    this.instanceId = toUuid(result.reference.instanceId);
    return this.instanceId;
  }
}


/*
 * THE CROSS-CHAT DRAFT GUARD READS `employee_name` WITH `ilike`, which the
 * shared fake does not model (and every other file relies on its absence).
 * Modelled here only, on `form_instances` only, as case-insensitive equality,
 * so the guard runs for real. Any other table still has no `ilike`, as before.
 */
{
  const proto = Object.getPrototypeOf(fakeSupabase(store).from("form_instances")) as Record<string, unknown>;
  proto.ilike = function (
    this: { table: string; filters: ((row: Record<string, unknown>) => boolean)[] },
    column: string,
    pattern: string,
  ) {
    if (this.table !== "form_instances") throw new TypeError(`fake-supabase: ilike is not modelled for ${this.table}`);
    this.filters.push((row) => String(row[column] ?? "").toLowerCase() === pattern.toLowerCase());
    return this;
  };
}



const LATE_DRAFT = vi.hoisted(() => ({
  values: {
    observation:
      "Observed:\nMara Quill was late to open the store on 10-15-26.\n\nExpectation:\nArrive in time to open.\n\nGoing Forward:\nArrive in time to open.",
  },
  checked: {},
}));
const DIRECTORY = [
  { id: "e-mq", firstName: "Mara", lastName: "Quill", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-66"], positionName: "Team Member Part Time" },
];
class JoiningRows extends Array<Record<string, unknown>> {
  override push(...rows: Record<string, unknown>[]) {
    const count = super.push(...rows);
    joinOverview();
    return count;
  }
}
const BUBBLES_PRODUCTION = [
  "APP_PASSWORD_HELP_ENABLED", "DRAFT_NEVER_BLANK_ENABLED", "DRAFT_REUSE_SAME_CHAT_ONLY_ENABLED", "EXIT_INTAKE_FIX_ENABLED",
  "LATE_OPEN_PAYROLL_FROM_FORM_ENABLED", "MANUAL_NEGATED_LIST_NOTE_ENABLED", "NAME_BEFORE_TITLE_ENABLED", "POLICY_SPECIFIC_TOPICS_ENABLED",
  "REOPEN_VERB_GUARD_ENABLED", "STATE_CODE_NOT_A_PERSON_ENABLED",
  "ACTION_PLAN_MANAGER_ONLY_ENABLED", "ACTION_PLAN_SENTENCES_ENABLED", "CA_TEMPLATE_MAP_ENABLED", "CHAT_TRACE_ENABLED",
  "CONVERSATION_DRAFT_REUSE_ENABLED", "CROSS_CHAT_REPLY_GUARD_ENABLED", "DRAFT_ACTIONS_ENABLED", "FIELD_ACCURACY_ENABLED",
  "FORM_CHOICE_STATED_ENABLED", "FORM_STATE_ENABLED", "FULL_MANUAL_CONTEXT_ENABLED", "GLOBAL_STORE_ASK_ENABLED",
  "GROUNDED_ENTITIES_ENABLED", "INTENT_EXTRACTION_ENABLED", "KEEP_FORM_EMPLOYEE_ENABLED", "LATE_OPEN_DATE_ENABLED",
  "NOT_A_NAME_GUARD_ENABLED", "PAYROLL_DEDUCT_AMOUNT_ENABLED", "PLACE_SPAN_GUARD_ENABLED", "PRINTED_PAGE_ONLY_ENABLED",
  "PRIOR_ACTIONS_PARSE_ENABLED", "PROMPT_CACHE_ENABLED", "REMAP_DRAFT_SOURCES_ENABLED", "REMAP_INCIDENT_FIX_ENABLED",
  "SLOT_RETENTION_ENABLED", "TITLE_WHOLE_WORD_ENABLED", "TYPED_NAME_ENABLED", "WARNING_LEVEL_MANAGER_ONLY_ENABLED",
];
const OFF = ["FORM_FULL_REMAP_ENABLED", "FORM_DATE_INCIDENT_ONLY_ENABLED", "SENSITIVE_DEFAULTS_REDACT_ENABLED", "TERSE_SLOT_READ_ENABLED", "NEXT_PUBLIC_REMAP_DRAFT_SOURCES_ENABLED"];
beforeEach(async () => {
  for (const key of Object.keys(store) as (keyof FakeStore)[]) store[key] = [];
  store.form_instances = new JoiningRows() as never;
  state.directory = DIRECTORY;
  state.chatModelCalls = 0;
  state.draftNotes = [];
  for (const name of BUBBLES_PRODUCTION) vi.stubEnv(name, "1");
  for (const name of OFF) vi.stubEnv(name, "");

  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T15:00:00Z`));
  await ensureTemplateLibrary("system");
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
const FLAG = "STORED_SLOTS_NOT_A_REQUEST_ENABLED";
const OPENING = "Create a verbal CA for Mara Quill at Kearney, late on 10-15-26";
const CASES = [
  ["Sentence case", OPENING],
  ["lowercase", OPENING.toLowerCase()],
] as const;
const EVERY = CASES.flatMap(([casing, opening]) =>
  [
    ["flag off", ""],
    ["flag on", "1"],
  ].map(([flag, value]) => [`${casing}, ${flag}`, opening, value] as const),
);
const valueOf = (id: string, key: string) =>
  (store.form_instance_values ?? []).find((entry) => entry.instance_id === id && entry.field_key === key)?.value ?? null;

describe('a Corrective Action, "yes", "$25", then Create draft', () => {
  it.each(EVERY)("the card keeps the incident turn and the draft keeps the observation (%s)", async (_label, opening, value) => {
    vi.stubEnv(FLAG, value);
    const thread = new Thread();
    const first = await thread.say(opening);
    expect(first.formProposal?.templateKey, first.content).toBe("dpoa");
    await thread.say("yes");
    const last = await thread.say("$25");
    expect(last.formProposal?.sourceMessageIds, last.content).toContain("m1");
    expect(last.content).toMatch(/late on 10-15-26/i);
    const id = await thread.create();
    expect(state.draftNotes.join("\n")).toMatch(/late on 10-15-26/i);
    expect(String(valueOf(id, "observation") ?? "")).toMatch(/late to open the store on 10-15-26/);
    expect(valueOf(id, "employee_name")).toBe("Mara Quill");
    expect(valueOf(id, "location")).toBe("Kearney, NE");
  });

  it("the flag reads off by default", async () => {
    const { storedSlotsNotARequestEnabled } = await import("@/lib/config/chat-quality-flags");
    vi.stubEnv(FLAG, "");
    expect(storedSlotsNotARequestEnabled()).toBe(false);
  });
});
