import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { rosterResultFor } from "@/test/roster-result";
import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import { JBA_MANUAL_CA_CHUNKS } from "@/test/fixtures/jba-manual-ca-sections";
import { futureIncidentDateConfirmEnabled, statedTitleWinsEnabled } from "@/lib/config/chat-quality-flags";
import { decideIntentTurn, type IntentTurnInput } from "@/lib/ai/intent-slots";
import { withFutureDateQuestion } from "@/lib/ai/future-incident-date";
import type { AccessScope, ChatFormProposal, ChatMessage } from "@/types";

/**
 * ============================================================================
 * FORM SLOTS FROM ASK BUBBLES' HISTORY (BH1, BH3, BH5), 21-22 OCT 2026
 * ============================================================================
 *
 * Three production conversations, the manager's exact words with synthetic
 * names, through POST /api/chat on this app's live path (the full remap,
 * FORM_FULL_REMAP_ENABLED, on in production); the card's Create goes through
 * `createInlineForm`, and a turn with the form open carries
 * `activeFormInstanceId` as the browser sends it.
 *
 *   BH1 conv_mvjyhx8z2ayo9ku "create a verbal corrective action for <name>,
 *       team member at dodge for violating dress code on 10-20-26": the level
 *       stated in the create turn is the card's; the manager's stated title is
 *       not replaced by Woven's.
 *   BH3 conv_mvi94k418pzwgmn "verbal. payroll deduct is not applicable." with
 *       the form open: both facts are applied.
 *   BH5 conv_mvikc78w58v710y an incident date in the future (12-20-26 typed on
 *       10-21-26) is asked about once (FUTURE_INCIDENT_DATE_CONFIRM_ENABLED).
 */

const store = {
  chat_conversations: [],
  chat_messages: [],
  chat_traces: [],
  chat_form_state: [],
  form_instances: [],
  form_instance_values: [],
  form_instance_events: [],
  form_template_versions: [],
  form_templates: [],
  form_template_current: [],
  form_template_assets: [],
} as unknown as FakeStore & Record<string, Record<string, unknown>[]>;

const state = vi.hoisted(() => ({
  role: "location_manager",
  draft: {} as { values?: Record<string, unknown>; checked?: Record<string, unknown> },
  revision: {} as { values?: Record<string, unknown>; checked?: Record<string, unknown>; clear?: string[] },
  revisionCalls: 0,
  chatModelCalls: 0,
  directory: [] as unknown[],
  names: [] as string[],
  intent: null as Record<string, unknown> | null,
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

/** The form a manager turn names, as the extraction model copies it. */
function namedForm(text: string): string | null {
  if (/coaching/i.test(text)) return "coaching";
  if (/\b(?:ca|corrective action)\b/i.test(text)) return "dpoa";
  return null;
}

vi.mock("@/lib/ai/call-claude", () => ({
  callClaude: async () => {
    state.chatModelCalls += 1;
    return "A grounded answer.";
  },
  callClaudeTool: async (input: { tool?: { name?: string } }) =>
    input.tool?.name === "record_intent_slots" ? state.intent : null,
  callClaudeToolDetailed: async (input: { messages?: { content?: unknown }[] }) => {
    const text = JSON.stringify(input.messages ?? []);
    const last = text.split(/Manager:|User:/i).pop() ?? text;
    return {
      input: {
        templateKey: namedForm(last),
        employeeName: state.names.find((name) => last.toLowerCase().includes(name.toLowerCase())) ?? null,
        observation: null,
        actionPlan: null,
      },
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
    loadScopedRoster: async (scope: AccessScope | null) => actual.scopeRoster(state.directory as never, scope),
    loadScopedRosterResult: async (scope: AccessScope | null) =>
      rosterResultFor(actual.scopeRoster, state.directory as never, scope),
    // The intent read's directory facts: the same people, with Woven's title.
    readDirectoryFacts: async (scope: AccessScope | null) =>
      actual
        .scopeRoster(state.directory as never, scope)
        .map((person) => ({
          ...person,
          title: (state.directory as { id: string; positionName: string }[]).find((row) => row.id === person.id)?.positionName ?? null,
          primaryLocationName: null,
        })),
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

let TODAY = "2026-10-22";

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

const checked = (id: string, key: string) =>
  (store.form_instance_values ?? []).find((entry) => entry.instance_id === id && entry.field_key === key)?.checked ?? [];
const value = (id: string, key: string) =>
  (store.form_instance_values ?? []).find((entry) => entry.instance_id === id && entry.field_key === key)?.value ?? null;

/* Synthetic people only; the titles are this app's directory titles. */
const DIRECTORY = [
  { id: "e-1", firstName: "Marlo", lastName: "Quist", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264", "loc-66"], positionName: "Human Resources Generalist" },
  { id: "e-2", firstName: "Sela", lastName: "Brandt", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" },
  { id: "e-3", firstName: "Test", lastName: "Employee", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-66"], positionName: "Team Member" },
];

const PRODUCTION = ["FORM_FULL_REMAP_ENABLED"] as const;
const TITLE_FLAG = "STATED_TITLE_WINS_ENABLED";
const DATE_FLAG = "FUTURE_INCIDENT_DATE_CONFIRM_ENABLED";
const TOUCHED = [
  ...PRODUCTION,
  TITLE_FLAG,
  DATE_FLAG,
  "INTENT_EXTRACTION_ENABLED",
  "TITLE_WHOLE_WORD_ENABLED",
  "PLACE_SPAN_GUARD_ENABLED",
  "REMAP_INCIDENT_FIX_ENABLED",
  "MANAGER_WORDS_ONLY_ENABLED",
  "WARNING_LEVEL_MANAGER_ONLY_ENABLED",
] as const;
const saved = new Map<string, string | undefined>();

function at(day: string) {
  TODAY = day;
  vi.setSystemTime(new Date(`${day}T15:00:00Z`));
}

class JoiningRows extends Array<Record<string, unknown>> {
  override push(...rows: Record<string, unknown>[]) {
    const count = super.push(...rows);
    joinOverview();
    return count;
  }
}

const DRAFT_MODEL = {
  values: {
    observation:
      "Observed:\nOn October 20, 2026, the employee did not meet the expectation.\n\nExpectation:\nFollow the policy.\n\nGoing Forward:\nFollow the policy on every shift.",
  },
  checked: {},
};

beforeEach(async () => {
  for (const key of Object.keys(store) as (keyof FakeStore)[]) store[key] = [];
  store.form_instances = new JoiningRows() as never;
  state.role = "location_manager";
  state.draft = DRAFT_MODEL;
  state.revision = { values: {} };
  state.revisionCalls = 0;
  state.chatModelCalls = 0;
  state.directory = DIRECTORY;
  state.names = ["marlo quist", "sela brandt", "test employee"];
  state.intent = null;
  for (const name of TOUCHED) saved.set(name, process.env[name]);
  for (const name of TOUCHED) delete process.env[name];
  for (const name of PRODUCTION) process.env[name] = "true";
  vi.useFakeTimers({ toFake: ["Date"] });
  at("2026-10-22");
  await ensureTemplateLibrary("system");
});

afterEach(() => {
  for (const [name, before] of saved) {
    if (before === undefined) delete process.env[name];
    else process.env[name] = before;
  }
  vi.useRealTimers();
});

describe("the two new flags", () => {
  it("are off unless set", () => {
    expect(statedTitleWinsEnabled()).toBe(false);
    expect(futureIncidentDateConfirmEnabled()).toBe(false);
  });
});

/* ========================================================================= */
/* BH1 — conv_mvjyhx8z2ayo9ku                                                */
/* ========================================================================= */

/** Production, 22 Oct 2026 19:51 UTC, name replaced. */
const BH1 = "create a verbal corrective action for marlo quist, team member at dodge for violating dress code on 10-20-26";
const OVERRIDE = /so the form uses/;
const KEPT =
  "You described **Marlo Quist** as a Team Member; Woven lists their job title as **Human Resources Generalist**. The form keeps **Team Member**, the title you gave — tell me if it should be **Human Resources Generalist**.";
const LEVEL_ASKED = /Verbal or written\?|\*\*Verbal Warning\*\* or a \*\*Written Warning\*\*\?/;

describe("BH1 on the live path (full remap): the create turn's level and title", () => {
  it("the card and the created form carry the Verbal Warning and the manager's Team Member", async () => {
    const thread = new Thread();
    const card = await thread.say(BH1);
    expect(card.formProposal?.warningLevel).toBe("verbal");
    expect(card.content).not.toMatch(LEVEL_ASKED);
    expect(card.formProposal?.employeeRole).toBe("Team Member");
    expect(card.content).not.toMatch(OVERRIDE);
    const id = await thread.create();
    expect(checked(id, "warning_type")).toEqual(["verbal"]);
    expect(value(id, "job_title")).toBe("Team Member");
  });

  it('the level stated before "Who is this for?" is still the card\'s after the name', async () => {
    state.names = [];
    const thread = new Thread();
    const first = await thread.say(BH1);
    expect(first.formProposal?.warningLevel).toBe("verbal");
    state.names = ["marlo quist"];
    /* Production, 19:51:31 UTC, name replaced. */
    const second = await thread.say("employee name is marlo quist");
    expect(second.formProposal?.warningLevel).toBe("verbal");
    expect(second.content).not.toMatch(LEVEL_ASKED);
    expect(second.formProposal?.employeeRole).toBe("Team Member");
  });
});

describe("BH1 on the proposal flow (remap off or unavailable): Woven's title does not replace the manager's", () => {
  beforeEach(() => {
    delete process.env.FORM_FULL_REMAP_ENABLED;
  });

  it(`${TITLE_FLAG}: the card keeps Team Member and the reply names Woven's title and asks`, async () => {
    process.env[TITLE_FLAG] = "true";
    const thread = new Thread();
    const card = await thread.say(BH1);
    expect(card.formProposal?.warningLevel).toBe("verbal");
    expect(card.formProposal?.employeeRole).toBe("Team Member");
    expect(card.formProposal?.employeeRoleSource).toBe("manager");
    expect(card.content).toContain(KEPT);
    expect(card.content).not.toMatch(OVERRIDE);
    const id = await thread.create();
    expect(value(id, "job_title")).toBe("Team Member");
    expect(checked(id, "warning_type")).toEqual(["verbal"]);
  });

  it("flag off: unchanged (Woven's verified title, as on 22 Oct 2026)", async () => {
    const thread = new Thread();
    const card = await thread.say(BH1);
    expect(card.formProposal?.employeeRole).toBe("Human Resources Generalist");
    expect(card.content).toContain(
      "You described **Marlo Quist** as a Team Member, but Woven lists their job title as **Human Resources Generalist**, so the form uses **Human Resources Generalist**.",
    );
  });
});

/** The intent reading (INTENT_EXTRACTION_ENABLED, off in production here) of one manager turn. */
function intentTurn(question: string, extra: Partial<IntentTurnInput> = {}) {
  return decideIntentTurn({
    question,
    history: [],
    today: TODAY,
    saved: null,
    raw: null,
    people: DIRECTORY.map((row) => ({
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      preferredFirstName: null,
      locationIds: row.locationIds,
      title: row.positionName,
      primaryLocationName: null,
    })),
    stores: [
      { id: "loc-264", name: "Omaha, NE (West Dodge Rd)" },
      { id: "loc-66", name: "Kearney, NE" },
    ],
    headings: ["Dress Code for The Company", "Attendance"],
    templates: [
      { key: "dpoa", name: "Corrective Action Form" },
      { key: "coaching", name: "Coaching Form" },
    ],
    formInProgress: false,
    ...extra,
  });
}

describe("BH1 on the intent reading: the directory title does not come first", () => {
  const raw = { employee: "marlo quist", store: "dodge", title: "team member", warningLevel: "verbal", formType: "Corrective Action", formTurn: true };

  it(`${TITLE_FLAG}: Team Member, as the manager said`, () => {
    process.env[TITLE_FLAG] = "true";
    const decision = intentTurn(BH1, { raw });
    expect(decision.state.title).toBe("Team Member");
    expect(decision.state.warningLevel).toBe("verbal");
  });

  it("flag off: the directory title, as before", () => {
    expect(intentTurn(BH1, { raw }).state.title).toBe("Human Resources Generalist");
  });
});

/* ========================================================================= */
/* B16 — conv_mvnuc09q29llz4p / conv_mvnuc0i32bfvzpw (25 Oct 2026)           */
/* ========================================================================= */

/** Production QA, 25 Oct 2026 13:05 UTC (QA test names). */
const B16_TITLE = "create a coaching form for Test Employee at Kearney, she is an HR assistant, for being late on 10-20-26";
const B16_HR = "create a coaching form for Test Employee at Kearney for being late on 10-20-26 and send to HR";
const B16_FLAGS = ["TITLE_WHOLE_WORD_ENABLED", "PLACE_SPAN_GUARD_ENABLED"] as const;

describe('B16: "she is an HR assistant" is the stated title; "send to HR" is none', () => {
  it.each([
    ["the QA flags", [] as string[]],
    ["the QA flags with the remap fixes", ["REMAP_INCIDENT_FIX_ENABLED", "MANAGER_WORDS_ONLY_ENABLED"]],
  ])("on the live path with %s", async (_label, more) => {
    for (const name of [...B16_FLAGS, ...more, TITLE_FLAG]) process.env[name] = "true";
    const titled = await new Thread().say(B16_TITLE);
    expect(titled.formProposal?.templateKey).toBe("coaching");
    expect(titled.formProposal?.employeeRole).toBe("HR Assistant");
    expect(titled.content).not.toContain("What is their job title?");
    const hr = await new Thread().say(B16_HR);
    expect(hr.formProposal?.employeeRole ?? null).toBeNull();
  });

  it(`on the proposal flow (remap off) with ${TITLE_FLAG}: the card keeps HR Assistant and names Woven's title`, async () => {
    delete process.env.FORM_FULL_REMAP_ENABLED;
    for (const name of [...B16_FLAGS, TITLE_FLAG]) process.env[name] = "true";
    // The proposal flow asks "Did you mean Test Employee?" for the QA name (another fix), so a directory name stands in.
    const thread = new Thread();
    const titled = await thread.say(B16_TITLE.replace("Test Employee", "Marlo Quist"));
    expect(titled.formProposal?.employeeRole, JSON.stringify(titled)).toBe("HR Assistant");
    expect(titled.content, titled.content).toContain(
      "You described **Marlo Quist** as an HR Assistant; Woven lists their job title as **Human Resources Generalist**. The form keeps **HR Assistant**, the title you gave — tell me if it should be **Human Resources Generalist**.",
    );
    const id = await thread.create();
    expect(value(id, "job_title")).toBe("HR Assistant");
    const hr = await new Thread().say(B16_HR.replace("Test Employee", "Marlo Quist"));
    expect(hr.formProposal?.employeeRole).toBe("Human Resources Generalist");
    expect(hr.content).toContain("**Position:** Human Resources Generalist, from Woven");
  });

  it("flag off: no title read from it, as in production", async () => {
    for (const name of B16_FLAGS) process.env[name] = "true";
    const titled = await new Thread().say(B16_TITLE);
    expect(titled.formProposal?.employeeRole ?? null).toBeNull();
  });

  it(`on the intent reading with ${TITLE_FLAG}`, () => {
    for (const name of [...B16_FLAGS, TITLE_FLAG]) process.env[name] = "true";
    expect(intentTurn(B16_TITLE, { raw: { employee: "Test Employee", formType: "Coaching Form", formTurn: true } }).state.title).toBe(
      "HR Assistant",
    );
    expect(intentTurn(B16_HR, { raw: { employee: "Test Employee", formType: "Coaching Form", formTurn: true } }).state.title).not.toBe(
      "HR Assistant",
    );
  });
});

/* ========================================================================= */
/* BH3 — conv_mvi94k418pzwgmn                                                */
/* ========================================================================= */

/** Production, 21 Oct 2026 15:14 UTC, name replaced. */
const BH3_REQUEST = "create ca form for sela brandt for violating attendance on 10-20-26. sela did not call supervisor";
/** Production, 15:15:02 UTC. */
const BH3 = "verbal. payroll deduct is not applicable.";

describe(`BH3: "${BH3}" applies both facts`, () => {
  it("with the created form open: Type of Warning and payroll deduct", async () => {
    at("2026-10-21");
    const thread = new Thread();
    await thread.say(BH3_REQUEST);
    const id = await thread.create();
    const answer = await thread.say(BH3);
    expect(checked(id, "payroll_deduct")).toEqual(["no"]);
    expect(checked(id, "warning_type")).toEqual(["verbal"]);
    expect(answer.content).toMatch(/Type of Warning → Verbal Warning/);
  });

  it("on the card, before it is created", async () => {
    at("2026-10-21");
    const thread = new Thread();
    await thread.say(BH3_REQUEST);
    const card = await thread.say(BH3);
    expect(card.formProposal?.warningLevel).toBe("verbal");
    expect(card.formProposal?.payrollDeduct).toBe("no");
  });

  it("on the intent reading", () => {
    at("2026-10-21");
    process.env.WARNING_LEVEL_MANAGER_ONLY_ENABLED = "true";
    const decision = intentTurn(BH3, {
      history: [
        { role: "user", content: BH3_REQUEST },
        { role: "assistant", content: "Here is the Corrective Action Form.\n\nVerbal or written?\nIs payroll deduct applicable?" },
      ],
      saved: null,
      formInProgress: true,
    });
    expect(decision.state.warningLevel).toBe("verbal");
    expect(decision.question).toMatch(/verbal/i);
  });
});

/* ========================================================================= */
/* BH5 — conv_mvikc78w58v710y                                                */
/* ========================================================================= */

/** Production, 21 Oct 2026 20:26 UTC, name replaced (the closing quote is the manager's). */
const BH5 =
  "create a written CA for sela brandt for not attending the monthly meeting on 12-20-26. previous coaching: jba policy manual 5-8-26, verbal ca 10-2-26. payroll deduct not applicable”";
const FUTURE = "That date is in the future — is 12-20-26 right?";

describe(`BH5 (${DATE_FLAG}): an incident date in the future is asked about once`, () => {
  beforeEach(() => {
    at("2026-10-21");
  });

  it("asks once, alone, and keeps the date on the card", async () => {
    process.env[DATE_FLAG] = "true";
    const thread = new Thread();
    const card = await thread.say(BH5);
    expect(card.formProposal?.formDate).toBe("2026-12-20");
    expect(card.content).toBe(FUTURE);
  });

  it.each([["yes"], ["that's right"], ["12-20-26 is right"]])('"%s" keeps 12-20-26 and is not asked again', async (reply) => {
    process.env[DATE_FLAG] = "true";
    const thread = new Thread();
    await thread.say(BH5);
    const answer = await thread.say(reply);
    expect(answer.formProposal?.formDate).toBe("2026-12-20");
    expect(answer.content).not.toContain("in the future");
    expect(answer.formProposal?.payrollDeduct).toBe("no");
    const later = await thread.say("payroll deduct not applicable");
    expect(later.content).not.toContain("in the future");
  });

  it('flags off: "yes" after the card is not read as the payroll answer (payroll-deduct.ts, QA 25 Oct 2026)', async () => {
    const thread = new Thread();
    const card = await thread.say(BH5);
    expect(card.formProposal?.payrollDeduct).toBe("no");
    const answer = await thread.say("yes");
    expect(answer.formProposal?.payrollDeduct).toBe("no");
  });

  it("a corrected date is used, and not asked about", async () => {
    process.env[DATE_FLAG] = "true";
    const thread = new Thread();
    await thread.say(BH5);
    const answer = await thread.say("sorry, it was 10-20-26");
    expect(answer.formProposal?.formDate).toBe("2026-10-20");
    expect(answer.content).not.toContain("in the future");
  });

  it("a follow-up date in the future is not the incident date and is not asked about", async () => {
    process.env[DATE_FLAG] = "true";
    const card = await new Thread().say("create a coaching form for sela brandt for being late on 10-20-26, follow up on 11-15-26");
    expect(card.formProposal?.formDate).toBe("2026-10-20");
    expect(card.content).not.toContain("in the future");
  });

  it("a date not after today is never asked about", async () => {
    process.env[DATE_FLAG] = "true";
    const card = await new Thread().say(BH5.replace("12-20-26", "10-21-26"));
    expect(card.content).not.toContain("in the future");
  });

  it("flag off: the reply and the card are what the remap wrote, byte for byte", async () => {
    const off = await new Thread().say(BH5);
    expect(off.content).not.toContain("in the future");
    const asResponse = { ...off, citations: [] };
    expect(withFutureDateQuestion(asResponse, { today: TODAY, history: [] })).toBe(asResponse);
    process.env[DATE_FLAG] = "true";
    const on = await new Thread().say(BH5);
    expect(on.formProposal).toEqual(off.formProposal);
    expect(on.content).toBe(FUTURE);
  });

  it("on the proposal flow (remap off): asked once, then the date stays", async () => {
    delete process.env.FORM_FULL_REMAP_ENABLED;
    process.env[DATE_FLAG] = "true";
    const thread = new Thread();
    const card = await thread.say(BH5);
    expect(card.formProposal?.formDate).toBe("2026-12-20");
    expect(card.content).toBe(FUTURE);
    const answer = await thread.say("yes");
    expect(answer.formProposal?.formDate).toBe("2026-12-20");
    expect(answer.content).not.toContain("in the future");
    expect(answer.formProposal?.payrollDeduct).toBe("no");
  });

  it("a review form's future date is not asked about", async () => {
    process.env[DATE_FLAG] = "true";
    const response = {
      content: "Here is the Policy Review.",
      citations: [],
      formProposal: { templateKey: "policy-review", formDate: "2026-12-20" } as ChatFormProposal,
    };
    expect(withFutureDateQuestion(response, { today: TODAY, history: [] })).toBe(response);
  });
});
