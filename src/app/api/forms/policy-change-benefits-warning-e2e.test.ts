/**
 * ============================================================================
 * A BENEFITS "WARNING" NEVER GOES ONTO A CORRECTIVE ACTION (QA, 5 Nov 2026, severe)
 * ============================================================================
 *
 * A real location manager, in a revision of a finalized Corrective Action Form:
 * "in the previously recieved coaching include that <name> signed the jba policy
 * manual on 10-15-26". The reply said Direct policy "now cites Standards of
 * Conduct (page 12) and Warning (page 36)", and the saved policy_language quoted
 * the manual's 401k sheet headed "Warning" (current income taxes, legal retirement
 * age, an IRA). The date was not added.
 *
 * Root cause (`forms/chat-policy-change.ts`): "include THAT <name> signed …" read
 * as a reference back ("that"), and the nearest earlier turn naming a manual
 * heading was the app's own "Is this new corrective action a **Verbal Warning**
 * or a **Written Warning**?" — the manual's heading "Warning". The message's only
 * "policy" is the manual's own name.
 *
 * The guard here is the sibling's live one ("warning" is no section); the manager's words, with the harness's
 * invented person for the real one.
 */
import { rosterResultFor } from "@/test/roster-result";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { AccessScope, ChatMessage } from "@/types";

/**
 * ============================================================================
 * EDITING AN OPEN CORRECTIVE ACTION FORM FROM THE CONVERSATION — END TO END
 * ============================================================================
 *
 * Ported from the reference platform (production feedback, 20 Oct 2026). With
 * a Corrective Action Form open, "can you add <a> policy to the direct policy
 * section of this form" was answered "No form has been created yet", and the
 * manager was told to create the form again. A manager has to be able to add
 * or swap a policy, change a detail, and answer a question — on the form that
 * is open — without starting another one.
 *
 * Replayed through the real proposal flow, `createInlineForm`, and the real
 * create / draft / review routes, then the chat handlers the route tries, in
 * the order it tries them. Only identity, the model, the knowledge provider,
 * the employee directory read and the database are stand-ins. Every employee
 * is synthetic.
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
      create: async (request: { system?: unknown }) => {
        state.systems.push(typeof request.system === "string" ? request.system : JSON.stringify(request.system ?? ""));
        return {
          stop_reason: "tool_use",
          content: [{ type: "tool_use", name: "write_form_fields", input: state.draft }],
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
const { changeActiveFormPolicy } = await import("@/lib/forms/chat-policy-change");
const instancesRoute = await import("./instances/route");
const instanceRoute = await import("./instances/[id]/route");
const draftRoute = await import("./instances/[id]/draft/route");

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

beforeEach(async () => {
  for (const key of Object.keys(store) as (keyof FakeStore)[]) store[key] = [];
  state.role = "admin";
  state.scope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
  state.draft = { values: {}, checked: {} };
  state.systems = [];
  state.directory = DIRECTORY;
  state.manual = MANUAL;
  state.manualProblem = null;
  sequence = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T15:00:00Z"));
  await ensureTemplateLibrary("system");
});

/* The manual with its benefits sheet: a heading "Warning" on the 401k page (wording shortened, invented). */
const WITH_BENEFITS = {
  chunks: [
    ...MANUAL.chunks,
    sheet(36, "Standards of Conduct", 12, "The Company expects Employees to follow rules of conduct that will protect the interests and\nsafety of all Employees."),
    sheet(118, "Warning", 36, "o You may owe current income taxes – and possibly tax penalties – on your distribution if you\ntake money out before your legal retirement age unless you transfer it to an IRA."),
  ],
};

const ASKS_LEVEL = "Is this new corrective action a **Verbal Warning** or a **Written Warning**? Tell me here, or tick it on the form — I won't choose it for you.";
const QUESTION = "in the previously recieved coaching include that pat rivera signed the jba policy manual on 10-15-26";

async function theFlow() {
  state.manual = WITH_BENEFITS;
  const { id, history } = await createdForm();
  const turns = [...history, answered(ASKS_LEVEL), said("pat did not acknowledge woven policies by the due date 10/31")];
  const answer = await changeActiveFormPolicy({ request: chat(), instanceId: id, question: QUESTION, history: turns });
  return { id, answer, turns };
}

describe("QA, 5 Nov 2026: the manager's revision never cites the manual's benefits \"Warning\"", () => {
  // Changed on purpose (6 Nov 2026): this was the bug (the reply cited **Warning** (page 36) and Direct policy quoted the
  // retirement text). "warning" is now no section (policy-change.ts NOT_A_SECTION, ported from the sibling's live code;
  // Pau's exception). The turn reaching the ordinary revision is POLICY_CHANGE_RELEVANT_ENABLED's, in its own pull request.
  it("the reply never cites **Warning** and Direct policy never quotes the retirement text", async () => {
    const { id, answer } = await theFlow();
    expect(answer?.content ?? "").not.toMatch(/\*\*Warning\*\*/);
    expect((await row(id, "policy_language"))?.value ?? "").not.toMatch(/legal retirement age|income taxes|\bIRA\b/);
  });

  it("\"add that policy to the form too\" after the app's warning-level question never reaches back to **Warning**", async () => {
    state.manual = WITH_BENEFITS;
    const { id, history } = await createdForm();
    const answer = await changeActiveFormPolicy({ request: chat(), instanceId: id, question: "add that policy to the form too", history: [...history, answered(ASKS_LEVEL)] });
    expect(answer?.content ?? "").not.toMatch(/\*\*Warning\*\* \(page/);
    expect((await row(id, "policy_language"))?.value ?? "").not.toMatch(/legal retirement age/);
  });

  it("negative: \"add the late opening policy\" is added as before", async () => {
    state.manual = WITH_BENEFITS;
    const { history, id } = await createdForm();
    const answer = await changeActiveFormPolicy({ request: chat(), instanceId: id, question: "add the late opening policy", history });
    expect(answer?.content).toMatch(/Late Opening/);
  });
});

describe("POLICY_CHANGE_RELEVANT_ENABLED: the manager's revision is not a policy change at all", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("off (main): no benefits citation, but the turn is still a policy change — \"I couldn't find a section called …\" — and the revision never runs", async () => {
    const { answer } = await theFlow();
    expect(answer?.content).toMatch(/^I couldn't find a section called "pat rivera signed the jba"/);
  });

  it("on: the message is not a policy change (its only \"policy\" is the manual's own name); nothing is cited, the turn goes on to the ordinary revision", async () => {
    vi.stubEnv("POLICY_CHANGE_RELEVANT_ENABLED", "true");
    const { id, answer } = await theFlow();
    expect(answer).toBeNull();
    expect((await row(id, "policy_language"))?.value ?? "").not.toMatch(/legal retirement age|income taxes|IRA/);
  });

  it("negative, on: \"please use that policy on the form\" after the app quoted **Late Opening** still adds Late Opening", async () => {
    vi.stubEnv("POLICY_CHANGE_RELEVANT_ENABLED", "true");
    state.manual = WITH_BENEFITS;
    const { id, history } = await createdForm();
    const quoted = [...history, said("what does the late opening policy say?"), answered("**Late Opening** (page 15): When an employee assigned to open a location is unable to open the location at the proper time, the employee must notify the manager as soon as possible.")];
    const answer = await changeActiveFormPolicy({ request: chat(), instanceId: id, question: "please use that policy on the form", history: quoted });
    expect(answer?.content).toMatch(/Late Opening/);
  });

  it("negative, on: \"add the late opening policy\" is added as before", async () => {
    vi.stubEnv("POLICY_CHANGE_RELEVANT_ENABLED", "true");
    state.manual = WITH_BENEFITS;
    const { id, history } = await createdForm();
    const answer = await changeActiveFormPolicy({ request: chat(), instanceId: id, question: "add the late opening policy", history });
    expect(answer?.content).toMatch(/Late Opening/);
  });
});
