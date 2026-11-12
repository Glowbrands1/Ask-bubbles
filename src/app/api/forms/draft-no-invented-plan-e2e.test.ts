import { rosterResultFor } from "@/test/roster-result";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { AccessScope, ChatFormProposal, ChatMessage } from "@/types";

/**
 * ============================================================================
 * NO "GOING FORWARD" THE MANAGER NEVER TYPED — END TO END
 * ============================================================================
 *
 * QA, 25 Oct 2026 (ported from the sibling app): the saved Observation of a
 * Corrective Action Form carried an AI-written "Going Forward" paragraph
 * ("<Name> plans travel and preparation so that … notifies the store in
 * advance if arriving late is unavoidable") with
 * ACTION_PLAN_MANAGER_ONLY_ENABLED on. DRAFT_NO_INVENTED_PLAN_ENABLED drops
 * it; Observed and Expectation stay.
 *
 * The harness below is `action-plan-manager-only-e2e.test.ts`'s:
 * Pau, 25 Oct 2026: when the manager typed no action plan, the Corrective
 * Action Form's Action Plan stays blank — no "Management will review …"
 * sentence and no closing written onto it. A plan the manager typed ("action
 * plan: …") is the Action Plan word for word. ACTION_PLAN_MANAGER_ONLY_ENABLED.
 *
 * The C-list turn from QA B5 (conv_mvnmf1ik2lqkfld), word for word, through
 * the real proposal flow, `createInlineForm` and the real create / draft /
 * review routes, with the shipped store roster. Only identity, the model, the
 * knowledge provider, the directory read and the database are stand-ins.
 * Every person is synthetic. The card on the live chat path is covered by
 * `src/app/api/chat/action-plan-manager-only-live-path.test.ts`.
 */

/* "Kearney, NE" on the shipped roster. */
const KEARNEY = "loc-66";

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
  draft: {} as {
    values?: Record<string, unknown>;
    checked?: Record<string, unknown>;
  },
  /** What the drafting model was given, per call. */
  modelNotes: [] as string[],
  directory: [] as unknown[],
  manual: null as null | { chunks: unknown[] },
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => fakeSupabase(store),
}));

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
  const { DEFAULT_PERMISSION_MATRIX, hasPermission } =
    await import("@/lib/permissions");
  return {
    authorizeRequest: async (_request: Request, permission: string) => {
      if (
        !hasPermission(
          DEFAULT_PERMISSION_MATRIX,
          state.role as never,
          permission as never,
        )
      ) {
        throw new AuthError(
          "forbidden",
          "Your role does not have permission to do that.",
        );
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
      create: async (request: {
        system?: unknown;
        messages?: { content?: unknown }[];
      }) => {
        state.modelNotes.push(
          JSON.stringify([request.system ?? null, request.messages ?? []]),
        );
        return {
          stop_reason: "tool_use",
          content: [
            { type: "tool_use", name: "write_form_fields", input: state.draft },
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
              document_title:
                "ASK BUBBLES PERFORMANCE MANAGEMENT FRAMEWORK KB TEXT",
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
      if (!state.manual)
        return {
          ok: false,
          reason: "The official policy manual is not in the knowledge base.",
        };
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
  const actual =
    await importOriginal<typeof import("@/lib/forms/employee-roster")>();
  return {
    ...actual,
    loadScopedRoster: async (scope: AccessScope | null) =>
      actual.scopeRoster(state.directory as never, scope),
    loadScopedRosterResult: async (scope: AccessScope | null) =>
      rosterResultFor(actual.scopeRoster, state.directory as never, scope),
  };
});

const { ensureTemplateLibrary, listTemplateSummaries } =
  await import("@/lib/forms/repository");
const { proposeFormForTurn } = await import("@/lib/ai/form-proposal");
const { createInlineForm } = await import("@/features/chat/create-inline-form");
const instancesRoute = await import("./instances/route");
const instanceRoute = await import("./instances/[id]/route");
const draftRoute = await import("./instances/[id]/draft/route");

function joinOverview() {
  for (const row of store.form_instances ?? []) {
    const template = store.form_templates!.find(
      (entry) => entry.id === row.template_id,
    );
    const version = store.form_template_versions.find(
      (entry) => entry.id === row.template_version_id,
    );
    Object.assign(row, {
      form_date: row.form_date ?? "2026-10-21",
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
    ? await draftRoute.POST(request, {
        params: Promise.resolve({ id: draft[1]! }),
      })
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
  const response = await instanceRoute.GET(
    new Request(`https://app.test/api/forms/instances/${id}`),
    {
      params: Promise.resolve({ id }),
    },
  );
  expect(response.status).toBe(200);
  return (await response.json()) as {
    instance: Record<string, unknown>;
    values: {
      fieldKey: string;
      value: string | null;
      checked: string[];
      filledBy: string;
      provenance?: Record<string, unknown>;
    }[];
  };
}

const field = (form: Awaited<ReturnType<typeof review>>, key: string) =>
  form.values.find((entry) => entry.fieldKey === key);

let sequence = 0;
const said = (content: string): ChatMessage => ({
  id: `m${(sequence += 1)}`,
  role: "user",
  content,
  createdAt: "2026-10-21T15:00:00Z",
});

/**
 * Plays the manager's turns through the real proposal flow — Ask Bubbles' own
 * answers fed forward as history, and the open card's template sent as the
 * browser does — and returns every turn's response plus a `create` that files
 * the last card exactly as the chat's Create draft button does.
 */
async function conversation(turns: string[]) {
  const messages: ChatMessage[] = [];
  const responses: NonNullable<
    Awaited<ReturnType<typeof proposeFormForTurn>>
  >[] = [];
  let open: string | undefined;
  for (const text of turns) {
    const message = said(text);
    const response = await proposeFormForTurn({
      history: messages,
      question: message.content,
      questionMessageId: message.id,
      actor: { role: state.role as never, scope: state.scope as AccessScope },
      summaries: await listTemplateSummaries(),
      today: "2026-10-21",
      /* The pinned manual, as server-ask supplies it. */
      policyManual: async () => (state.manual?.chunks as never) ?? null,
      ...(open ? { continueTemplateKey: open } : {}),
    });
    expect(
      response,
      `turn left the form intake: ${JSON.stringify(text)}`,
    ).not.toBeNull();
    responses.push(response!);
    if (response!.formProposal) open = response!.formProposal.templateKey;
    messages.push(message, {
      id: `a${sequence}`,
      role: "assistant",
      content: response!.content,
      createdAt: "2026-10-21T15:00:01Z",
      ...(response!.formProposal
        ? { formProposal: response!.formProposal }
        : {}),
    } as ChatMessage);
  }
  const last = responses[responses.length - 1]!;
  return {
    responses,
    last,
    messages,
    proposal: last.formProposal!,
    /*
     * The card as the manager files it. On the live path the remap names the
     * employee and the store (see the live-path test); the proposal flow on
     * its own reads neither from this turn, so they are filled in as the
     * manager fills them on the card.
     */
    create: async () => {
      const proposal: ChatFormProposal = {
        ...last.formProposal!,
        employeeName: "Test Employee",
        locationId: KEARNEY,
        status: "ready",
        supportsInlineDraft: true,
      };
      return createInlineForm({
        proposal,
        messages,
        call,
        onCreated: () => {},
      });
    },
  };
}

/* Synthetic people only. */
const DIRECTORY = [
  {
    id: "e-1",
    firstName: "Test",
    lastName: "Employee",
    preferredFirstName: null,
    employmentStatus: "active",
    locationIds: [KEARNEY],
    positionName: "Operator",
  },
];

const STANDARDS_OF_CONDUCT_CHUNK = {
  chunkIndex: 30,
  chunkId: "c-30",
  locator: "Page 12",
  page: 13,
  printedPage: 12,
  sections: [{ heading: "Standards of Conduct", page: 12 }],
  section: "Standards of Conduct",
  content:
    "Standards of Conduct\nThe Company expects Employees to follow rules of conduct that will protect the interests and\nsafety of all customers, Employees, and The Company.\nThe following are examples (non-inclusive list) of infractions that may result in disciplinary\naction:\no Failing to follow the policies and procedures of The Company\no Register / Bank shortages",
};

const MANUAL = { chunks: [STANDARDS_OF_CONDUCT_CHUNK] };

const LATE =
  "create a written CA for Test Employee at Kearney, she was 20 minutes late for her shift on 10-20-26";
const MANAGER_PLAN =
  "arrive 10 minutes before every shift for the next 30 days";

/* What the drafting model returns: the reported "Going Forward", with an invented person's name. */
const OBSERVED =
  "Observed:\nOn October 20, 2026, Test Employee arrived 20 minutes late for her scheduled shift.";
const EXPECTATION =
  "Expectation:\nEmployees are expected to arrive on time and be ready to work at the start of their scheduled shift.";
const GOING_FORWARD =
  "Going Forward:\nTest plans travel and preparation so that she arrives on time, and notifies the store in advance if arriving late is unavoidable.";
const MODEL_DRAFT = {
  values: {
    observation: `${OBSERVED}\n\n${EXPECTATION}\n\n${GOING_FORWARD}`,
    action_plan: "Test will plan her travel.",
  },
  checked: {},
};

const FLAGS = [
  "DRAFT_NO_INVENTED_PLAN_ENABLED",
  "ACTION_PLAN_MANAGER_ONLY_ENABLED",
];
const savedFlags = new Map<string, string | undefined>();

beforeEach(async () => {
  for (const name of FLAGS) {
    savedFlags.set(name, process.env[name]);
    delete process.env[name];
  }
  for (const key of Object.keys(store) as (keyof FakeStore)[]) store[key] = [];
  state.role = "admin";
  state.scope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
  state.draft = MODEL_DRAFT;
  state.modelNotes = [];
  state.directory = DIRECTORY;
  state.manual = MANUAL;
  sequence = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-25T15:00:00Z"));
  await ensureTemplateLibrary("system");
});

afterEach(() => {
  vi.useRealTimers();
  for (const [name, value] of savedFlags) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

async function drafted(turns: string[]) {
  const { create } = await conversation(turns);
  const { reference } = await create();
  const form = await review(reference.instanceId);
  return {
    observation: field(form, "observation")?.value ?? "",
    plan: field(form, "action_plan")?.value ?? "",
  };
}

describe("DRAFT_NO_INVENTED_PLAN_ENABLED: the Corrective Action Observation", () => {
  it("off (ACTION_PLAN_MANAGER_ONLY on): the model's Going Forward is saved (the reported failure)", async () => {
    process.env.ACTION_PLAN_MANAGER_ONLY_ENABLED = "true";
    const { observation } = await drafted([LATE]);
    expect(observation).toContain("Going Forward:");
    expect(observation).toContain("notifies the store in advance");
  });

  it("on: no Going Forward; Observed and Expectation are kept", async () => {
    process.env.ACTION_PLAN_MANAGER_ONLY_ENABLED = "true";
    process.env.DRAFT_NO_INVENTED_PLAN_ENABLED = "true";
    const { observation, plan } = await drafted([LATE]);
    expect(observation).not.toMatch(
      /Going Forward|plans travel|notifies the store/,
    );
    expect(observation).toContain("Observed:");
    expect(observation).toContain("20 minutes late");
    expect(observation).toContain("Expectation:");
    expect(plan.trim()).toBe("");
  });

  it("NEVER-BREAK: a typed action plan is kept word for word with both flags on", async () => {
    process.env.ACTION_PLAN_MANAGER_ONLY_ENABLED = "true";
    process.env.DRAFT_NO_INVENTED_PLAN_ENABLED = "true";
    const { observation, plan } = await drafted([
      `${LATE}. action plan: ${MANAGER_PLAN}`,
    ]);
    expect(plan).toBe(MANAGER_PLAN);
    expect(observation).toContain("Observed:");
  });
});

/*
 * COACHING (QA, 26 Oct 2026): the Coaching Form's "Going Forward" is the
 * model's as well. With the flag on it stays only when the manager stated a
 * plan. Lowercase and sentence-case twins of the manager's turn.
 */
const COACHING =
  "create a coaching form for Test Employee at Kearney, she was 20 minutes late for her shift on 10-20-26";
const COACHING_DRAFT = {
  values: {
    coaching_details: `${OBSERVED}\n\n${EXPECTATION}\n\n${GOING_FORWARD}`,
  },
  checked: {},
};

async function coachingDetails(turns: string[]) {
  state.draft = COACHING_DRAFT;
  const { create } = await conversation(turns);
  const { reference } = await create();
  const form = await review(reference.instanceId);
  return { details: field(form, "coaching_details")?.value ?? "" };
}

const REGISTERS: [string, (text: string) => string][] = [
  ["as typed", (text) => text],
  ["all lowercase", (text) => text.toLowerCase()],
  ["sentence case", (text) => text.charAt(0).toUpperCase() + text.slice(1)],
];

describe.each(REGISTERS)(
  "DRAFT_NO_INVENTED_PLAN_ENABLED on the Coaching Form (%s)",
  (_register, as) => {
    it("off: the model's Going Forward is saved, as before", async () => {
      const { details } = await coachingDetails([as(COACHING)]);
      expect(details).toContain("Going Forward:");
    });

    it("on: no Going Forward the manager did not state; Observed and Expectation stay", async () => {
      process.env.DRAFT_NO_INVENTED_PLAN_ENABLED = "true";
      const { details } = await coachingDetails([as(COACHING)]);
      expect(details).not.toMatch(/Going Forward|plans travel/);
      expect(details).toContain("Expectation:");
    });

    it("on, NEVER-BREAK: a plan the manager stated keeps its Going Forward", async () => {
      process.env.DRAFT_NO_INVENTED_PLAN_ENABLED = "true";
      const { details } = await coachingDetails([
        as(`${COACHING}. going forward she will leave home 20 minutes earlier`),
      ]);
      expect(details).toContain("Going Forward:");
    });

    // QA-2 negation probe, 26 Oct 2026: a negated "going forward" is no plan.
    for (const negated of [
      "she was late 10-20-26, no going forward needed",
      "do not add a going forward section",
      "without a going forward plan",
      "she is not on a plan going forward",
      "not going forward with discipline",
      "no action plan",
      "action plan: none",
    ]) {
      it(`on: "${negated}" states no plan, so the model's Going Forward is dropped`, async () => {
        process.env.DRAFT_NO_INVENTED_PLAN_ENABLED = "true";
        const { details } = await coachingDetails([as(`${COACHING}. ${negated}`)]);
        expect(details).not.toMatch(/Going Forward|plans travel/);
        expect(details).toContain("Expectation:");
      });
    }

    for (const typed of [
      // Lowercase: a capitalised "Going Forward" mid-turn is read as a second person (names reader, reported).
      "going forward: she will leave home 20 minutes earlier",
      "she will clock in on time going forward",
      "she was not on time, going forward she will leave earlier",
    ]) {
      it(`on, NEVER-BREAK: "${typed}" is the manager's plan, so Going Forward stays`, async () => {
        process.env.DRAFT_NO_INVENTED_PLAN_ENABLED = "true";
        const { details } = await coachingDetails([as(`${COACHING}. ${typed}`)]);
        expect(details).toContain("Going Forward:");
      });
    }
  },
);
