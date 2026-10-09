import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { ChatMessage, ChatFormProposal } from "@/types";

vi.mock("@/config/company/locations", async () =>
  (await import("@/test/fixtures/reference-roster")).referenceRosterModule(),
);

/**
 * ============================================================================
 * THE PRODUCTION REPORT, THROUGH POST /api/chat
 * ============================================================================
 *
 *   "create a ca form for paulyne test, she was late again for 30 mins today.
 *    given verbal warning on 9/21"
 *
 * came back with Written Warning ticked. `corrective-action-warning-level-e2e`
 * proves the fix on the forms routes; this proves it on the route a manager's
 * browser actually calls: every turn goes through `POST /api/chat` — the
 * correction, then the revision, then the ordinary answer, in the route's own
 * order — and the form is created and drafted through the browser's own
 * orchestrator.
 *
 * Real: the chat route, `answerQuestion`, the proposal, the corrections, the
 * forms routes and the seeded template library. Faked: the identity provider,
 * the model (which ticks Written Warning on every draft, as it did in
 * production), the knowledge base and the database (the in-memory Supabase
 * fake). No production record or draft is read or written.
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

const state = vi.hoisted(() => ({ modelCalls: 0, chatModelCalls: 0 }));

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

// The drafting model, as it behaved in production: Written Warning, every time.
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
                checked: { warning_type: ["written"], offense_type: ["tardiness"] },
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
const pdfRoute = await import("../forms/instances/[id]/pdf/route");

const SENTENCE =
  "create a ca form for paulyne test, she was late again for 30 mins today. given verbal warning on 9/21";
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
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-09T15:00:00Z"));
  await ensureTemplateLibrary("system");
});

describe("the exact production sentence, through POST /api/chat", () => {
  it("ticks Verbal from \"given verbal warning\", lists the 9/21 history, and never escalates to Written", async () => {
    const thread = new Thread();
    const answer = await thread.say(SENTENCE);

    // The owner's rule (9 Oct 2026): "given verbal warning" is the level this form records.
    expect(answer.formProposal?.templateKey).toBe("dpoa");
    expect(answer.formProposal?.employeeName).toBe("Paulyne Test");
    expect(answer.formProposal?.warningLevel).toBe("verbal");
    expect(answer.content).toContain("**Type of warning:** Verbal Warning, as you said");
    expect(answer.content).not.toContain(QUESTION);
    expect(state.chatModelCalls).toBe(0);

    const id = await thread.create();
    const form = await values(id);

    // Previous corrective action: Verbal Warning — 09/21/2026.
    expect(form.prior_actions?.value).toBe("Verbal warning — signed 09/21/2026");
    // Current offense: tardiness, 30 minutes late.
    expect(form.offense_type?.checked).toEqual(["tardiness"]);
    expect(form.observation?.value).toMatch(/30 minutes late/);
    // Verbal only — the model's Written tick never landed.
    expect(state.modelCalls).toBe(1);
    expect(form.warning_type?.checked).toEqual(["verbal"]);
    expect(store.form_instances).toHaveLength(1);

    // The printed form carries the history line.
    joinOverview();
    const pdf = await pdfRoute.GET(new Request(`https://app.test/api/forms/instances/${id}/pdf`), {
      params: Promise.resolve({ id }),
    });
    expect(pdf.status).toBe(200);
  });

  it("an explicit Verbal Warning selects only Verbal", async () => {
    const thread = new Thread();
    await thread.say(SENTENCE);
    const answer = await thread.say("give her a verbal warning");
    expect(answer.formProposal?.warningLevel).toBe("verbal");
    expect(answer.content).toContain("**Type of warning:** Verbal Warning, as you said");

    const id = await thread.create();
    const form = await values(id);
    expect(form.warning_type?.checked).toEqual(["verbal"]);
    expect(form.prior_actions?.value).toBe("Verbal warning — signed 09/21/2026");
  });

  it("an explicit Written Warning selects only Written", async () => {
    const thread = new Thread();
    await thread.say(SENTENCE);
    const answer = await thread.say("make it a written warning");
    expect(answer.formProposal?.warningLevel).toBe("written");

    const id = await thread.create();
    expect((await values(id)).warning_type?.checked).toEqual(["written"]);
  });

  it("changing Written to Verbal in chat updates the same draft and keeps everything else", async () => {
    const thread = new Thread();
    await thread.say(SENTENCE);
    await thread.say("make it a written warning");
    await thread.say("no payroll deduct");
    const id = await thread.create();

    const before = await values(id);
    expect(before.warning_type?.checked).toEqual(["written"]);
    expect(before.payroll_deduct?.checked).toEqual(["no"]);

    const correction = await thread.say("change written warning to verbal warning");
    expect(correction.formUpdate).toEqual({ instanceId: id, updated: ["warning_type"] });
    expect(correction.formProposal).toBeUndefined();
    expect(correction.content).toMatch(/Type of Warning → Verbal Warning \(Written Warning unticked\)/);

    const after = await values(id);
    expect(after.warning_type?.checked).toEqual(["verbal"]);
    for (const key of Object.keys(before).filter((key) => key !== "warning_type")) {
      expect({ key, value: after[key]?.value, checked: after[key]?.checked }).toEqual({
        key,
        value: before[key]?.value,
        checked: before[key]?.checked,
      });
    }
    // One form: the correction did not propose or create another.
    expect(store.form_instances).toHaveLength(1);
    expect(state.modelCalls).toBe(1);
  });

  it("a one-word answer after the draft exists lands on that draft", async () => {
    const thread = new Thread();
    await thread.say(SENTENCE);
    const id = await thread.create();

    const reply = await thread.say("verbal");
    expect(reply.formUpdate).toEqual({ instanceId: id, updated: ["warning_type"] });
    expect((await values(id)).warning_type?.checked).toEqual(["verbal"]);
    expect(store.form_instances).toHaveLength(1);
  });
});
