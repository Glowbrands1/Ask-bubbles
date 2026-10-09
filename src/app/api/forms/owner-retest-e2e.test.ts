import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { ChatFormProposal, ChatMessage } from "@/types";

vi.mock("@/config/company/locations", async () =>
  (await import("@/test/fixtures/reference-roster")).referenceRosterModule(),
);

/**
 * ============================================================================
 * THE OWNER'S RETEST, 9 OCT 2026 — VARIANTS, CORRECTIONS AND OLD CARDS
 * ============================================================================
 *
 * The retest screenshots came from the PR #9 preview, which is built on the
 * production commit and does not carry PR #8's chat fixes (Vercel runtime
 * logs). These are the exact retest prompts — including "Jordan Testpers" as
 * typed — and the variants the owner asked for, through the same real
 * pipeline as `multi-form-chat-e2e.test.ts`: POST /api/chat, then the Create
 * button's `createInlineForm` into POST /api/forms/instances and .../draft,
 * asserted on the stored rows. All people are synthetic.
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

const SOC_OPENING =
  "The Company expects Employees to follow rules of conduct that will protect the interests and\n" +
  "safety of all customers, Employees, and The Company.\n" +
  "The following are examples (non-inclusive list) of infractions that may result in disciplinary\n" +
  "action:\n" +
  "o Failing to follow the policies and procedures of The Company";

function manual(withShortages: boolean) {
  return {
    ok: true,
    documentId: "doc-woven-manual",
    documentTitle: "2025 JBA Policy Manual - Edited 5-2025",
    matchedBy: "fallback",
    chunks: [
      {
        chunkIndex: 0,
        page: 1,
        printedPage: null,
        sections: [],
        section: null,
        content: "2025 JB & Associates Employment Policy Manual. This manual is designed to acquaint employees.",
      },
      {
        chunkIndex: 36,
        page: 13,
        printedPage: 12,
        sections: [{ heading: "Standards of Conduct", page: 12 }],
        section: "Standards of Conduct",
        content: `Standards of Conduct\n${SOC_OPENING}`,
      },
      {
        chunkIndex: 37,
        page: 13,
        printedPage: 12,
        sections: [],
        section: "Standards of Conduct",
        content:
          "o Lack of sales performance\no Giving unauthorized discounts\n" +
          (withShortages ? "o Register / Bank shortages\n" : "") +
          "o Insubordination -the refusal to follow the directions of the manager.",
      },
      {
        chunkIndex: 69,
        page: 21,
        printedPage: 21,
        sections: [{ heading: "Background Checks", page: 21 }],
        section: "Background Checks",
        content: "Background Checks\nEmployees are subject to background checks for certain positions.",
      },
    ],
  };
}

const state = vi.hoisted(() => ({
  manual: null as unknown,
  /** What the model answers on every draft: deliberately the WRONG level and no offense. */
  toolValues: {} as Record<string, string>,
  toolChecked: { warning_type: ["verbal"] } as Record<string, string[]>,
  modelPrompts: [] as string[],
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

vi.mock("@/lib/config/server-env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/config/server-env")>()),
  liveReadiness: () => ({ mode: "live", missing: [], problems: [], ready: true }),
}));

vi.mock("@/lib/auth/server", async () => {
  const { DEFAULT_PERMISSION_MATRIX, hasPermission } = await import("@/lib/permissions");
  const { AuthError } = await import("@/lib/auth/types");
  return {
    authorizeRequest: async (_request: Request, permission: string) => {
      if (!hasPermission(DEFAULT_PERMISSION_MATRIX, "admin" as never, permission as never)) {
        throw new AuthError("forbidden", "Your role does not have permission to do that.");
      }
      return {
        identity: {
          subject: "qa-admin",
          email: "qa@example.test",
          displayName: "QA Admin",
          role: "admin",
          scope: { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] },
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
      create: async (input: unknown) => {
        state.modelPrompts.push(JSON.stringify(input));
        return {
          content: [
            {
              type: "tool_use",
              name: "write_form_fields",
              input: { values: state.toolValues, checked: state.toolChecked },
            },
          ],
        };
      },
    },
  }),
}));

/* The turn record is analytics, proven in `api/chat/turn-lifecycle.test.ts`; not what is under test here. */
vi.mock("@/lib/analytics/record", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics/record")>()),
  openTurn: async () => "00000000-0000-4000-8000-000000000001",
  closeTurn: async () => {},
}));

vi.mock("@/lib/ai/call-claude", () => ({
  callClaude: async () => "An ordinary answer.",
}));

vi.mock("@/lib/reporting/read/report-briefing", () => ({ loadReportBriefing: async () => null }));
vi.mock("@/lib/reporting/read/employee-facts", () => ({
  loadEmployeeFacts: async () => null,
  NO_EMPLOYEE_DATASET_REASON: "no dataset",
  EMPLOYEE_DATA_HEADING: "CURRENT EMPLOYEE PERFORMANCE DATA",
}));

vi.mock("@/lib/knowledge/providers/supabase", () => ({
  SupabaseKnowledgeProvider: class {
    readonly name = "test double";
    /*
     * THE PRODUCTION FAILURE'S RAW MATERIAL: the nearest passages a search for
     * "cash handling" found were the cover page and Background Checks. They are
     * returned here on purpose — nothing may cite them.
     */
    async search() {
      return [
        { chunkId: "c0", documentId: "doc-woven-manual", documentTitle: "2025 JBA Policy Manual - Edited 5-2025", locator: "Page 1", content: "2025 JB & Associates Employment Policy Manual.", score: 0.91, category: "policies_compliance" },
        { chunkId: "c69", documentId: "doc-woven-manual", documentTitle: "2025 JBA Policy Manual - Edited 5-2025", locator: "Page 21 — Background Checks", content: "Employees are subject to background checks.", score: 0.9, category: "policies_compliance" },
      ];
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
        section: locator,
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
          rows: [
            row(0, "SECTION 2 – PERFORMANCE MANAGEMENT LADDER", "Solve the issue at the lowest appropriate level."),
            row(1, "SECTION 3 – COACHING FRAMEWORK", "Coach the behaviour."),
            row(2, "SECTION 6 – DPOA FRAMEWORK", "The formal corrective step after coaching."),
            row(3, "10.7 Final operating rule for Ask Bubbles", "Classify the issue before escalating."),
          ],
          presentGroups: ["escalation_ladder", "coaching_framework", "dpoa_framework", "final_operating_rule"],
        },
      };
    }
    async fetchOfficialPolicyManual() {
      return state.manual ?? { ok: false, reason: "The official policy manual is not in the knowledge base." };
    }
    async fetchNamedHandbook() {
      return { ok: false, reason: "not used" };
    }
  },
}));

vi.mock("@/lib/knowledge", () => ({
  getKnowledgeProvider: () => {
    throw new Error("the browser knowledge client must not be used on the server");
  },
}));

process.env.NEXT_PUBLIC_DEMO_MODE = "false";

const { ensureTemplateLibrary } = await import("@/lib/forms/repository");
const { createInlineForm } = await import("@/features/chat/create-inline-form");
const continuation = await import("@/lib/forms/proposal-continuation");
const chatRoute = await import("@/app/api/chat/route");
const instancesRoute = await import("./instances/route");
const instanceRoute = await import("./instances/[id]/route");
const draftRoute = await import("./instances/[id]/draft/route");

/** The view's join, which the fake does not model — see `exit-form-e2e.test.ts`. */
function joinOverview() {
  for (const row of store.form_instances ?? []) {
    const template = store.form_templates!.find((entry) => entry.id === row.template_id);
    const version = store.form_template_versions.find((entry) => entry.id === row.template_version_id);
    Object.assign(row, {
      template_key: template?.key,
      template_name: template?.name,
      layout_family: template?.layout_family,
      template_version: version?.version,
    });
  }
}

const drafts: { id: string; notes: string; response: Record<string, unknown> }[] = [];

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
  if (draft) {
    drafts.push({ id: draft[1]!, notes: String(JSON.parse(String(init?.body ?? "{}")).notes ?? ""), response: body as Record<string, unknown> });
  }
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
    instance: Record<string, unknown>;
    values: { fieldKey: string; value: string | null; checked: string[] }[];
  };
}

/* ------------------------------------------------- the browser, in short -- */

let sequence = 0;
let thread: ChatMessage[] = [];

/** One manager turn, sent exactly as `chat-screen.tsx` sends it. */
async function say(question: string): Promise<ChatMessage> {
  const history = [...thread];
  const user: ChatMessage = { id: `msg_${(sequence += 1)}`, role: "user", content: question, createdAt: "2026-10-08T23:30:00Z" };
  thread.push(user);
  const named = continuation.activeFormInstanceFor(history, question);
  const candidates = continuation.activeFormCandidates(history);
  const response = await chatRoute.POST(
    new Request("https://app.test/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question,
        mode: "standard",
        history,
        questionMessageId: user.id,
        continueProposalTemplateKey: continuation.continuationFor(history)?.templateKey,
        activeFormInstanceId: named,
        ...(named === undefined && candidates.length > 1
          ? { activeFormCandidateIds: candidates.map((candidate) => candidate.instanceId) }
          : {}),
      }),
    }),
  );
  const payload = (await response.json()) as Record<string, unknown> & {
    content: string;
    formProposal?: ChatFormProposal;
    formProposals?: ChatFormProposal[];
  };
  expect(response.status, JSON.stringify(payload)).toBe(200);
  const assistant: ChatMessage = {
    id: `msg_${(sequence += 1)}`,
    role: "assistant",
    content: payload.content,
    createdAt: "2026-10-08T23:30:01Z",
    ...(payload.formProposal ? { formProposal: payload.formProposal } : {}),
    ...(payload.formProposals && payload.formProposals.length > 1 ? { formProposals: payload.formProposals } : {}),
  };
  thread.push(assistant);
  return assistant;
}

/** The card's Create button: `createInlineForm`, then the reference recorded as the store does. */
async function create(message: ChatMessage, proposal: ChatFormProposal) {
  expect(continuation.isProposalSuperseded(thread, proposal.proposalId)).toBe(false);
  let instanceId = "";
  const result = await createInlineForm({
    proposal,
    messages: thread,
    call,
    onCreated: (reference) => {
      instanceId = reference.instanceId;
      const index = thread.findIndex((entry) => entry.id === message.id);
      thread[index] = { ...thread[index]!, ...continuation.withInstanceRef(thread[index]!, reference) };
    },
  });
  expect(instanceId).not.toBe("");
  return { instanceId, result };
}

const cards = (message: ChatMessage) => continuation.proposalsOf(message);
const value = (form: Awaited<ReturnType<typeof review>>, key: string) =>
  form.values.find((row) => row.fieldKey === key);

beforeEach(async () => {
  for (const key of Object.keys(store) as (keyof FakeStore)[]) store[key] = [];
  drafts.length = 0;
  thread = [];
  state.manual = manual(true);
  state.toolValues = { observation: "Observed:\nCash handling concern." };
  state.toolChecked = { warning_type: ["verbal"] };
  state.modelPrompts = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-08T23:30:00Z"));
  await ensureTemplateLibrary("system");
});


const brief = (message: ChatMessage) =>
  cards(message).map((card) => ({
    form: card.templateKey,
    employee: card.employeeName,
    warning: card.warningLevel ?? null,
    issue: card.issue ?? null,
  }));

describe("the exact retest prompts", () => {
  it("'jordan testperson needs a written warning for cash handling' → CA · Jordan Testperson · Written · cash handling", async () => {
    expect(brief(await say("jordan testperson needs a written warning for cash handling"))).toEqual([
      { form: "dpoa", employee: "Jordan Testperson", warning: "written", issue: "cash handling" },
    ]);
  });

  it("'coaching form for Avery Testperson and a CA for Jordan Testpers' (as typed) → two cards, no question", async () => {
    const answer = await say("coaching form for Avery Testperson and a CA for Jordan Testpers");
    expect(brief(answer).map(({ form, employee }) => [form, employee])).toEqual([
      ["coaching", "Avery Testperson"],
      ["dpoa", "Jordan Testpers"],
    ]);
    expect(answer.content).not.toMatch(/Which of them/i);
  });

  it("in the retest's own order, in one conversation, each turn is read on its own", async () => {
    const first = await say("coaching form for Avery Testperson and a CA for Jordan Testperson");
    const second = await say("jordan testperson needs a written warning for cash handling");
    expect(brief(first).map(({ employee }) => employee)).toEqual(["Avery Testperson", "Jordan Testperson"]);
    expect(brief(second)).toEqual([{ form: "dpoa", employee: "Jordan Testperson", warning: "written", issue: "cash handling" }]);
  });
});

describe("capitalisation, misspellings, shorthand and word order", () => {
  it.each([
    ["Jordan Testperson needs a written warning for cash handling", "Jordan Testperson", "written", "cash handling"],
    ["JORDAN TESTPERSON NEEDS A WRITTEN WARNING FOR CASH HANDLING", "Jordan Testperson", "written", "CASH HANDLING"],
    ["jordan testperson needs a writen warning for cash handeling", "Jordan Testperson", "written", "cash handeling"],
    ["written warning for jordan testperson - cash handling", "Jordan Testperson", "written", "cash handling"],
    ["CA for jordan testperson, cash handling", "Jordan Testperson", null, "cash handling"],
    ["jordan testperson was $40 short on her drawer last night, needs a written warning", "Jordan Testperson", "written", null],
    ["jordan testperson cash handling written warning", "Jordan Testperson", "written", null],
    ["need a CA for jordan testperson. she mishandled cash at close yesterday. written warning", "Jordan Testperson", "written", null],
  ])("%s", async (prompt, employee, warning, issue) => {
    expect(brief(await say(prompt))).toEqual([{ form: "dpoa", employee, warning, issue }]);
  });

  it("a prior verbal warning is history, not this form's level", async () => {
    expect(brief(await say("create a ca form for paulyne test, she was late again for 30 mins today. given verbal warning on 9/21"))).toEqual([
      { form: "dpoa", employee: "Paulyne Test", warning: null, issue: null },
    ]);
  });

  it.each([
    "Coaching form for avery testperson & CA for jordan testperson",
    "coachng form for avery testperson and a c/a for jordan testperson",
  ])("%s → two cards", async (prompt) => {
    expect(brief(await say(prompt)).map(({ form, employee }) => [form, employee])).toEqual([
      ["coaching", "Avery Testperson"],
      ["dpoa", "Jordan Testperson"],
    ]);
  });

  it("three forms, three people", async () => {
    expect(
      brief(await say("coaching form for Avery Testperson, CA for Jordan Testperson, and a policy review for Sam Rivera")).map(
        ({ form, employee }) => [form, employee],
      ),
    ).toEqual([
      ["coaching", "Avery Testperson"],
      ["dpoa", "Jordan Testperson"],
      ["policy-review", "Sam Rivera"],
    ]);
  });
});

describe("conversation history", () => {
  it("an earlier unrelated conversation does not reach the new form or its draft", async () => {
    await say("What does the JBA policy manual say about shirts?");
    await say("how many days of PTO do I get?");
    const answer = await say("jordan testperson needs a written warning for cash handling");
    expect(brief(answer)).toEqual([{ form: "dpoa", employee: "Jordan Testperson", warning: "written", issue: "cash handling" }]);
    await create(answer, cards(answer)[0]!);
    expect(drafts[0]!.notes).toBe("jordan testperson needs a written warning for cash handling");
  });

  it("a person correction keeps the account — the warning and the issue — under the corrected name", async () => {
    await say("jordan testperson needs a written warning for cash handling");
    const corrected = await say("actually it's for avery testperson");
    expect(brief(corrected)).toEqual([{ form: "dpoa", employee: "Avery Testperson", warning: "written", issue: "cash handling" }]);
    const changed = await say("make it a verbal warning");
    expect(brief(changed)).toEqual([{ form: "dpoa", employee: "Avery Testperson", warning: "verbal", issue: "cash handling" }]);

    const { instanceId } = await create(changed, cards(changed)[0]!);
    const form = await review(instanceId);
    expect(form.instance.employeeName).toBe("Avery Testperson");
    expect(value(form, "warning_type")?.checked).toEqual(["verbal"]);
    // The draft is written from the account with the corrected name — never the wrong one.
    expect(drafts[0]!.notes).toContain("Avery Testperson needs a written warning for cash handling");
    expect(drafts[0]!.notes.toLowerCase()).not.toContain("jordan");
  });

  it("an OLD card from an earlier version (employee 'cash handling') cannot be created any more", async () => {
    const user: ChatMessage = { id: "msg_old_1", role: "user", content: "jordan testperson needs a written warning for cash handling", createdAt: "2026-10-09T10:24:26Z" };
    const stale = {
      proposalId: "6f1e2d3c-4b5a-4c6d-8e7f-000000000001",
      templateKey: "dpoa",
      templateName: "Corrective Action Form",
      supportsInlineDraft: true,
      variantKey: null,
      employeeName: "cash handling",
      employeeRole: null,
      formDate: null,
      locationId: null,
      locationName: null,
      locationResolution: "not_applicable" as const,
      authorizedLocationIds: [],
      status: "ready" as const,
      sourceMessageIds: ["msg_old_1"],
    };
    const old: ChatMessage = { id: "msg_old_2", role: "assistant", content: "I'll draft a Corrective Action Form for cash handling…", createdAt: "2026-10-09T10:24:27Z", formProposal: stale };
    thread = [user, old];
    await expect(createInlineForm({ proposal: stale, messages: thread, call, onCreated: () => {} })).rejects.toThrow(/out of date/i);
    expect(store.form_instances).toHaveLength(0);
    // The stored message itself is left exactly as it was.
    expect(thread[1]!.formProposal!.employeeName).toBe("cash handling");
  });

  it("each conversation continues only itself: switching conversations carries nothing across", async () => {
    await say("coaching form for Avery Testperson");
    const conversationA = [...thread];
    thread = [];
    const answer = await say("she was late twice this week");
    expect(cards(answer)).toEqual([]);
    expect(continuation.continuationFor(conversationA)?.templateKey).toBe("coaching");
    expect(continuation.continuationFor(thread)).toBeNull();
  });

  it("the drafts land on the right employee", async () => {
    const answer = await say("coaching form for Avery Testperson and a CA for Jordan Testperson");
    const [coaching, ca] = cards(answer);
    const avery = await create(answer, coaching!);
    const jordan = await create(thread.find((entry) => entry.id === answer.id)!, ca!);
    expect((await review(avery.instanceId)).instance.employeeName).toBe("Avery Testperson");
    expect((await review(jordan.instanceId)).instance.employeeName).toBe("Jordan Testperson");
  });
});
