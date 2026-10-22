import { rosterResultFor } from "@/test/roster-result";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { AccessScope, ChatMessage } from "@/types";

/**
 * ============================================================================
 * QA F-12, 22 OCT 2026 — ANSWERING "WHICH STORE IS THIS ABOUT?" IN THE CHAT
 * ============================================================================
 *
 * The same acceptance criteria as Ask Sunny's salon fix, over this app's own
 * stores, resolver and scope rules (store-confirmation.ts):
 *
 *   - a bare store number or name answers the store question — only when the
 *     store question is open — and keeps the intake;
 *   - a correction ("sorry, it's …", "no wait, it's …", "actually …") does too;
 *   - times, prices, dates and quantities are never a store;
 *   - an ambiguous or unassigned store is asked about, never picked;
 *   - the employee and every other answer already given are kept.
 *
 * Only Ask Bubbles' own stores are used. Every person is synthetic.
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
  { id: "e-2", firstName: "Sam", lastName: "Jones", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" },
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
    // Real headings an account's ordinary words also say ("payroll deduct", "time records"): never cited unasked.
    chunk(110, "Payroll Deductions", 39, "Deductions from an employee's pay are made only as required by law or authorised by the employee."),
    chunk(112, "Time Records", 36, "Employees must record their own time worked accurately."),
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

/**
 * Every turn's response, null included — for a turn that may leave the forms
 * path (the browser then shows an answer, not a card). What is checked is that
 * no response ever puts a place, or a word like "both", on the card.
 */
async function everyTurn(turns: string[]) {
  const messages: ChatMessage[] = [];
  const responses: (Awaited<ReturnType<typeof proposeFormForTurn>> | null)[] = [];
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
    responses.push(response);
    if (response?.formProposal) open = response.formProposal.templateKey;
    messages.push(message, {
      id: `a${sequence}`,
      role: "assistant",
      content: response?.content ?? "(answered outside the forms path)",
      createdAt: "2026-10-21T18:00:01Z",
      ...(response?.formProposal ? { formProposal: response.formProposal } : {}),
    } as ChatMessage);
  }
  return responses;
}

/* Buff City Soap stores: Omaha, NE (West Dodge Rd) loc-264, Kearney, NE loc-66, Grand Island, NE loc-236. */

/* Ask Bubbles' own stores: Omaha, NE (West Dodge Rd) 264, Kearney, NE 66, Grand Island, NE 236, Sioux Falls 225 and 338. */
const TWO: AccessScope = { level: "location", primaryAreaId: "loc-264", alsoCoversAreaIds: ["loc-66"] };
const SIOUX_FALLS: AccessScope = { level: "location", primaryAreaId: "loc-225", alsoCoversAreaIds: ["loc-338"] };
const DISTRICT: AccessScope = { level: "district", primaryAreaId: "dist-1", alsoCoversAreaIds: [] };
const GLOBAL: AccessScope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };

/* Off the directory, so nothing but the manager's words can place the form. */
const ASKS = "create a coaching form for Jo Test, late 3 times this week";

function manager(scope: AccessScope) {
  state.role = "location_manager";
  state.scope = scope;
}

describe("criterion 5: a store reply to the store question keeps the intake and sets the store", () => {
  it("the opening asks which store", async () => {
    manager(TWO);
    const { proposal } = await conversation([ASKS]);
    expect(proposal).toMatchObject({ employeeName: "Jo Test", status: "needs_location", locationResolution: "needs_selection" });
  });

  it.each([
    ["66", "loc-66"],
    ["#66", "loc-66"],
    ["store 66", "loc-66"],
    ["66.", "loc-66"],
    ["264", "loc-264"],
    ["kearney", "loc-66"],
    ["Kearney", "loc-66"],
    ["the kearney store", "loc-66"],
    ["it's kearney", "loc-66"],
    ["west dodge", "loc-264"],
    ["omaha", "loc-264"],
  ])("%j", async (reply, location) => {
    manager(TWO);
    const { proposal } = await conversation([ASKS, reply]);
    expect(proposal).toMatchObject({ templateKey: "coaching", employeeName: "Jo Test", locationId: location, status: "ready" });
  });

  it.each([
    ["sorry, it's omaha", "loc-264"],
    ["no wait, it's the west dodge store", "loc-264"],
    ["actually, store 264", "loc-264"],
    ["actually it's #264", "loc-264"],
    ["sorry, it's grand island", null],
  ])("a correction to a store already on the card: %j", async (reply, location) => {
    manager(TWO);
    const { responses, proposal } = await conversation(["create a coaching form for Jo Test at kearney, late 3 times", reply]);
    expect(responses[0]!.formProposal).toMatchObject({ employeeName: "Jo Test", locationId: "loc-66", status: "ready" });
    expect(proposal).toMatchObject({ employeeName: "Jo Test", locationId: location });
  });

  it("the answer is remembered on later turns", async () => {
    manager(TWO);
    const { proposal } = await conversation([ASKS, "66", "she was late again today"]);
    expect(proposal).toMatchObject({ employeeName: "Jo Test", locationId: "loc-66", status: "ready" });
  });
});

describe("criterion 1: a bare number is read only when the store question is open", () => {
  it.each(["264", "66"])("%j after a card that already has its store", async (reply) => {
    manager(TWO);
    const responses = await everyTurn(["create a coaching form for Jo Test at kearney, late 3 times", reply]);
    expect(responses[0]!.formProposal!.locationId).toBe("loc-66");
    expect(responses[1]?.formProposal?.locationId ?? "loc-66").toBe("loc-66");
    expect(responses[1]?.formProposal?.employeeName ?? "Jo Test").toBe("Jo Test");
  });

  it("'actually 264' is not a store: a number in a correction needs a store word or #", async () => {
    manager(TWO);
    const responses = await everyTurn(["create a coaching form for Jo Test at kearney, late 3 times", "actually 264"]);
    expect(responses[1]?.formProposal?.locationId ?? "loc-66").toBe("loc-66");
  });
});

describe("criterion 2: times, prices, dates and quantities are never a store", () => {
  it.each(["she got here at 66 today", "6:06", "at 6:06", "66pm", "$66", "66 dollars", "for 66 minutes", "6/6", "264 soaps", "66?"])(
    "%j after the store question",
    async (reply) => {
      manager(TWO);
      const responses = await everyTurn([ASKS, reply]);
      expect(responses[1]?.formProposal?.locationId ?? null).toBeNull();
      expect(responses[1]?.formProposal?.employeeName ?? "Jo Test").toBe("Jo Test");
    },
  );
});

describe("criterion 4: ambiguous or unassigned stores are asked about, never picked", () => {
  it("'sioux falls' is two stores: both offered, neither picked", async () => {
    manager(SIOUX_FALLS);
    const { proposal } = await conversation([ASKS, "sioux falls"]);
    expect(proposal).toMatchObject({ employeeName: "Jo Test", locationId: null, locationResolution: "needs_selection" });
    expect([...proposal.authorizedLocationIds].sort()).toEqual(["loc-225", "loc-338"]);
  });

  it("'sioux falls' with only one of them on the assignment: confirmed, never picked; 'yes' files it", async () => {
    manager({ level: "location", primaryAreaId: "loc-225", alsoCoversAreaIds: [] });
    const { proposal, last } = await conversation(["create a coaching form for Jo Test, late 3 times this week, it was at kearney", "sioux falls"]);
    expect(proposal).toMatchObject({ employeeName: "Jo Test", locationId: null, locationResolution: "needs_selection" });
    expect(proposal.authorizedLocationIds).toEqual(["loc-225"]);
    expect(last.content).toMatch(/is that the store\?/);
    const confirmed = await conversation(["create a coaching form for Jo Test, late 3 times this week, it was at kearney", "sioux falls", "yes"]);
    expect(confirmed.proposal).toMatchObject({ employeeName: "Jo Test", locationId: "loc-225", status: "ready" });
  });

  it.each([
    ["grand island", "Grand Island, NE"],
    ["236", "Grand Island, NE"],
    ["store 236", "Grand Island, NE"],
    ["sorry, it's grand island", "Grand Island, NE"],
  ])("an unassigned store (%j) is named back and not filed against", async (reply, name) => {
    manager(TWO);
    const { proposal, last } = await conversation([ASKS, reply]);
    expect(proposal).toMatchObject({ employeeName: "Jo Test", locationId: null, locationResolution: "needs_selection", namedLocationOutOfScope: name });
    expect([...proposal.authorizedLocationIds].sort()).toEqual(["loc-264", "loc-66"]);
    expect(last.content).toContain(`**${name}** isn't a store on your assignment`);
  });

  it("a district manager stays fail-closed: the reply is not a store on the form", async () => {
    state.role = "district_manager";
    state.scope = DISTRICT;
    for (const reply of ["kearney", "66", "store 236"]) {
      const responses = await everyTurn([ASKS, reply]);
      expect(responses[1]?.formProposal?.locationId ?? null).toBeNull();
      expect(responses[1]?.formProposal?.employeeName ?? "Jo Test").toBe("Jo Test");
    }
  });

  it("a global administrator may name any roster store in a correction", async () => {
    state.role = "admin";
    state.scope = GLOBAL;
    const { proposal } = await conversation(["create a coaching form for Jo Test at kearney, late 3 times", "sorry, it's store 236"]);
    expect(proposal).toMatchObject({ employeeName: "Jo Test", locationId: "loc-236" });
  });
});

describe("criterion 3: the employee and every other answer are kept, on the card and on the saved form", () => {
  it("a Corrective Action answered '66' keeps the employee, level, payroll answer and incident date", async () => {
    manager(TWO);
    const CA = "create verbal ca for Jo Test. she was late on 10/15. no payroll deduct";
    const { responses, proposal, form } = await filed([CA, "66"], "Jo Test was late on 10/15/2026.");
    expect(responses[0]!.formProposal).toMatchObject({ employeeName: "Jo Test", status: "needs_location", warningLevel: "verbal", payrollDeduct: "no", formDate: "2026-10-15" });
    expect(proposal).toMatchObject({ employeeName: "Jo Test", locationId: "loc-66", status: "ready", warningLevel: "verbal", payrollDeduct: "no", formDate: "2026-10-15" });
    expect(form.instance).toMatchObject({ employeeName: "Jo Test", locationId: "loc-66", formDate: "2026-10-15" });
    expect(form.values.find((v) => v.fieldKey === "payroll_deduct")?.checked).toEqual(["no"]);
  });
});
