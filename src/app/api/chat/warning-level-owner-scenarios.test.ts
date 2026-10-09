import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { ChatMessage, ChatFormProposal } from "@/types";

vi.mock("@/config/company/locations", async () =>
  (await import("@/test/fixtures/reference-roster")).referenceRosterModule(),
);

/**
 * ============================================================================
 * THE OWNER'S WARNING-LEVEL ACCEPTANCE LIST, THROUGH POST /api/chat
 * ============================================================================
 *
 * One test per item the owner asked PR #10 to prove (9 Oct 2026), each driven
 * the way a manager's browser drives it: every turn through POST /api/chat,
 * the card created through the browser's own orchestrator, the draft through
 * the drafting route, corrections through chat, and the stored values read
 * back through GET /api/forms/instances/[id].
 *
 * THE DRAFTING MODEL ESCALATES ON PURPOSE: it ticks Written Warning on every
 * draft (as it did in production), or Termination where a test says so, so a
 * pass means the code — not a well-behaved model — kept the level.
 *
 * Faked: identity, the model, the knowledge base and the database (in-memory).
 * Synthetic people only.
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

const state = vi.hoisted(() => ({ modelCalls: 0, chatModelCalls: 0, modelTicks: ["written"] as string[] }));

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
          scope: { level: "location", primaryAreaId: "loc-0310", alsoCoversAreaIds: [] },
          verified: true,
        },
        permission,
        provider: "supabase",
      };
    },
  };
});

// Analytics write enum rows only; they are not what is under test.
vi.mock("@/lib/analytics/record", () => ({
  openTurn: async () => "turn-qa",
  closeTurn: async () => {},
  recordActivity: async () => {},
  recordActivityAsync: () => {},
}));

vi.mock("@/lib/ai/call-claude", () => ({
  callClaude: async () => {
    state.chatModelCalls += 1;
    return "A grounded answer.";
  },
}));

// The drafting model, escalating on every draft: Written Warning by default, Termination when told to.
vi.mock("@/lib/ai/anthropic", () => ({
  getAnthropicClient: () => ({
    messages: {
      create: async () => {
        state.modelCalls += 1;
        return {
          content: [
            {
              type: "tool_use",
              name: "write_form_fields",
              input: {
                values: {
                  observation:
                    "Observed:\nPaulyne arrived 30 minutes late for the scheduled shift today.\n\nExpectation:\nEmployees are expected to arrive on time for every scheduled shift.\n\nGoing Forward:\nPaulyne should plan to arrive early.",
                },
                checked: { warning_type: state.modelTicks, offense_type: ["tardiness"] },
              },
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
    async fetchRoleGrounding() {
      const row = (index: number, locator: string, content: string) => ({
        chunk_id: `pmf-${index}`,
        document_id: "doc-progression",
        document_title: "ASK BUBBLES PERFORMANCE MANAGEMENT FRAMEWORK KB TEXT",
        category: "leadership_coaching",
        locator,
        page: null,
        section: null,
        content,
        similarity: 0,
      });
      return {
        ok: true,
        grounding: {
          role: { id: "performance_management_framework" },
          documentId: "doc-progression",
          documentTitle: "ASK BUBBLES PERFORMANCE MANAGEMENT FRAMEWORK KB TEXT",
          matchedBy: "tag",
          rows: [row(0, "SECTION 2 – PERFORMANCE MANAGEMENT LADDER", "Solve the issue at the lowest appropriate level.")],
          presentGroups: ["escalation_ladder"],
        },
      };
    }
    async fetchOfficialPolicyManual() {
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

process.env.NEXT_PUBLIC_DEMO_MODE = "false";

const { ensureTemplateLibrary } = await import("@/lib/forms/repository");
const { createInlineForm } = await import("@/features/chat/create-inline-form");
const chatRoute = await import("./route");
const instancesRoute = await import("../forms/instances/route");
const instanceRoute = await import("../forms/instances/[id]/route");
const draftRoute = await import("../forms/instances/[id]/draft/route");

const QUESTION = "Is this new corrective action a **Verbal Warning** or a **Written Warning**?";

function joinOverview() {
  for (const row of store.form_instances ?? []) {
    const template = store.form_templates!.find((entry) => entry.id === row.template_id);
    const version = store.form_template_versions.find((entry) => entry.id === row.template_version_id);
    Object.assign(row, {
      form_date: row.form_date ?? "2026-10-09",
      template_key: template?.key,
      template_name: template?.name,
      layout_family: template?.layout_family,
      template_version: version?.version,
    });
  }
}

/** The browser's `formsFetch`, dispatched straight into the route handlers. */
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

/**
 * The chat thread as the browser holds it, with every turn sent through
 * POST /api/chat exactly as `chat-screen.tsx` sends it.
 */
class Thread {
  readonly messages: ChatMessage[] = [];
  proposal: ChatFormProposal | null = null;
  instanceId: string | null = null;
  private sequence = 0;

  async say(question: string) {
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
    const payload = (await response.json()) as {
      content: string;
      formProposal?: ChatFormProposal;
      formUpdate?: { instanceId: string; updated: string[] };
      error?: string;
    };
    expect(response.status, JSON.stringify(payload)).toBe(200);
    this.messages.push(
      { id, role: "user", content: question, createdAt: "2026-10-09T15:00:00Z" } as ChatMessage,
      {
        id: `a${this.sequence}`,
        role: "assistant",
        content: payload.content,
        createdAt: "2026-10-09T15:00:01Z",
        ...(payload.formProposal ? { formProposal: payload.formProposal } : {}),
      } as ChatMessage,
    );
    if (payload.formProposal) this.proposal = payload.formProposal;
    return payload;
  }

  /** The Create draft button. */
  async create() {
    const result = await createInlineForm({
      proposal: this.proposal!,
      messages: this.messages.filter((message) => message.role === "user"),
      call,
      onCreated: () => {},
    });
    expect(result.draftWarning).toBeNull();
    // The fake numbers rows `fake-N`; the chat route only accepts a UUID for the open form.
    const uuid = randomUUID();
    for (const table of ["form_instances", "form_instance_values", "form_instance_events"] as const) {
      for (const row of store[table]) {
        if (row.id === result.reference.instanceId) row.id = uuid;
        if (row.instance_id === result.reference.instanceId) row.instance_id = uuid;
      }
    }
    this.instanceId = uuid;
    return uuid;
  }
}

async function values(id: string) {
  joinOverview();
  const response = await instanceRoute.GET(new Request(`https://app.test/api/forms/instances/${id}`), {
    params: Promise.resolve({ id }),
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    values: { fieldKey: string; value: string | null; checked: string[]; filledBy: string }[];
  };
  return Object.fromEntries(body.values.map((row) => [row.fieldKey, row]));
}

beforeEach(async () => {
  for (const key of Object.keys(store) as (keyof FakeStore)[]) store[key] = [];
  state.modelCalls = 0;
  state.chatModelCalls = 0;
  state.modelTicks = ["written"];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-09T15:00:00Z"));
  await ensureTemplateLibrary("system");
});


const checked = (form: Record<string, { checked: string[] } | undefined>, key: string) => form[key]?.checked ?? [];

describe("the owner's acceptance list for PR #10", () => {
  it("1. a prior verbal warning does not make the current action a written warning", async () => {
    const thread = new Thread();
    const answer = await thread.say(
      "create a ca form for jordan testperson, late again 30 mins today. she got a verbal warning on 9/21",
    );
    expect(answer.formProposal?.warningLevel ?? null).toBeNull();
    expect(answer.content).toContain(QUESTION);
    const form = await values(await thread.create());
    expect(checked(form, "warning_type")).toEqual([]);
  });

  it("2. a prior written warning does not make the current action a termination", async () => {
    state.modelTicks = ["termination"];
    const thread = new Thread();
    const answer = await thread.say(
      "create a ca form for jordan testperson, late again today. she already had a written warning on 9/15",
    );
    expect(answer.formProposal?.warningLevel ?? null).toBeNull();
    expect(answer.content).toContain(QUESTION);
    const form = await values(await thread.create());
    expect(checked(form, "warning_type")).not.toContain("termination");
    expect(checked(form, "warning_type")).toEqual([]);
    expect(form.prior_actions?.value).toMatch(/Written warning — signed 09\/15\/2026/);
  });

  it("3. a stated current level is preserved over the model's escalation", async () => {
    const thread = new Thread();
    const answer = await thread.say("jordan testperson needs a verbal warning for tardiness, she was 20 minutes late today");
    expect(answer.formProposal?.warningLevel).toBe("verbal");
    expect(answer.content).toContain("Verbal Warning, as you said");
    const form = await values(await thread.create());
    expect(checked(form, "warning_type")).toEqual(["verbal"]);
    expect(state.modelCalls).toBe(1);
  });

  it("4. historical warnings are recorded as history, oldest first, not as the current level", async () => {
    const thread = new Thread();
    await thread.say(
      "create a corrective action for jordan testperson, late again today. she got a verbal warning on 8/4 and a written warning on 9/15",
    );
    const form = await values(await thread.create());
    expect(form.prior_actions?.value).toBe("Verbal warning — signed 08/04/2026\nWritten warning — signed 09/15/2026");
    expect(checked(form, "warning_type")).toEqual([]);
  });

  it("5. an explicit instruction for this form takes precedence over the history around it", async () => {
    const thread = new Thread();
    const answer = await thread.say(
      "create a ca for jordan testperson. despite her written warning on 9/15, give her a verbal warning for this one",
    );
    expect(answer.formProposal?.warningLevel).toBe("verbal");
    const form = await values(await thread.create());
    expect(checked(form, "warning_type")).toEqual(["verbal"]);
    expect(form.prior_actions?.value).toMatch(/Written warning — signed 09\/15\/2026/);
  });

  it.each([
    "create a ca for jordan testperson, not sure if verbal or written warning",
    "create a ca for jordan testperson, should this be a written warning?",
    "create a ca for jordan testperson, she got a warning before",
  ])("6. an ambiguous level is asked about, never guessed: %j", async (message) => {
    const thread = new Thread();
    const answer = await thread.say(message);
    expect(answer.formProposal?.warningLevel ?? null).toBeNull();
    expect(answer.content).toContain(QUESTION);
    const form = await values(await thread.create());
    expect(checked(form, "warning_type")).toEqual([]);
  });

  it.each([
    ["she got a verbal warning yesterday", "verbal"],
    ["she got a written warning two weeks ago", "written"],
    ["she received a verbal warning last month", "verbal"],
  ])("7. a dated or relative prior warning does not set this form's level: %j", async (history) => {
    const thread = new Thread();
    const answer = await thread.say(`create a ca for jordan testperson, late again today. ${history}`);
    expect(answer.formProposal?.warningLevel ?? null).toBeNull();
    const form = await values(await thread.create());
    expect(checked(form, "warning_type")).toEqual([]);
  });

  /* The owner's rule, 9 Oct 2026: "gave / given / give" + a level ticks that level, whatever its date. */
  it("7b. \"she was given a written warning on september 21\" ticks Written, and the date is history", async () => {
    const thread = new Thread();
    const answer = await thread.say(
      "create a ca for jordan testperson, late again today. she was given a written warning on september 21",
    );
    expect(answer.formProposal?.warningLevel).toBe("written");
    const form = await values(await thread.create());
    expect(checked(form, "warning_type")).toEqual(["written"]);
  });

  it("8. a correction to the current level persists across later turns and a reopen", async () => {
    const thread = new Thread();
    await thread.say("jordan testperson needs a written warning for tardiness, 30 minutes late today");
    const id = await thread.create();
    expect(checked(await values(id), "warning_type")).toEqual(["written"]);

    const correction = await thread.say("make it a verbal warning");
    expect(correction.formUpdate).toEqual({ instanceId: id, updated: ["warning_type"] });
    expect(checked(await values(id), "warning_type")).toEqual(["verbal"]);

    await thread.say("what does the attendance policy say about tardiness?");
    await thread.say("no payroll deduct");
    const reopened = await values(id);
    expect(checked(reopened, "warning_type")).toEqual(["verbal"]);
    expect(reopened.warning_type?.filledBy).toBe("manager");
    expect(store.form_instances).toHaveLength(1);
  });

  it("9. editing the warning level leaves every other field exactly as it was", async () => {
    const thread = new Thread();
    await thread.say("jordan testperson needs a written warning for tardiness, 30 minutes late today. she got a verbal warning on 9/21");
    await thread.say("no payroll deduct");
    const id = await thread.create();
    const before = await values(id);

    await thread.say("change it to a verbal warning");
    const after = await values(id);
    expect(checked(after, "warning_type")).toEqual(["verbal"]);
    for (const key of Object.keys(before).filter((key) => key !== "warning_type")) {
      expect({ key, value: after[key]?.value, checked: after[key]?.checked, by: after[key]?.filledBy }).toEqual({
        key,
        value: before[key]?.value,
        checked: before[key]?.checked,
        by: before[key]?.filledBy,
      });
    }
  });
});
