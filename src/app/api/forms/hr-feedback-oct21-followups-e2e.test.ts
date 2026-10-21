import { rosterResultFor } from "@/test/roster-result";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { AccessScope, ChatMessage } from "@/types";

/**
 * ============================================================================
 * HR FEEDBACK, 21 OCT 2026 — THE CORRECTIVE ACTIONS HR TYPED, END TO END
 * ============================================================================
 *
 * HR's own messages from that day, word for word except the employee (a
 * synthetic one here), replayed through the real proposal flow,
 * `createInlineForm` and the real create / draft / review routes. What each
 * one got wrong:
 *
 *   "…opened the store 30 minutes late"      read as "store 30": no card at all
 *   "…$25 will be payroll deducted"          no Yes, no amount in the Action Plan
 *   "…violated the cell phone policy"         no citation: the heading also says
 *                                             "/Smart Watch"
 *   "…let her friend Sam Jones behind…"       asked who the form is for
 *   "…the Cell Phone Policy"                  "Cell" read as a second person
 *   "create ca form for X" asked again        the payroll answer asked again
 *
 * The JBA Policy Manual sections are the real headings and printed pages.
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
  /** What the drafting model was given, per call. */
  modelNotes: [] as string[],
  directory: [] as unknown[],
  manual: null as null | { chunks: unknown[] },
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
      create: async (request: { messages?: { content?: unknown }[] }) => {
        state.modelNotes.push(JSON.stringify(request.messages ?? []));
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
      if (!state.manual) return { ok: false, reason: "The official policy manual is not in the knowledge base." };
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
const instancesRoute = await import("./instances/route");
const instanceRoute = await import("./instances/[id]/route");
const draftRoute = await import("./instances/[id]/draft/route");

function joinOverview() {
  for (const row of store.form_instances ?? []) {
    const template = store.form_templates!.find((entry) => entry.id === row.template_id);
    const version = store.form_template_versions.find((entry) => entry.id === row.template_version_id);
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
  createdAt: "2026-10-21T18:00:00Z",
});

/**
 * Plays the manager's turns through the real proposal flow — Ask Bubbles' own
 * answers fed forward as history, and the open card's template sent as the
 * browser does — and returns every turn's response plus a `create` that files
 * the last card exactly as the chat's Create draft button does.
 */
async function conversation(turns: string[]) {
  const messages: ChatMessage[] = [];
  const responses: NonNullable<Awaited<ReturnType<typeof proposeFormForTurn>>>[] = [];
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
      policyManual: async () => (state.manual?.chunks as never) ?? null,
      ...(open ? { continueTemplateKey: open } : {}),
    });
    expect(response, `turn left the form intake: ${JSON.stringify(text)}`).not.toBeNull();
    responses.push(response!);
    if (response!.formProposal) open = response!.formProposal.templateKey;
    messages.push(message, {
      id: `a${sequence}`,
      role: "assistant",
      content: response!.content,
      createdAt: "2026-10-21T18:00:01Z",
      ...(response!.formProposal ? { formProposal: response!.formProposal } : {}),
    } as ChatMessage);
  }
  const last = responses[responses.length - 1]!;
  return {
    responses,
    last,
    messages,
    proposal: last.formProposal!,
    create: async () =>
      createInlineForm({
        proposal: last.formProposal!,
        messages,
        call,
        onCreated: () => {},
      }),
  };
}

/* Synthetic people only. Positions are what Woven would carry. */
const DIRECTORY = [
  { id: "e-1", firstName: "Pat", lastName: "Rivera", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" },
];

/* THE MANUAL AS THE KNOWLEDGE BASE HOLDS IT: real headings, and the page the manual prints. */
const chunk = (index: number, heading: string, printedPage: number, body: string, sections = [{ heading, page: printedPage }]) => ({
  chunkIndex: index,
  chunkId: `c-${index}`,
  locator: `Page ${printedPage + 1}`,
  page: printedPage + 1,
  printedPage,
  sections,
  section: heading,
  content: `${heading}\n${body}`,
});

const MANUAL = {
  chunks: [
    chunk(30, "Drug, Alcohol and Smoking Policy", 11, "In compliance with the Drug-Free Workplace Act of 1988, The Company has a longstanding\ncommitment to provide a safe, quality-oriented, and productive work environment."),
    // As the knowledge base holds it: the sheet is filed under the section it opens with.
    chunk(34, "Prescribed Medications", 12, "o Smoking or use of “vapor” products are not permitted in any of the locations.", [{ heading: "Smoking/Vaping", page: 12 }]),
    chunk(37, "Standards of Conduct", 13, "o Insubordination -the refusal to follow the directions of the manager."),
    chunk(40, "Attendance", 14, "It is the responsibility of each employee to know his or her work schedule and to always be on\ntime."),
    chunk(42, "Late Opening", 15, "When an employee assigned to open a location is unable to open the location at the proper\ntime, the employee must notify the manager as soon as possible."),
    chunk(61, "Cell Phone/Smart Watch Policy", 19, "Personal Employee cell phones are permitted in the workplace but must be kept out of sight."),
    chunk(96, "Visitors in the Workplace", 29, "For personal visitors, Employees must obtain approval from direct Supervisors each time they\ninvite a visitor into the workplace."),
  ],
};

beforeEach(async () => {
  for (const key of Object.keys(store) as (keyof FakeStore)[]) store[key] = [];
  state.role = "admin";
  state.scope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
  state.draft = { values: {}, checked: {} };
  state.modelNotes = [];
  state.directory = DIRECTORY;
  state.manual = MANUAL;
  sequence = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-21T18:00:00Z"));
  await ensureTemplateLibrary("system");
});

async function filed(turns: string[], observation: string, checked: Record<string, string[]> = {}) {
  const played = await conversation(turns);
  state.draft = { values: { observation: `Observed:\n${observation}` }, checked };
  const { reference } = await played.create();
  return { ...played, form: await review(reference.instanceId) };
}

describe("a late opening, as HR typed it", () => {
  const TYPED =
    "create verbal ca for pat rivera for opening store late on 10-1-26. previous coaching is jba policy manual 1-1-26. payroll deduct DOES apply and state $25 will be payroll deducted";

  it("reads the level, the date, the deduction and its amount, and cites Late Opening", async () => {
    // The box the model ticked on HR's own form that day.
    const { proposal, last, form } = await filed([TYPED], "Pat Rivera opened the store late on 10/1/2026.", {
      offense_type: ["tardiness"],
    });
    expect(proposal).toMatchObject({ templateKey: "dpoa", status: "ready", warningLevel: "verbal", payrollDeduct: "yes" });
    expect(last.content).toMatch(/payroll deduct applicable\? \*\*Yes\*\*/);
    expect(form.instance.formDate).toBe("2026-10-01");
    expect(field(form, "payroll_deduct")!.checked).toEqual(["yes"]);
    expect(field(form, "action_plan")!.value).toContain("$25 will be deducted from Pat's pay.");
    expect(field(form, "policy_language")!.value).toContain("Source: JBA Policy Manual — Late Opening, p. 15");
  });

  it.each([
    "create verbal ca for pat rivera. on 10-1-26 she opened the store 30 minutes late. no payroll deduct",
    "create verbal ca for pat rivera. she opened the location 45 min late on 10-1-26. no payroll deduct",
    "create verbal ca for pat rivera, she was late to store 15 minutes on 10-1-26. no payroll deduct",
  ])("does not read the minutes as a store number: %s", async (typed) => {
    const { proposal, last } = await conversation([typed]);
    expect(last.content).not.toMatch(/couldn't find a store/i);
    expect(proposal).toMatchObject({ templateKey: "dpoa", status: "ready", locationId: "loc-264" });
  });
});

describe("the payroll deduction, however HR words it", () => {
  it.each([
    ["$25 will be payroll deducted", "$25"],
    ["payroll deduct $25", "$25"],
    ["$25 payroll deduction applies", "$25"],
    ["deduct $3.25 from her pay", "$3.25"],
  ])("%s", async (typed, amount) => {
    const { proposal, form } = await filed(
      [`create verbal ca for pat rivera for a register shortage on 10-20-26. ${typed}`],
      "Pat Rivera's register was short on 10/20/2026.",
    );
    expect(proposal.payrollDeduct).toBe("yes");
    expect(field(form, "action_plan")!.value).toContain(`${amount} will be deducted from Pat's pay.`);
  });

  it("keeps the answer when the manager asks for the form again", async () => {
    const { proposal } = await conversation([
      "create ca form for pat rivera for a register shortage on 10-20-26. payroll deduct applies and $3.25 will be deducted from check.",
      "verbal",
      "create ca form for pat rivera",
    ]);
    expect(proposal.payrollDeduct).toBe("yes");
  });
});

describe("the policy HR names is the one cited", () => {
  it.each([
    ["create a verbal corrective action form for pat rivera. on 10-20-26 pat was talking on her cell phone for over 30 minutes", "Cell Phone/Smart Watch Policy, p. 19"],
    ["create verbal ca for pat rivera for violating the cell phone policy on 10-20-26. she was texting at the register", "Cell Phone/Smart Watch Policy, p. 19"],
    ["create verbal ca for pat rivera for cell phone/smart watch policy on 10-20-26", "Cell Phone/Smart Watch Policy, p. 19"],
    ["create verbal ca for pat rivera on 10-20-26. she was texting at the register. Cell phone/smart watch policy.", "Cell Phone/Smart Watch Policy, p. 19"],
    ["create verbal ca for pat rivera for violating visitors at work policy on 10-10-26. pat spent 40 minutes talking with friend and ignoring guests", "Visitors in the Workplace, p. 29"],
    ["create verbal ca for pat rivera for violating the smoking policy on 10-20-26. she was vaping in the back room", "Smoking/Vaping, p. 12"],
  ])("%s", async (typed, source) => {
    const { form } = await filed([typed], "Pat Rivera, 10/20/2026.");
    expect(field(form, "policy_language")!.value ?? "").toContain(`Source: JBA Policy Manual — ${source}`);
  });
});

describe("the section the account names wins over the model's guess", () => {
  it("cites Cell Phone/Smart Watch, not the Standards of Conduct the model ticked", async () => {
    const played = await conversation([
      "create a verbal corrective action form for pat rivera. on 10-20-26 pat was talking on her cell phone for over 30 minutes",
    ]);
    expect(played.last.content).toMatch(/\*\*Policy:\*\* Cell Phone\/Smart Watch Policy, from what you described/);
    state.draft = {
      values: { observation: "Observed:\nPat Rivera was on her cell phone for over 30 minutes on 10/20/2026." },
      checked: { offense_type: ["standards_of_conduct"] },
    };
    const { reference } = await played.create();
    const form = await review(reference.instanceId);
    const policy = field(form, "policy_language")!.value!;
    expect(policy).toContain("Source: JBA Policy Manual — Cell Phone/Smart Watch Policy, p. 19");
    expect(policy).not.toContain("Standards of Conduct");
    expect(field(form, "offense_type")!.checked).not.toContain("standards_of_conduct");
  });
});

describe("other people and policy titles in the account are not the employee", () => {
  it.each([
    "create verbal ca for pat rivera for violating visitors in the workplace policy on 10-10-26. she let her friend Sam Jones behind the counter for an hour",
    "create verbal ca for pat rivera on 10-20-26. she yelled at her coworker Avery Smith in front of guests",
    "create verbal ca for pat rivera for violating the Cell Phone Policy on 10-20-26",
    "create verbal ca for pat rivera for violating Visitors In The Workplace on 10-10-26",
  ])("%s", async (typed) => {
    const { proposal, last } = await conversation([typed]);
    expect(last.content).not.toMatch(/who is this .* for|which one|did you mean/i);
    expect(proposal).toMatchObject({ templateKey: "dpoa", employeeName: "Pat Rivera" });
  });
});

describe("what happened is read from this form's turns", () => {
  it("says it has not been told what happened when only another person's account came before", async () => {
    state.directory = [
      ...DIRECTORY,
      { id: "e-2", firstName: "Avery", lastName: "Testperson", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" },
    ];
    const { last, proposal } = await conversation([
      "create coaching for avery testperson. she has been late three times this month",
      "create ca for pat rivera",
    ]);
    expect(proposal).toMatchObject({ templateKey: "dpoa", employeeName: "Pat Rivera", awaitingIncident: true });
    expect(last.content).toMatch(/haven't told me what happened yet/);
  });
});
