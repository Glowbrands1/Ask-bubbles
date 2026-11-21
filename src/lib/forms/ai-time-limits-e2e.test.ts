import { rosterResultFor } from "@/test/roster-result";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { AccessScope, ChatMessage } from "@/types";

/**
 * ============================================================================
 * AI TIME LIMITS: CHAT REVISION (QA, 14 Nov 2026; ported from the sibling app)
 * ============================================================================
 *
 * The chat revision ran on the SDK's 10-minute default: a stalled model held
 * the chat route until the platform killed it at maxDuration (120 s), and the
 * manager got the platform's error, not a reply. Now each revision call ends
 * at the helper limit (AI_HELPER_TIMEOUT_MS, 1 s here) with a short message to
 * show, a server log line (route, call, duration; no form text), and the form
 * left as it was.
 *
 * Driven through the real proposal flow, `createInlineForm`, the real create /
 * draft / review routes and the real `reviseActiveForm`, with the harness of
 * `corrective-action-chat-edits-e2e.test.ts` (its synthetic Pat Rivera). Only
 * the revision model stalls. The drafting route's own limit is not ported yet
 * (QA: the create/draft route hooks come later), so it is not tested here.
 */

const store: FakeStore = {
  form_instances: [],
  form_instance_values: [],
  form_instance_events: [],
  form_template_versions: [],
  form_templates: [],
  form_template_current: [],
  form_template_assets: [],
};

const state = vi.hoisted(() => ({
  role: "admin",
  scope: null as unknown,
  draft: {} as { values?: Record<string, unknown>; checked?: Record<string, unknown> },
  /** The system prompt each model call was given. */
  systems: [] as string[],
  directory: [] as unknown[],
  manual: null as null | { chunks: unknown[] },
  manualProblem: null as null | "ambiguous",
  /** The tool whose call stalls: the request is accepted and nothing comes back until its signal aborts. */
  stall: null as string | null,
  reviseCalls: 0,
  reviseOptions: [] as unknown[],
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

vi.mock("@/lib/auth/server", async () => {
  const { AuthError } = await import("@/lib/auth/types");
  const { DEFAULT_PERMISSION_MATRIX, hasPermission } = await import("@/lib/permissions");
  return {
    authorizeRequest: async (_request: Request, permission: string) => {
      if (!hasPermission(DEFAULT_PERMISSION_MATRIX, state.role as never, permission as never)) {
        throw new AuthError("forbidden", "Your role does not have permission to do that.");
      }
      return {
        identity: {
          subject: "admin-1",
          email: "admin@example.com",
          displayName: "Admin",
          role: state.role,
          scope: state.scope,
          verified: true,
        },
        permission,
        provider: "supabase",
      };
    },
  };
});

vi.mock("@/lib/ai/anthropic", () => ({
  getAnthropicClient: () => ({
    messages: {
      create: async (request: { system?: unknown; tool_choice?: { name?: string } }, options?: { signal?: AbortSignal }) => {
        state.systems.push(typeof request.system === "string" ? request.system : JSON.stringify(request.system ?? ""));
        const tool = request.tool_choice?.name ?? "write_form_fields";
        if (tool === "revise_form_fields") {
          state.reviseCalls += 1;
          state.reviseOptions.push(options);
        }
        if (state.stall === tool) {
          return new Promise((_resolve, reject) => options?.signal?.addEventListener("abort", () => reject(new Error("Request was aborted."))));
        }
        return {
          stop_reason: "tool_use",
          content: [{ type: "tool_use", name: tool, input: state.draft }],
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
    async fetchRoleGrounding(role: { id: string }) {
      return {
        ok: true,
        grounding: {
          role: { id: role.id },
          documentId: "doc-progression",
          documentTitle: "ASK BUBBLES PERFORMANCE MANAGEMENT FRAMEWORK KB TEXT",
          matchedBy: "tag",
          rows: [
            {
              chunk_id: "pmf-0",
              document_id: "doc-progression",
              document_title: "ASK BUBBLES PERFORMANCE MANAGEMENT FRAMEWORK KB TEXT",
              category: "leadership_coaching",
              locator: "SECTION 2",
              page: null,
              section: null,
              content: "Solve the issue at the lowest appropriate level.",
              similarity: 0,
            },
          ],
        },
      };
    }
    async fetchOfficialPolicyManual() {
      if (state.manualProblem) {
        return { ok: false, reason: "Two documents claim to be the manual.", problem: state.manualProblem };
      }
      if (!state.manual) return { ok: false, reason: "The official policy manual could not be read." };
      return {
        ok: true,
        documentId: "doc-manual",
        documentTitle: "2025 JBA Policy Manual - Edited 5-2025",
        documentCategory: "policies_compliance",
        matchedBy: "tag",
        chunks: state.manual.chunks,
      };
    }
  },
}));

process.env.NEXT_PUBLIC_DEMO_MODE = "false";

vi.mock("@/lib/forms/employee-roster", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/forms/employee-roster")>();
  return {
    ...actual,
    loadScopedRoster: async (scope: AccessScope | null) => actual.scopeRoster(state.directory as never, scope),
    loadScopedRosterResult: async (scope: AccessScope | null) =>
      rosterResultFor(actual.scopeRoster, state.directory as never, scope),
  };
});

const { ensureTemplateLibrary, listTemplateSummaries } = await import("@/lib/forms/repository");
const { proposeFormForTurn } = await import("@/lib/ai/form-proposal");
const { createInlineForm } = await import("@/features/chat/create-inline-form");
const { reviseActiveForm } = await import("@/lib/forms/chat-revision");
const instancesRoute = await import("@/app/api/forms/instances/route");
const instanceRoute = await import("@/app/api/forms/instances/[id]/route");
const draftRoute = await import("@/app/api/forms/instances/[id]/draft/route");

function joinOverview() {
  for (const row of store.form_instances ?? []) {
    const template = store.form_templates!.find((entry) => entry.id === row.template_id);
    const version = store.form_template_versions.find((entry) => entry.id === row.template_version_id);
    Object.assign(row, {
      form_date: row.form_date ?? "2026-10-20",
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

async function review(id: string) {
  joinOverview();
  const response = await instanceRoute.GET(new Request(`https://app.test/api/forms/instances/${id}`), {
    params: Promise.resolve({ id }),
  });
  expect(response.status).toBe(200);
  return (await response.json()) as {
    values: {
      fieldKey: string;
      value: string | null;
      checked: string[];
      filledBy: string;
      provenance?: Record<string, unknown>;
    }[];
  };
}

const row = async (id: string, key: string) => (await review(id)).values.find((entry) => entry.fieldKey === key);

let sequence = 0;
const said = (content: string): ChatMessage => ({
  id: `m${(sequence += 1)}`,
  role: "user",
  content,
  createdAt: "2026-10-20T15:00:00Z",
});
const answered = (content: string): ChatMessage =>
  ({ id: `a${(sequence += 1)}`, role: "assistant", content, createdAt: "2026-10-20T15:00:01Z" }) as ChatMessage;

const chat = () => new Request("https://app.test/api/chat", { method: "POST", headers: { cookie: "session=abc" } });

/* Synthetic people only. Positions are what Woven would carry. */
const DIRECTORY = [
  { id: "e-1", firstName: "Pat", lastName: "Rivera", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Operator" },
];

/*
 * THE MANUAL AS THE KNOWLEDGE BASE HOLDS IT: each section on the sheet it is
 * printed on, with the page the manual prints. Wording shortened, never
 * reworded.
 */
const sheet = (chunkIndex: number, heading: string, page: number, text: string) => ({
  chunkIndex,
  chunkId: `c-${chunkIndex}`,
  locator: `Page ${page + 1}`,
  page: page + 1,
  printedPage: page,
  sections: [{ heading, page }],
  section: heading,
  content: `${page} | P a g e\n${heading}\n${text}`,
});

const MANUAL = {
  chunks: [
    sheet(33, "Attendance", 14, "It is the responsibility of each employee to know his or her work schedule and to always be on\ntime."),
    sheet(34, "Late Opening", 15, "When an employee assigned to open a location is unable to open the location at the proper\ntime, the employee must notify the manager as soon as possible."),
    sheet(35, "Dress Code for The Company", 15, "The Company Employees are to keep a neat, clean, professional appearance at all times."),
    sheet(64, "Visitors in the Workplace", 30, "To provide for the safety and security of Employees and the facilities, only authorized visitors are\nallowed in the workplace."),
    sheet(70, "Cell Phone Usage", 32, "Personal cell phone use is limited to breaks and meal periods."),
  ],
};

/** A late arrival — not an opening — so the first draft cites Attendance alone. */
const LATE =
  "Create a corrective action for Pat Rivera. She was 20 minutes late for her 2pm shift on 10/20. Verbal warning. No payroll deduct.";

/** The production shape: a Corrective Action Form created in chat, then edited. */
async function createdForm(request = LATE, draft: typeof state.draft = {
  values: {
    observation: "Observed:\nPat Rivera arrived 20 minutes late for a 2pm shift on 10/20.\nExpectation:\nArrive on time.",
  },
  checked: { warning_type: ["verbal"], offense_type: ["tardiness"] },
}) {
  const message = said(request);
  const response = await proposeFormForTurn({
    history: [],
    question: message.content,
    questionMessageId: message.id,
    actor: { role: state.role as never, scope: state.scope as AccessScope },
    summaries: await listTemplateSummaries(),
    today: "2026-10-20",
    policyManual: async () => (state.manual?.chunks as never) ?? null,
  });
  const proposal = response!.formProposal!;
  expect(proposal.templateKey).toBe("dpoa");
  expect(proposal.employeeName).toBe("Pat Rivera");
  state.draft = draft;
  const { reference } = await createInlineForm({ proposal, messages: [message], call, onCreated: () => {} });
  const history: ChatMessage[] = [
    message,
    { ...answered(response!.content), formProposal: proposal } as ChatMessage,
  ];
  return { id: reference.instanceId, history };
}

process.env.AI_HELPER_TIMEOUT_MS = "1000";

const { AI_TIMEOUT_MESSAGE } = await import("@/lib/ai/time-limit");
const { errorResponse } = await import("@/lib/api/respond");

let errors: { mock: { calls: unknown[][] } };

beforeEach(async () => {
  for (const key of Object.keys(store) as (keyof FakeStore)[]) store[key] = [];
  state.role = "admin";
  state.scope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
  state.draft = { values: {}, checked: {} };
  state.systems = [];
  state.directory = DIRECTORY;
  state.manual = MANUAL;
  state.manualProblem = null;
  state.stall = null;
  state.reviseCalls = 0;
  state.reviseOptions = [];
  sequence = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T15:00:00Z"));
  await ensureTemplateLibrary("system");
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const timeoutLines = (call: string) =>
  errors.mock.calls.map((args: unknown[]) => String(args[0])).filter((line: string) => line.startsWith("[ai.timeout]") && line.includes(`call=${call} `));

describe("a stalled chat revision", () => {
  it("ends at the helper limit with the short message for the chat reply and a log line; the form keeps what it had", async () => {
    const { id, history } = await createdForm();
    const before = (await row(id, "observation"))?.value;
    expect(before).toContain("Pat Rivera arrived 20 minutes late");
    state.stall = "revise_form_fields";
    const started = performance.now();
    const failure = await reviseActiveForm({
      request: chat(),
      instanceId: id,
      question: "reword the observation to sound more professional",
      history,
      today: "2026-10-20",
    }).then(
      () => null,
      (error: unknown) => error,
    );
    // The limit, not the platform's 120 s, ended it.
    expect(performance.now() - started).toBeLessThan(10_000);
    expect(state.reviseCalls).toBe(1);
    // The chat route answers this error through errorResponse: the manager reads the message, never an empty reply.
    const response = errorResponse(failure, "POST /api/chat");
    expect(response.status).toBe(504);
    expect(((await response.json()) as { error: string }).error).toBe(AI_TIMEOUT_MESSAGE);
    expect(timeoutLines("chat_revision")).toEqual([
      expect.stringMatching(/^\[ai\.timeout\] route=unknown call=chat_revision duration_ms=\d+ limit_ms=1000$/),
    ]);
    // Nothing from the form or the manager in the log.
    expect(errors.mock.calls.flat().join("\n")).not.toMatch(/Pat|Rivera|late/);
    expect((await row(id, "observation"))?.value).toBe(before);
  }, 20_000);

  it("a revision in time is saved as before; its call carries the limit's signal and the SDK's 2 retries", async () => {
    const { id, history } = await createdForm();
    state.draft = { values: { action_plan: "Pat will retake the attendance training this week." }, checked: {} };
    const answer = await reviseActiveForm({
      request: chat(),
      instanceId: id,
      question: "change the action plan to: Pat will retake the attendance training this week.",
      history,
      today: "2026-10-20",
    });
    expect(answer?.content).toMatch(/Updated the \*\*Corrective Action Form\*\* for \*\*Pat Rivera\*\*/);
    expect((await row(id, "action_plan"))?.value).toMatch(/^Pat will retake the attendance training this week\./);
    expect(state.reviseOptions[0]).toMatchObject({ timeout: 1000, maxRetries: 2 });
    expect((state.reviseOptions[0] as { signal: AbortSignal }).signal).toBeInstanceOf(AbortSignal);
    expect(timeoutLines("chat_revision")).toEqual([]);
  });
});
