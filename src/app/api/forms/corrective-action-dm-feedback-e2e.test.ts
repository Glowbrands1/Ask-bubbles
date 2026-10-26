import { rosterResultFor } from "@/test/roster-result";
import manual151 from "@/test/fixtures/jba-manual-production-151.json";
import { manualChunkFromRow, type ManualChunkRow } from "@/lib/knowledge/full-manual-load";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { AccessScope, ChatMessage } from "@/types";

/**
 * ============================================================================
 * CORRECTIVE ACTION FEEDBACK FROM A DISTRICT MANAGER, 21 OCT 2026 — END TO END
 * ============================================================================
 *
 * Production conversations, each rated low, replayed through the real
 * proposal flow, `createInlineForm`, and the real create / draft / review
 * routes, with the shipped Buff City Soap store roster:
 *
 *   A  "create verbal CA for … for violating visitors at work policy on
 *      10-10-26 …" — asked Verbal or Written, offered the prior coaching's
 *      date as the form's, named no policy, and drafted the form from the
 *      manager's later "no payroll deduct" instead of their account.
 *   B  "… on 10-20-26. verbal. no payroll deduct. …" — asked Verbal or
 *      Written again, and dated the observation with the form's date, twice;
 *      a new request in the same chat kept the earlier one's policy and level.
 *   C  "payroll deduct of $3.25 is applicable" was not read, and the Action
 *      Plan did not say what would be deducted.
 *   D  "by the 10-15-26 deadline" was drafted as the form's date.
 *   E  "… on 10-20-26 … was talking on her cell phone for over 30 minutes"
 *      named no policy and was cited under the Standards of Conduct, not the
 *      manual's Cell Phone/Smart Watch Policy.
 *   F  "create verbal ca for … for opening store late on 10-1-26 … payroll
 *      deduct DOES apply and state $25 will be payroll deducted" — the $25
 *      was not stated in the Action Plan, and Policy Violated named only the
 *      Tardiness box, not the Late Opening section Direct policy leads with.
 *
 * Only identity, the model, the knowledge provider, the employee directory
 * read and the database are stand-ins. Every person is synthetic: the
 * employees' real names are replaced, and so is the stray first name in A's
 * account (a typo for the employee's own).
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
      create: async (request: { system?: unknown; messages?: { content?: unknown }[] }) => {
        state.modelNotes.push(JSON.stringify([request.system ?? null, request.messages ?? []]));
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
      /* The pinned manual, as server-ask supplies it. */
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
      createdAt: "2026-10-21T15:00:01Z",
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
  { id: "e-1", firstName: "Remy", lastName: "Calder", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Operator" },
  { id: "e-2", firstName: "Tess", lastName: "Varga", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Operator" },
];

/*
 * THE MANUAL AS THE KNOWLEDGE BASE HOLDS IT: each section on the sheet it is
 * printed on, with the page the manual prints. Wording shortened, never
 * reworded, except the opening sentence under Visitors in the Workplace,
 * which stands in for the section's first paragraph, and the last sentence
 * under Late Opening, which stands in for its "$25.00 via payroll deduction".
 */
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

const ATTENDANCE_CHUNK = {
  chunkIndex: 33,
  chunkId: "c-33",
  locator: "Page 14",
  page: 15,
  printedPage: 14,
  sections: [{ heading: "Attendance", page: 14 }],
  section: "Attendance",
  content:
    "Attendance\nIt is the responsibility of each employee to know his or her work schedule and to always be on\ntime.",
};

const VISITORS_CHUNK = {
  chunkIndex: 64,
  chunkId: "c-64",
  locator: "Page 30",
  page: 31,
  printedPage: 30,
  sections: [{ heading: "Visitors in the Workplace", page: 30 }],
  section: "Visitors in the Workplace",
  content:
    "30 | P a g e\nVisitors in the Workplace\nTo provide for the safety and security of Employees and the facilities, only authorized visitors are\nallowed in the workplace. If the Employee is uncomfortable with allowing the visitor into the\nworkplace, the Supervisor or manager on duty must refuse to allow the visitor into the\nworkplace.",
};

const LATE_OPENING_CHUNK = {
  chunkIndex: 34,
  chunkId: "c-34",
  locator: "Page 15",
  page: 16,
  printedPage: 15,
  sections: [{ heading: "Late Opening", page: 15 }],
  section: "Late Opening",
  content:
    "15 | P a g e\nLate Opening\nWhen an employee assigned to open a location is unable to open the location at the proper\ntime, the employee must notify the manager as soon as possible. The employee will reimburse The\nCompany $25.00 via payroll deduction.",
};

const CELL_PHONE_CHUNK = {
  chunkIndex: 41,
  chunkId: "c-41",
  locator: "Page 19",
  page: 20,
  printedPage: 19,
  sections: [{ heading: "Cell Phone/Smart Watch Policy", page: 19 }],
  section: "Cell Phone/Smart Watch Policy",
  content:
    "19 | P a g e\nCell Phone/Smart Watch Policy\nPersonal Employee cell phones are permitted in the workplace but must be kept out of sight. It\nis the Employee\u2019s personal responsibility to protect the customer\u2019s experience and doing things\nsuch as texting, making phone calls or using social media jeopardizes the customer\u2019s experience.",
};

const MANUAL = {
  chunks: [STANDARDS_OF_CONDUCT_CHUNK, ATTENDANCE_CHUNK, LATE_OPENING_CHUNK, CELL_PHONE_CHUNK, VISITORS_CHUNK],
};

/* The production turns, names replaced. */
const A1 =
  "create verbal CA for remy calder for violating visitors at work policy on 10-10-26. juno spent 40 minutes talking with friend and ignoring guests. previous coaching was jba policy manual 1-1-26";
const B1 =
  "create ca form for tess varga for violating attendance policy on 10-20-26. verbal. no payroll deduct. jba manual 1-1-26 for previous coaching";
/* HR, 21 Oct 2026: the history as a list under one label. */
const E1 =
  "create a written CA for tess varga for not attending the monthly meeting on 10-20-26. previous coaching: jba policy manual 1-1-26, verbal ca 9-1-26. payroll deduct not applicable";

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
  vi.setSystemTime(new Date("2026-10-21T15:00:00Z"));
  await ensureTemplateLibrary("system");
});

const WARNING_QUESTION = /Verbal Warning\*\* or a \*\*Written Warning/;

/* ========================================================================= */
/* A1, B — THE WARNING LEVEL THE MANAGER STATED                               */
/* ========================================================================= */

describe("the warning level in the request is read, not asked", () => {
  it('"create verbal CA for …" reads back Verbal Warning, and the form is ticked Verbal', async () => {
    const { last, proposal, create } = await conversation([A1]);

    expect(proposal.warningLevel).toBe("verbal");
    expect(last.content).toMatch(/\*\*Type of warning:\*\* Verbal Warning, as you said/);
    expect(last.content).not.toMatch(WARNING_QUESTION);

    const { reference } = await create();
    expect(field(await review(reference.instanceId), "warning_type")!.checked).toEqual(["verbal"]);
  });

  it('"… on 10-20-26. verbal. no payroll deduct." reads the bare "verbal." as the level', async () => {
    const { last, proposal } = await conversation([B1]);

    expect(proposal.warningLevel).toBe("verbal");
    expect(last.content).toMatch(/\*\*Type of warning:\*\* Verbal Warning, as you said/);
    expect(last.content).not.toMatch(WARNING_QUESTION);
  });
});

/* ========================================================================= */
/* A5, A6, B — WHICH TURNS ARE THIS FORM'S                                    */
/* ========================================================================= */

const A2 = "no payroll deduct";
const B2 = "verbal";
const B3 =
  "create ca form for tess varga for a register shortage on 10-20-26. payroll deduct applies and $3.25 will be deducted from check. previous coaching - jba policy manual 1-20-26.";

/** What the drafting model was told the manager described. */
const described = () => /WHAT THE MANAGER DESCRIBED:\\n([\s\S]*?)\\n\\n(?:PERFORMANCE|APPROVED|FORM DATE)/.exec(state.modelNotes.at(-1) ?? "")?.[1] ?? "";

describe("the account survives the short answers after it", () => {
  it('"no payroll deduct" keeps the Issue line, the level and the account', async () => {
    const { responses, proposal, create } = await conversation([A1, A2]);

    expect(proposal.employeeName).toBe("Remy Calder");
    expect(proposal.sourceMessageIds).toEqual(["m1", "m2"]);
    expect(proposal.issue).toBe("violating visitors at work policy on 10-10-26");
    expect(proposal.warningLevel).toBe("verbal");
    expect(proposal.payrollDeduct).toBe("no");
    expect(responses[1]!.content).toMatch(/\*\*Issue:\*\* violating visitors at work policy/);
    expect(responses[1]!.content).not.toMatch(WARNING_QUESTION);
    expect(responses[1]!.content).not.toMatch(/won't guess/);

    await create();
    /* The draft is written from the account, never from the last short answer alone. */
    expect(described()).toContain("spent 40 minutes talking with friend and ignoring guests");
    expect(described()).toMatch(/^create verbal CA for remy calder/);
  });

  it("a stray first name in the account does not change the employee", async () => {
    const { proposal, responses } = await conversation([A1, A2, "yes payroll deduct"]);

    expect(responses.map((response) => response.formProposal!.employeeName)).toEqual([
      "Remy Calder",
      "Remy Calder",
      "Remy Calder",
    ]);
    expect(proposal.payrollDeduct).toBe("yes");
    expect(proposal.issue).toBe("violating visitors at work policy on 10-10-26");
  });
});

describe("a new request in the same chat is a new proposal", () => {
  it("keeps none of the earlier request's policy, warning level or account", async () => {
    const { responses, proposal, create } = await conversation([B1, B2, B3]);

    const reply = responses[2]!.content;
    expect(reply).not.toMatch(/Attendance, as you said/);
    expect(reply).not.toMatch(/Verbal Warning, as you said/);
    expect(proposal.sourceMessageIds).toEqual(["m3"]);
    expect(proposal.warningLevel).toBeNull();
    expect(proposal.payrollDeduct).toBe("yes");

    await create();
    expect(described()).not.toMatch(/attendance/i);
    expect(described()).toContain("register shortage");
  });

  it("does not carry the earlier request's payroll answer", async () => {
    const { proposal, last } = await conversation([B1, B2, "create ca form for tess varga for a register shortage on 10-20-26"]);

    expect(proposal.payrollDeduct).toBeNull();
    expect(last.content).toMatch(/\*\*Is payroll deduct applicable\?\*\* Yes or No\?/);
  });

  it("a repeated request that adds nothing keeps the account already given", async () => {
    const { proposal } = await conversation([B1, "create ca form for tess varga"]);

    expect(proposal.sourceMessageIds).toEqual(["m1", "m2"]);
});
});

/* ========================================================================= */
/* A2, A3 — THE PREVIOUS COACHING IS HISTORY, AND IT GOES ON THE FORM          */
/* ========================================================================= */

describe("previous coaching stated in chat", () => {
  it("is not offered as the form's date, is read back, and fills the prior-actions line", async () => {
    const { responses, proposal, create } = await conversation([A1, A2]);

    for (const response of responses) {
      expect(response.content).not.toMatch(/more than one date/);
      expect(response.content).not.toMatch(/won't guess/);
      expect(response.content).toMatch(
        /\*\*Prior actions:\*\* Coaching — JBA Policy Manual — signed 01\/01\/2026, as you said/,
      );
    }
    expect(proposal.formDate).toBe("2026-10-10");
    expect(proposal.formDateCandidates).toBeUndefined();

    const { reference } = await create();
    const form = await review(reference.instanceId);
    expect(field(form, "form_date")!.value).toBe("2026-10-10");
    expect(field(form, "prior_actions")!.value).toBe("Coaching — JBA Policy Manual — signed 01/01/2026");
  });

  it('"jba manual 1-1-26 for previous coaching" — the date first, the label after', async () => {
    const { last, proposal, create } = await conversation([B1]);

    expect(last.content).not.toMatch(/more than one date/);
    expect(proposal.formDate).toBe("2026-10-20");

    const { reference } = await create();
    expect(field(await review(reference.instanceId), "prior_actions")!.value).toBe(
      "Coaching — JBA Manual — signed 01/01/2026",
    );
  });

  /*
   * HR, 21 Oct 2026: the history as a list under one label. The verbal CA was
   * dropped from the prior actions, and its date offered as the form's.
   */
  it('"previous coaching: jba policy manual 1-1-26, verbal ca 9-1-26" — every item of the list is history', async () => {
    const { last, proposal, create } = await conversation([E1]);

    expect(last.content).not.toMatch(/more than one date/);
    expect(proposal.formDate).toBe("2026-10-20");
    expect(proposal.formDateCandidates).toBeUndefined();
    expect(proposal.warningLevel).toBe("written");
    expect(last.content).toMatch(/\*\*Type of warning:\*\* Written Warning, as you said/);
    expect(last.content).toMatch(
      /\*\*Prior actions:\*\* Coaching — JBA Policy Manual — signed 01\/01\/2026; Verbal corrective action — signed 09\/01\/2026, as you said/,
    );

    const { reference } = await create();
    const form = await review(reference.instanceId);
    expect(field(form, "form_date")!.value).toBe("2026-10-20");
    expect(field(form, "prior_actions")!.value).toBe(
      "Coaching — JBA Policy Manual — signed 01/01/2026\nVerbal corrective action — signed 09/01/2026",
    );
    expect(field(form, "warning_type")!.checked).toEqual(["written"]);
    expect(described()).toContain(E1);
  });
});

/* ========================================================================= */
/* A4 — A POLICY NAMED BY THE MANUAL'S OWN SECTION                            */
/* ========================================================================= */

/*
 * POLICY_SPECIFIC_TOPICS_ENABLED, ON THE DRAFT PATH (QA, 26 Oct 2026, "dog at
 * work" saved Standards of Conduct p.12): the manager's words choose the
 * manual's Animals in the Workplace section (and Visitors beside it) on the
 * saved draft, read from the production JBA manual rows. Off, the model's box
 * stands, as in the production draft.
 */
describe("a dog at work, on the saved draft, against the production manual rows", () => {
  afterEach(() => vi.unstubAllEnvs());
  const TURN = "create verbal CA for remy calder, brought her dog to work on 10-10-26. no payroll deduct";
  const modelDraft = () => {
    state.manual = { chunks: (manual151.chunks as ManualChunkRow[]).map(manualChunkFromRow) };
    state.draft = {
      values: { observation: "Observed:\nRemy Calder brought her dog to work.", other_offense: "Dog at work" },
      checked: { offense_type: ["standards_of_conduct"] },
    };
  };

  it("flag off: the model's Standards of Conduct stands (the production draft)", async () => {
    vi.stubEnv("POLICY_SPECIFIC_TOPICS_ENABLED", "");
    const { create } = await conversation([TURN]);
    modelDraft();
    const { reference } = await create();
    const form = await review(reference.instanceId);
    expect(field(form, "offense_type")!.checked).toEqual(["standards_of_conduct"]);
    expect(field(form, "policy_language")!.value ?? "").not.toMatch(/Animals in the Workplace/);
  });

  it("POLICY_SPECIFIC_TOPICS_ENABLED on: Animals in the Workplace p.30, with Visitors p.29 beside it", async () => {
    vi.stubEnv("POLICY_SPECIFIC_TOPICS_ENABLED", "true");
    const { create } = await conversation([TURN]);
    modelDraft();
    const { reference } = await create();
    const form = await review(reference.instanceId);
    const policy = field(form, "policy_language")!.value!;
    expect(field(form, "offense_type")!.checked).toEqual(["company_policies"]);
    expect(field(form, "other_offense")).toBeUndefined();
    expect(policy).toContain("Source: JBA Policy Manual — Animals in the Workplace, p. 30");
    expect(policy).toContain("Source: JBA Policy Manual — Visitors in the Workplace, p. 29");
    expect(policy).not.toMatch(/Standards of Conduct/);
  });
});

describe('"violating visitors at work policy" is the manual\'s Visitors in the Workplace', () => {
  it("is named in the reply, ticked, and quoted with its section and page", async () => {
    const { last, create } = await conversation([A1, A2]);

    expect(last.content).toMatch(
      /\*\*Policy:\*\* Visitors in the Workplace, as you said — the policy manual's section on page 30\. I'll quote it on the draft under \*\*Violation of Company Policies\*\*/,
    );

    /* The model would tick another box and write its own "Other". */
    state.draft = {
      values: {
        observation: "Observed:\nRemy Calder spent 40 minutes talking with a friend and did not attend to guests.",
        other_offense: "Socializing with visitors",
      },
      checked: { offense_type: ["standards_of_conduct"] },
    };
    const { reference } = await create();
    const form = await review(reference.instanceId);
    const policy = field(form, "policy_language")!.value!;

    expect(field(form, "offense_type")!.checked).toEqual(["company_policies"]);
    expect(field(form, "other_offense")).toBeUndefined();
    expect(field(form, "policy_violated")!.value).toBe("Violation of Company Policies — Visitors in the Workplace");
    expect(policy).toContain("only authorized visitors are\nallowed in the workplace");
    expect(policy).toContain("Source: JBA Policy Manual — Visitors in the Workplace, p. 30");
    expect(policy).not.toMatch(/Standards of Conduct/);
    expect(field(form, "policy_language")!.provenance).toMatchObject({ verified: true });
  });

  it("fails closed: a named policy no heading answers cites nothing, and the reply says so", async () => {
    const { last, create } = await conversation([
      "create verbal CA for remy calder for violating the unicorn parking policy on 10-10-26. no payroll deduct",
    ]);

    expect(last.content).toMatch(/Woven does not see a section of the current policy manual for "unicorn parking"/);

    state.draft = { values: { observation: "Observed:\nRemy parked in the wrong place." }, checked: {} };
    const { reference } = await create();
    const form = await review(reference.instanceId);
    expect(field(form, "offense_type")).toBeUndefined();
    expect(field(form, "policy_language")).toBeUndefined();
  });

  it("without the manual in front of it, the reply names the policy in the manager's words", async () => {
    state.manual = null;
    const { last } = await conversation([A1]);

    expect(last.content).toMatch(/\*\*Policy:\*\* "visitors at work", as you said\. I'll look for that section/);
  });
});

/* ========================================================================= */
/* B, D — THE DATES THE MANAGER GAVE STAY THEIRS ON THE DRAFT                 */
/* ========================================================================= */

const D1 =
  "create corrective action for tess varga for violating standards of conduct policy on 10-20-26. tess failed to acknowledge policies in woven by the 10-15-26 deadline.";

describe("the observation keeps the manager's dates", () => {
  it("B: dated by the incident, the observation states it once and as given", async () => {
    const { create } = await conversation([B1]);
    state.draft = {
      values: { observation: "Observed:\nOn October 20, 2026, Tess Varga did not follow the attendance policy." },
      checked: {},
    };

    const { reference } = await create();
    const form = await review(reference.instanceId);
    expect(field(form, "form_date")!.value).toBe("2026-10-20");
    expect(field(form, "observation")!.value).toBe(
      "Observed:\nOn October 20, 2026, Tess Varga did not follow the attendance policy.",
    );
  });

  it("D: the deadline is never the form's date; the one incident date (10/20) is (QA F-03)", async () => {
    const { create } = await conversation([D1]);
    state.draft = {
      values: {
        observation:
          "Observed:\nOn October 20, 2026, Tess Varga had not acknowledged the policies in Woven by the October 15, 2026 deadline.",
      },
      checked: {},
    };

    const { reference } = await create();
    const form = await review(reference.instanceId);
    const observation = field(form, "observation")!.value!;

    // QA F-03 (22 Oct 2026): the deadline is not a second incident, so the one incident date (10/20) dates the form.
    expect(field(form, "form_date")!.value).toBe("2026-10-20");
    expect(observation).toContain("On October 20, 2026");
    expect(observation).toContain("by the October 15, 2026 deadline");
    expect(observation).not.toContain("October 21");
    /* And the model was told which dates are the manager's. */
    expect(state.modelNotes.at(-1)).toMatch(/not necessarily the date of the incident/);
    expect(state.modelNotes.at(-1)).toContain('\\"October 20, 2026\\", \\"October 15, 2026\\"');
  });
});

/* ========================================================================= */
/* C — "PAYROLL DEDUCT OF $3.25 IS APPLICABLE", AND THE ACTION PLAN SAYS SO    */
/* ========================================================================= */

const C1 =
  "create ca form for tess varga. tess had a register shortage of $3.25 on 10-20-26. payroll deduct of $3.25 is applicable";

const CLOSING =
  "Future policy violations may result in additional corrective action up to and including termination of employment.";

/*
 * What the model would have written. The Action Plan is built by code now
 * (District Manager feedback, 21 Oct 2026; `ca-action-plan.ts`), so none of
 * this reaches the form.
 */
const DRAWER_PLAN =
  "Tess Varga is expected to adhere to the Buff City Soap cash handling policy by keeping the register accurate. Moving forward, Tess should count the drawer at every shift change. Management will monitor compliance and provide coaching as needed.";

const REVIEW_CONDUCT = "Management will review the Standards of Conduct policy with Tess.";

describe("a payroll deduction with an amount", () => {
  it("is read as Yes, not asked, and the Action Plan states the amount before the closing", async () => {
    const { last, proposal, create } = await conversation([C1]);

    expect(proposal.payrollDeduct).toBe("yes");
    expect(last.content).toMatch(/Is payroll deduct applicable\? \*\*Yes\*\*/);
    expect(last.content).not.toMatch(/Yes or No\?/);

    state.draft = {
      values: {
        observation: "Observed:\nOn October 20, 2026, Tess Varga's register was short $3.25.",
        action_plan: DRAWER_PLAN,
      },
      checked: {},
    };
    const { reference } = await create();
    const form = await review(reference.instanceId);

    expect(field(form, "payroll_deduct")!.checked).toEqual(["yes"]);
    expect(field(form, "action_plan")!.value).toBe(`${REVIEW_CONDUCT} $3.25 will be deducted from Tess's pay. ${CLOSING}`);
  });

  it('"payroll deduct applies and $3.25 will be deducted from check" says the same', async () => {
    const { create } = await conversation([B3]);
    state.draft = { values: { action_plan: DRAWER_PLAN }, checked: {} };

    const { reference } = await create();
    expect(field(await review(reference.instanceId), "action_plan")!.value).toBe(
      `${REVIEW_CONDUCT} $3.25 will be deducted from Tess's pay. ${CLOSING}`,
    );
  });

  it("with no amount stated, says a deduction applies and invents no figure", async () => {
    const { create } = await conversation([
      "create ca form for tess varga, her register was short on 10-20-26. yes payroll deduct",
    ]);
    state.draft = { values: { action_plan: DRAWER_PLAN }, checked: {} };

    const { reference } = await create();
    const plan = field(await review(reference.instanceId), "action_plan")!.value!;
    expect(plan).toBe(`${REVIEW_CONDUCT} A payroll deduction applies. ${CLOSING}`);
    expect(plan).not.toMatch(/\$/);
  });

  it("says nothing about pay when payroll deduct is No", async () => {
    const { create } = await conversation([B1]);
    state.draft = { values: { action_plan: DRAWER_PLAN }, checked: {} };

    const { reference } = await create();
    expect(field(await review(reference.instanceId), "action_plan")!.value).toBe(
      `Management will review the Attendance policy with Tess. ${CLOSING}`,
    );
  });
});

/* ========================================================================= */
/* D — "OTHER" BESIDE STANDARDS OF CONDUCT                                   */
/* ========================================================================= */

/*
 * Production: the stored "Other" read "Failure to complete required task —
 * Woven deadline of September 30, 2026 not met", filled_by "manager", written
 * by the form card's save 29 seconds after the draft (whose drafted fields did
 * not include it). No code path in Ask Bubbles writes that field except the
 * draft (as "ai") and the manager's own save; this holds the draft's half:
 * whatever the model writes there, a stated Standards of Conduct leaves it
 * blank.
 */
describe("the draft never writes Other beside a stated Standards of Conduct", () => {
  it("drops the model's write-in and its other box", async () => {
    const { create } = await conversation([D1]);
    state.draft = {
      values: {
        observation: "Observed:\nTess Varga had not acknowledged the policies in Woven by the October 15, 2026 deadline.",
        other_offense: "Failure to complete required task — Woven deadline of September 30, 2026 not met",
      },
      checked: { offense_type: ["under_performance"] },
    };

    const { reference } = await create();
    const form = await review(reference.instanceId);
    expect(field(form, "offense_type")!.checked).toEqual(["standards_of_conduct"]);
    expect(field(form, "other_offense")).toBeUndefined();
    expect(JSON.stringify(form.values)).not.toMatch(/September 30/);
  });
});

/* ========================================================================= */
/* E — A CELL PHONE ACCOUNT, WITH NO POLICY NAMED                             */
/* ========================================================================= */

const E_PHONE =
  "create a verbal corrective action form for remy calder. on 10-20-26 remy was talking on her cell phone for over 30 minutes";

describe("E: an account of the conduct cites the manual section it describes", () => {
  it("reads Verbal, and the draft cites the Cell Phone/Smart Watch Policy under Violation of Company Policies", async () => {
    const { last, proposal, create } = await conversation([E_PHONE]);

    expect(proposal.warningLevel).toBe("verbal");
    expect(last.content).toMatch(/\*\*Type of warning:\*\* Verbal Warning, as you said/);
    expect(last.content).not.toMatch(WARNING_QUESTION);
    expect(last.content).toMatch(
      /\*\*Policy:\*\* Cell Phone\/Smart Watch Policy, from what you described \("cell phone"\) — the policy manual's section on page 19\. I'll quote it on the draft under \*\*Violation of Company Policies\*\*/,
    );

    state.draft = {
      values: { observation: "Observed:\nOn October 20, 2026, Remy Calder was talking on her cell phone for over 30 minutes." },
      checked: { offense_type: ["standards_of_conduct"] },
    };
    const { reference } = await create();
    const form = await review(reference.instanceId);
    const policy = field(form, "policy_language")!.value!;

    expect(field(form, "warning_type")!.checked).toEqual(["verbal"]);
    expect(field(form, "offense_type")!.checked).toEqual(["company_policies"]);
    expect(field(form, "policy_violated")!.value).toBe("Violation of Company Policies — Cell Phone/Smart Watch Policy");
    expect(policy).toContain("Personal Employee cell phones are permitted in the workplace");
    expect(policy).toContain("Source: JBA Policy Manual — Cell Phone/Smart Watch Policy, p. 19");
    expect(policy).not.toMatch(/Standards of Conduct/);
    expect(field(form, "action_plan")!.value).toBe(
      `Management will review the Cell Phone/Smart Watch policy with Remy. ${CLOSING}`,
    );
  });

  it("a phone in an account a box with its own section governs leaves that box: a late arrival is Attendance", async () => {
    const { last, create } = await conversation([
      "create a verbal corrective action form for remy calder. on 10-20-26 remy was 40 minutes late because she was on her phone in the parking lot",
    ]);
    expect(last.content).not.toMatch(/Cell Phone/);

    state.draft = {
      values: { observation: "Observed:\nOn October 20, 2026, Remy Calder arrived 40 minutes late." },
      checked: { offense_type: ["tardiness"] },
    };
    const { reference } = await create();
    const form = await review(reference.instanceId);
    expect(field(form, "offense_type")!.checked).toEqual(["tardiness"]);
    expect(field(form, "policy_violated")!.value).toBe("Tardiness/Leaving Early");
    expect(field(form, "policy_language")!.value).toContain("Source: JBA Policy Manual — Attendance, p. 14");
    expect(field(form, "policy_language")!.value).not.toMatch(/Cell Phone/);
  });

  it("never replaces a box the draft ticked with its own specific section", async () => {
    const { create } = await conversation([
      "create a verbal corrective action form for remy calder. on 10-20-26 remy stayed on her cell phone in the back room after her shift began",
    ]);
    state.draft = {
      values: { observation: "Observed:\nOn October 20, 2026, Remy Calder did not start her shift on time." },
      checked: { offense_type: ["tardiness"] },
    };
    const { reference } = await create();
    const form = await review(reference.instanceId);
    expect(field(form, "offense_type")!.checked).toEqual(["tardiness"]);
    expect(field(form, "policy_language")!.value).not.toMatch(/Cell Phone/);
  });

  it("an incidental mention describes nothing: the draft's own box stands", async () => {
    const { last, create } = await conversation([
      "create a verbal corrective action form for remy calder. on 10-20-26 remy was rude to a guest. she left her phone number on the schedule",
    ]);
    expect(last.content).not.toMatch(/Cell Phone/);

    state.draft = {
      values: { observation: "Observed:\nOn October 20, 2026, Remy Calder was rude to a guest." },
      checked: { offense_type: ["standards_of_conduct"] },
    };
    const { reference } = await create();
    const form = await review(reference.instanceId);
    expect(field(form, "offense_type")!.checked).toEqual(["standards_of_conduct"]);
    expect(field(form, "policy_language")!.value).toContain("Source: JBA Policy Manual — Standards of Conduct, p. 12");
  });
});

/* ========================================================================= */
/* F — A LATE OPENING, WITH A PAYROLL DEDUCTION AND ITS AMOUNT               */
/* ========================================================================= */

const F_LATE =
  "create verbal ca for tess varga for opening store late on 10-1-26. previous coaching is jba policy manual 1-1-26. payroll deduct DOES apply and state $25 will be payroll deducted";

describe("F: a late opening with a payroll deduction", () => {
  const LATE_OPENER_DRAFT = {
    values: { observation: "Observed:\nOn October 1, 2026, Tess Varga opened the store late." },
    checked: { offense_type: ["tardiness"] },
  };

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("dates the form 10-1-26, reads Verbal, the history and the $25, and the Action Plan states the $25", async () => {
    // Pinned to LATE_OPEN_DATE off, the reading this predates; the env may set it (production has it on). On: the twins below.
    vi.stubEnv("LATE_OPEN_DATE_ENABLED", "");
    const { last, proposal, create } = await conversation([F_LATE]);

    expect(proposal.warningLevel).toBe("verbal");
    expect(last.content).toMatch(/\*\*Type of warning:\*\* Verbal Warning, as you said/);
    expect(last.content).not.toMatch(WARNING_QUESTION);
    expect(last.content).not.toMatch(/more than one date/);
    expect(proposal.formDate).toBe("2026-10-01");
    expect(proposal.formDateCandidates).toBeUndefined();
    expect(proposal.payrollDeduct).toBe("yes");
    expect(last.content).toMatch(/Is payroll deduct applicable\? \*\*Yes\*\*/);
    expect(last.content).toMatch(
      /\*\*Prior actions:\*\* Coaching — JBA Policy Manual — signed 01\/01\/2026, as you said/,
    );

    state.draft = LATE_OPENER_DRAFT;
    const { reference } = await create();
    const form = await review(reference.instanceId);
    const policy = field(form, "policy_language")!.value!;

    expect(field(form, "form_date")!.value).toBe("2026-10-01");
    expect(field(form, "prior_actions")!.value).toBe("Coaching — JBA Policy Manual — signed 01/01/2026");
    expect(field(form, "warning_type")!.checked).toEqual(["verbal"]);
    expect(field(form, "payroll_deduct")!.checked).toEqual(["yes"]);
    expect(field(form, "offense_type")!.checked).toEqual(["tardiness"]);
    expect(policy).toContain("Source: JBA Policy Manual — Late Opening, p. 15");
    expect(policy.indexOf("Late Opening, p. 15")).toBeLessThan(policy.indexOf("Attendance, p. 14"));
    /* The manager's amount, as they wrote it. */
    expect(field(form, "action_plan")!.value).toBe(
      `Management will review the Late Opening and Attendance policies with Tess. $25 will be deducted from Tess's pay. ${CLOSING}`,
    );
  });

  it("Policy Violated names Late Opening beside the Tardiness box, as Direct policy leads with it", async () => {
    const { create } = await conversation([F_LATE]);
    state.draft = LATE_OPENER_DRAFT;

    const { reference } = await create();
    const form = await review(reference.instanceId);
    expect(field(form, "offense_type")!.checked).toEqual(["tardiness"]);
    expect(field(form, "policy_violated")!.value).toBe("Tardiness/Leaving Early — Late Opening");
  });

  it("a late arrival that is not an opening stays the Tardiness box alone", async () => {
    const { create } = await conversation([
      "create verbal ca for tess varga, she was 20 minutes late for her 2pm shift on 10-1-26. no payroll deduct",
    ]);
    state.draft = {
      values: { observation: "Observed:\nOn October 1, 2026, Tess Varga arrived 20 minutes late." },
      checked: { offense_type: ["tardiness"] },
    };

    const { reference } = await create();
    const form = await review(reference.instanceId);
    expect(field(form, "policy_violated")!.value).toBe("Tardiness/Leaving Early");
    expect(field(form, "action_plan")!.value).toBe(`Management will review the Attendance policy with Tess. ${CLOSING}`);
  });

  /*
   * Payroll deduct Yes and no amount stated: the plan states the one amount
   * the Late Opening section Direct policy quotes gives, in the manual's own
   * figure — and only that section's.
   */
  it("with no amount stated, states the $25.00 the quoted Late Opening section gives", async () => {
    // Pinned to LATE_OPEN_DATE off, the reading this predates; the env may set it (production has it on). On: the twins below.
    vi.stubEnv("LATE_OPEN_DATE_ENABLED", "");
    const { create } = await conversation([
      "create verbal ca for tess varga for opening store late on 10-1-26. payroll deduct applies",
    ]);
    state.draft = LATE_OPENER_DRAFT;

    const { reference } = await create();
    const form = await review(reference.instanceId);
    expect(field(form, "policy_language")!.value).toContain("$25.00 via payroll deduction");
    expect(field(form, "action_plan")!.value).toBe(
      `Management will review the Late Opening and Attendance policies with Tess. $25.00 will be deducted from Tess's pay. ${CLOSING}`,
    );
  });

  it("a late arrival cites Attendance alone, and the plan invents no figure", async () => {
    const { create } = await conversation([
      "create verbal ca for tess varga, she was 20 minutes late for her 2pm shift on 10-1-26. payroll deduct applies",
    ]);
    state.draft = {
      values: { observation: "Observed:\nOn October 1, 2026, Tess Varga arrived 20 minutes late." },
      checked: { offense_type: ["tardiness"] },
    };

    const { reference } = await create();
    expect(field(await review(reference.instanceId), "action_plan")!.value).toBe(
      `Management will review the Attendance policy with Tess. A payroll deduction applies. ${CLOSING}`,
    );
  });

  /*
   * LATE_OPEN_DATE is on in production; the two pins above predate it. With it
   * on, a late opening cites Late Opening, p. 15 alone (QA, 24 Oct 2026), so
   * the Action Plan reviews the Late Opening policy, not "Late Opening and
   * Attendance". Everything else those tests read is the same.
   */
  it("with LATE_OPEN_DATE_ENABLED on, dates the form 10-1-26, reads Verbal, the history and the $25, and cites Late Opening alone", async () => {
    vi.stubEnv("LATE_OPEN_DATE_ENABLED", "1");
    const { last, proposal, create } = await conversation([F_LATE]);

    expect(proposal.warningLevel).toBe("verbal");
    expect(last.content).toMatch(/\*\*Type of warning:\*\* Verbal Warning, as you said/);
    expect(last.content).not.toMatch(WARNING_QUESTION);
    expect(last.content).not.toMatch(/more than one date/);
    expect(proposal.formDate).toBe("2026-10-01");
    expect(proposal.formDateCandidates).toBeUndefined();
    expect(proposal.payrollDeduct).toBe("yes");
    expect(last.content).toMatch(/Is payroll deduct applicable\? \*\*Yes\*\*/);
    expect(last.content).toMatch(
      /\*\*Prior actions:\*\* Coaching — JBA Policy Manual — signed 01\/01\/2026, as you said/,
    );

    state.draft = LATE_OPENER_DRAFT;
    const { reference } = await create();
    const form = await review(reference.instanceId);
    const policy = field(form, "policy_language")!.value!;

    expect(field(form, "form_date")!.value).toBe("2026-10-01");
    expect(field(form, "prior_actions")!.value).toBe("Coaching — JBA Policy Manual — signed 01/01/2026");
    expect(field(form, "warning_type")!.checked).toEqual(["verbal"]);
    expect(field(form, "payroll_deduct")!.checked).toEqual(["yes"]);
    expect(field(form, "offense_type")!.checked).toEqual(["tardiness"]);
    expect(policy).toContain("Source: JBA Policy Manual — Late Opening, p. 15");
    expect(policy).not.toMatch(/Attendance/);
    expect(field(form, "action_plan")!.value).toBe(
      `Management will review the Late Opening policy with Tess. $25 will be deducted from Tess's pay. ${CLOSING}`,
    );
  });

  it("with LATE_OPEN_DATE_ENABLED on and no amount stated, states the $25.00 the quoted Late Opening section gives", async () => {
    vi.stubEnv("LATE_OPEN_DATE_ENABLED", "1");
    const { create } = await conversation([
      "create verbal ca for tess varga for opening store late on 10-1-26. payroll deduct applies",
    ]);
    state.draft = LATE_OPENER_DRAFT;

    const { reference } = await create();
    const form = await review(reference.instanceId);
    expect(field(form, "policy_language")!.value).toContain("$25.00 via payroll deduction");
    expect(field(form, "action_plan")!.value).toBe(
      `Management will review the Late Opening policy with Tess. $25.00 will be deducted from Tess's pay. ${CLOSING}`,
    );
  });
});

/* ========================================================================= */
/* G — THE CELL PHONE/SMART WATCH POLICY, NAMED OR DESCRIBED (from #65)      */
/* ========================================================================= */

/*
 * Production: "create a verbal corrective action form for <employee>. on
 * 10-20-26 <employee> was talking on her cell phone for over 30 minutes" was
 * cited Standards of Conduct; the manager wanted the manual's Cell
 * Phone/Smart Watch Policy, page 19. The heading's slash meant "cell phone"
 * never matched it, even when named.
 */
const G_PHONE =
  "create a verbal corrective action form for tess varga. on 10-20-26 tess was talking on her cell phone for over 30 minutes";

describe("an account of personal phone use cites the manual's Cell Phone/Smart Watch Policy", () => {
  it("described, not named: read back as what it reads as, ticked, and quoted with its page", async () => {
    const { last, proposal, create } = await conversation([G_PHONE]);

    expect(proposal.warningLevel).toBe("verbal");
    expect(last.content).not.toMatch(WARNING_QUESTION);
    expect(last.content).toMatch(
      /\*\*Policy:\*\* Cell Phone\/Smart Watch Policy, from what you described(?: \("[^"]+"\))? — the policy manual's section on page 19/,
    );
    expect(last.content).not.toMatch(/Cell Phone\/Smart Watch Policy, as you said/);

    state.draft = {
      values: { observation: "Observed:\nOn October 20, 2026, Tess Varga was talking on her cell phone for over 30 minutes." },
      checked: { offense_type: ["standards_of_conduct"] },
    };
    const { reference } = await create();
    const form = await review(reference.instanceId);
    const policy = field(form, "policy_language")!.value!;

    expect(field(form, "offense_type")!.checked).toEqual(["company_policies"]);
    expect(field(form, "policy_violated")!.value).toBe("Violation of Company Policies — Cell Phone/Smart Watch Policy");
    expect(policy).toContain("Personal Employee cell phones are permitted in the workplace but must be kept out of sight.");
    expect(policy).toContain("Source: JBA Policy Manual — Cell Phone/Smart Watch Policy, p. 19");
    expect(policy).not.toMatch(/Standards of Conduct/);
  });

  it('named: "violated the cell phone policy" is the same section', async () => {
    const { last } = await conversation([
      "create a verbal CA for tess varga for violating the cell phone policy on 10-20-26. no payroll deduct",
    ]);
    expect(last.content).toMatch(
      /\*\*Policy:\*\* Cell Phone\/Smart Watch Policy, as you said — the policy manual's section on page 19/,
    );
  });

  it("a stated policy still wins over the account", async () => {
    const { last } = await conversation([
      "create a verbal CA for tess varga for violating standards of conduct on 10-20-26. she was texting on her phone at the register. no payroll deduct",
    ]);
    expect(last.content).toMatch(/\*\*Policy:\*\* Standards of Conduct, as you said/);
    expect(last.content).not.toMatch(/Cell Phone/);
  });

  it("a phone that is not the employee's own use raises nothing", async () => {
    const { last } = await conversation([
      "create a verbal CA for tess varga. on 10-20-26 she hung up on a guest who called the store phone. no payroll deduct",
    ]);
    expect(last.content).not.toMatch(/Cell Phone/);
  });
});

/* ========================================================================= */
/* H — A ONE-WORD ANSWER AFTER THE WHOLE REQUEST (from #65)                   */
/* ========================================================================= */

/*
 * Production: the reply to "written" was drafted from "written" alone — the
 * created form had nothing but the employee, store, title, date and ticks.
 */
describe("a one-word answer after the whole request", () => {
  it('"written" keeps the request as the account, and the draft is written from it', async () => {
    const { proposal, create } = await conversation([E1.replace("a written CA", "a CA"), "written"]);

    expect(proposal.sourceMessageIds).toEqual(["m1", "m2"]);
    expect(proposal.warningLevel).toBe("written");
    expect(proposal.payrollDeduct).toBe("no");

    await create();
    expect(described()).toContain("not attending the monthly meeting on 10-20-26");
  });

  it("a request for another employee keeps none of the earlier one's answers", async () => {
    const { proposal } = await conversation([A1, A2, G_PHONE]);

    expect(proposal.employeeName).toBe("Tess Varga");
    expect(proposal.sourceMessageIds).toEqual(["m3"]);
    expect(proposal.payrollDeduct).toBeNull();
  });
});

/* ========================================================================= */
/* G — A MEETING NOT ATTENDED IS ATTENDANCE, WHERE THE MANUAL SAYS SO         */
/* ========================================================================= */

/*
 * District Manager feedback, 21 Oct 2026: E1 ("for not attending the monthly
 * meeting") was drafted under the Standards of Conduct. The manual's
 * Attendance section counts meetings as scheduled shifts; where it does not
 * say so, the manager is asked, and their answer fills the form.
 */
const ATTENDANCE_WITH_MEETINGS_CHUNK = {
  ...ATTENDANCE_CHUNK,
  content: `${ATTENDANCE_CHUNK.content}\no Synthetic rule: Meetings, Seminars and Training sessions are treated as scheduled shifts. (See Seminar/Webinar\nAttendance section)`,
};
const SEMINAR_CHUNK = {
  chunkIndex: 123,
  chunkId: "c-123",
  locator: "Page 37",
  page: 38,
  printedPage: 37,
  sections: [{ heading: "Seminar/Webinar Attendance", page: 37 }],
  section: "Seminar/Webinar Attendance",
  content:
    "Seminar/Webinar Attendance\nSynthetic rule: a seminar/webinar missed without notifying your\nSupervisor is treated as a no call no show to a scheduled shift.",
};

describe("G: a meeting not attended is cited where the manual puts it", () => {
  it("reads Attendance from the manual, says why, and the draft ticks Absenteeism over the model's Standards of Conduct", async () => {
    state.manual = {
      chunks: [STANDARDS_OF_CONDUCT_CHUNK, ATTENDANCE_WITH_MEETINGS_CHUNK, SEMINAR_CHUNK, CELL_PHONE_CHUNK],
    };
    const { last, create } = await conversation([E1]);

    expect(last.content).toMatch(
      /\*\*Policy:\*\* Attendance, from what you described \("missed the monthly meeting"\) — the policy manual's section on page 14, which says "Synthetic rule: Meetings, Seminars and Training sessions are treated as scheduled shifts\." I'll quote it on the draft under \*\*Absenteeism\*\*; tell me if a different policy applies\./,
    );
    expect(last.content).not.toMatch(/Which policy applies/);

    state.draft = {
      values: { observation: "Observed:\nTess Varga did not attend the scheduled monthly meeting on October 20, 2026." },
      checked: { offense_type: ["standards_of_conduct"] },
    };
    const { reference } = await create();
    const form = await review(reference.instanceId);
    const policy = field(form, "policy_language")!.value!;

    expect(field(form, "offense_type")!.checked).toEqual(["absenteeism"]);
    expect(field(form, "policy_violated")!.value).toBe("Absenteeism");
    expect(policy).toContain("Synthetic rule: Meetings, Seminars and Training sessions are treated as scheduled shifts.");
    expect(policy).toContain("Source: JBA Policy Manual — Attendance, p. 14");
    expect(policy).not.toMatch(/Standards of Conduct/);
    expect(field(form, "warning_type")!.checked).toEqual(["written"]);
    expect(field(form, "prior_actions")!.value).toBe(
      "Coaching — JBA Policy Manual — signed 01/01/2026\nVerbal corrective action — signed 09/01/2026",
    );
  });

  it("a seminar not attended cites the Seminar/Webinar Attendance section under Absenteeism", async () => {
    state.manual = {
      chunks: [STANDARDS_OF_CONDUCT_CHUNK, ATTENDANCE_WITH_MEETINGS_CHUNK, SEMINAR_CHUNK],
    };
    const { last, create } = await conversation([
      "create a verbal CA for tess varga for skipping the webinar on 10-20-26. no payroll deduct",
    ]);
    expect(last.content).toMatch(/\*\*Policy:\*\* Seminar\/Webinar Attendance, from what you described \("missed the webinar"\) — the policy manual's section on page 37/);

    state.draft = { values: {}, checked: { offense_type: ["standards_of_conduct"] } };
    const { reference } = await create();
    const form = await review(reference.instanceId);
    expect(field(form, "offense_type")!.checked).toEqual(["absenteeism"]);
    expect(field(form, "policy_violated")!.value).toBe("Absenteeism — Seminar/Webinar Attendance");
    expect(field(form, "policy_language")!.value).toContain("is treated as a no call no show to a scheduled shift");
  });

  /* Owner decision, 22 Oct 2026: a missed meeting is Attendance, so this no longer asks "which policy?" first. */
  it("where the manual does not say, it is still Attendance — and the form says so", async () => {
    // The manual as the other tests hold it: its Attendance section says nothing about meetings.
    const { responses, create } = await conversation([E1]);

    expect(responses[0]!.content).not.toMatch(/Which policy applies/);
    expect(responses[0]!.content).toMatch(/\*\*Policy:\*\* Attendance — missing the monthly meeting is an absence from a scheduled shift\./);

    state.draft = { values: {}, checked: { offense_type: ["standards_of_conduct"] } };
    const { reference } = await create();
    const form = await review(reference.instanceId);
    expect(field(form, "offense_type")!.checked).toEqual(["absenteeism"]);
    expect(field(form, "policy_language")!.value).toContain("Source: JBA Policy Manual — Attendance, p. 14");
    expect(field(form, "warning_type")!.checked).toEqual(["written"]);
    expect(field(form, "prior_actions")!.value).toBe(
      "Coaching — JBA Policy Manual — signed 01/01/2026\nVerbal corrective action — signed 09/01/2026",
    );
  });

  it('answered "standards of conduct", the form is the Standards of Conduct', async () => {
    const { create } = await conversation([E1, "standards of conduct"]);
    state.draft = { values: {}, checked: { offense_type: ["absenteeism"] } };
    const { reference } = await create();
    const form = await review(reference.instanceId);
    expect(field(form, "offense_type")!.checked).toEqual(["standards_of_conduct"]);
    expect(field(form, "policy_language")!.value).toContain("Standards of Conduct");
  });
});

/* ========================================================================= */
/* QA, 22 Oct 2026 — HR's incidents and new wording, end to end (mocked)      */
/* ========================================================================= */

/*
 * Synthetic people only. The routes, the proposal flow, the drafting guard
 * and the store are the real code; Supabase is the in-memory fake and the
 * model's tool call is `state.draft`. "Reopen" is a fresh GET of the stored
 * form, which is what the chat card and Form Monitoring both do.
 */
async function finalize(id: string, acknowledge = false) {
  joinOverview();
  const response = await instanceRoute.POST(
    new Request(`https://app.test/api/forms/instances/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "finalize", ...(acknowledge ? { acknowledgeUnverifiedPolicy: true } : {}) }),
    }),
    { params: Promise.resolve({ id }) },
  );
  return { status: response.status, body: (await response.json()) as { error?: string; code?: string } };
}

async function save(id: string, values: Record<string, string>) {
  joinOverview();
  const response = await instanceRoute.PATCH(
    new Request(`https://app.test/api/forms/instances/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values }),
    }),
    { params: Promise.resolve({ id }) },
  );
  expect(response.status).toBe(200);
}

const MEETING_OBSERVATION = {
  values: { observation: "Observed:\nTess Varga did not attend the monthly meeting on October 20, 2026." },
  checked: { offense_type: ["standards_of_conduct"] },
};

describe("QA 22 Oct: the 21 Oct missed-meeting request, created, reopened and finalized", () => {
  it("fills every section it was told, invents none it was not, and finalizes without an override", async () => {
    const { last, proposal, create } = await conversation([E1]);
    expect(proposal.warningLevel).toBe("written");
    expect(proposal.payrollDeduct).toBe("no");
    expect(proposal.formDate).toBe("2026-10-20");
    // Main's missed-meeting reading (release merge, 22 Oct 2026) words the line "**Policy:** Attendance …".
    expect(last.content).toMatch(/\*\*Policy:\*\* Attendance\b/);
    expect(last.content).not.toMatch(/no[- ]call|no[- ]show/i);

    state.draft = MEETING_OBSERVATION;
    const { reference } = await create();
    const form = await review(reference.instanceId);

    expect(field(form, "employee_name")!.value).toBe("Tess Varga");
    expect(field(form, "form_date")!.value).toBe("2026-10-20");
    expect(field(form, "warning_type")!.checked).toEqual(["written"]);
    expect(field(form, "payroll_deduct")!.checked).toEqual(["no"]);
    expect(field(form, "prior_actions")!.value).toBe(
      "Coaching — JBA Policy Manual — signed 01/01/2026\nVerbal corrective action — signed 09/01/2026",
    );
    expect(field(form, "observation")!.value).toContain("monthly meeting on October 20, 2026");
    expect(field(form, "offense_type")!.checked).toEqual(["absenteeism"]);
    expect(field(form, "policy_language")!.value).toContain("Source: JBA Policy Manual — Attendance, p. 14");
    expect(field(form, "policy_language")!.provenance?.verified).toBe(true);
    expect(field(form, "action_plan")!.value).toBe(`Management will review the Attendance policy with Tess. ${CLOSING}`);

    // Nothing that was not said: no termination or demotion, no write-in,
    // no signature, no follow-up date, and nothing about a no-call/no-show.
    expect(field(form, "warning_type")!.checked).not.toContain("termination");
    expect(field(form, "other_offense")?.value ?? "").toBe("");
    expect(form.values.some((entry) => /signature/i.test(entry.fieldKey))).toBe(false);
    expect(form.instance.followUpDate ?? null).toBeNull();
    expect(JSON.stringify(form.values)).not.toMatch(/no[- ]call|no[- ]show/i);

    // Reopened (a second GET) it is the same form.
    expect((await review(reference.instanceId)).values).toEqual(form.values);

    const finalized = await finalize(reference.instanceId);
    expect(finalized.status).toBe(200);
  });
});

describe("QA 22 Oct: short answers and corrections keep the account", () => {
  it('"verbal please" after the request fills the level and keeps every other fact', async () => {
    const { proposal, create } = await conversation([E1.replace("a written CA", "a CA"), "verbal please"]);
    expect(proposal.warningLevel).toBe("verbal");
    expect(proposal.payrollDeduct).toBe("no");
    expect(proposal.formDate).toBe("2026-10-20");

    state.draft = MEETING_OBSERVATION;
    const { reference } = await create();
    const form = await review(reference.instanceId);
    expect(field(form, "warning_type")!.checked).toEqual(["verbal"]);
    expect(field(form, "prior_actions")!.value).toContain("Verbal corrective action — signed 09/01/2026");
    expect(described()).toContain("not attending the monthly meeting on 10-20-26");
  });

  it("written → actually verbal before the draft: the correction wins, nothing else is lost", async () => {
    const { proposal, create } = await conversation([E1, "actually make it a verbal"]);
    expect(proposal.warningLevel).toBe("verbal");
    expect(proposal.payrollDeduct).toBe("no");

    state.draft = MEETING_OBSERVATION;
    const { reference } = await create();
    const form = await review(reference.instanceId);
    expect(field(form, "warning_type")!.checked).toEqual(["verbal"]);
    expect(field(form, "prior_actions")!.value).toContain("Coaching — JBA Policy Manual — signed 01/01/2026");
    expect(field(form, "payroll_deduct")!.checked).toEqual(["no"]);
  });

  it("a policy the manager names afterwards overrides the reading", async () => {
    const { proposal, create } = await conversation([E1, "the policy violated is the standards of conduct"]);
    expect(proposal.warningLevel).toBe("written");

    state.draft = { ...MEETING_OBSERVATION, checked: { offense_type: ["absenteeism"] } };
    const { reference } = await create();
    const form = await review(reference.instanceId);
    expect(field(form, "offense_type")!.checked).toEqual(["standards_of_conduct"]);
    expect(field(form, "warning_type")!.checked).toEqual(["written"]);
  });

  it("the same answer twice changes nothing and duplicates nothing", async () => {
    const { proposal, create } = await conversation([E1.replace("a written CA", "a CA"), "written", "written"]);
    expect(proposal.warningLevel).toBe("written");

    state.draft = MEETING_OBSERVATION;
    const { reference } = await create();
    const form = await review(reference.instanceId);
    expect(field(form, "prior_actions")!.value!.split("\n")).toHaveLength(2);
  });

  it("three presses of the same card at the same moment file one form (round 3)", async () => {
    const { create } = await conversation([E1]);
    state.draft = MEETING_OBSERVATION;
    const results = await Promise.all([create(), create(), create()]);
    expect(new Set(results.map((result) => result.reference.instanceId)).size).toBe(1);
    expect(store.form_instances).toHaveLength(1);
  });

  /*
   * Changed on purpose at the release merge (22 Oct 2026): `main`'s one
   * mechanism keys the row on the card (`cardInstanceId`), so the same card
   * pressed after Finalize hands back its finalized form — it never files a
   * second record. A new request is a new card.
   */
  it("after the card's form is finalized, the same card files no second form", async () => {
    const { create } = await conversation([E1]);
    state.draft = MEETING_OBSERVATION;
    const first = await create();
    expect((await finalize(first.reference.instanceId)).status).toBe(200);
    const second = await create();
    expect(second.reference.instanceId).toBe(first.reference.instanceId);
    expect(store.form_instances).toHaveLength(1);
  });

  it("pressing Create again for the same card reuses the draft instead of filing a second", async () => {
    const { create } = await conversation([E1]);
    state.draft = MEETING_OBSERVATION;
    const first = await create();
    const second = await create();
    expect(second.reference.instanceId).toBe(first.reference.instanceId);
    expect(store.form_instances).toHaveLength(1);
  });
});

describe("QA 22 Oct: wording not in any earlier example", () => {
  it.each([
    "need a written ca for tess varga, she never showed up to our 10/20/26 monthly meeting. payroll deduct no",
    "tess varga didn't come to the monthly meeting on 10/20/26. create a written CA for her. no payroll deduct",
    "create a written corrective action for tess varga — she skipped the mandatory store meeting 10-20-26. payroll deduct n/a",
  ])("%s", async (text) => {
    const { proposal, last, create } = await conversation([text]);
    expect(proposal.employeeName).toBe("Tess Varga");
    expect(proposal.warningLevel).toBe("written");
    expect(proposal.payrollDeduct).toBe("no");
    // Main's missed-meeting reading (release merge, 22 Oct 2026) words the line "**Policy:** Attendance …".
    expect(last.content).toMatch(/\*\*Policy:\*\* Attendance\b/);

    state.draft = MEETING_OBSERVATION;
    const { reference } = await create();
    const form = await review(reference.instanceId);
    expect(field(form, "offense_type")!.checked).toEqual(["absenteeism"]);
    expect(field(form, "prior_actions")?.value ?? "").toBe("");
  });
});

describe("QA 22 Oct: what was not said stays open", () => {
  it("no level, no payroll answer, no history: asked, and left blank on the form", async () => {
    const { proposal, last, create } = await conversation([
      "create a CA for tess varga for missing the monthly meeting on 10-20-26",
    ]);
    expect(proposal.warningLevel ?? null).toBeNull();
    expect(proposal.payrollDeduct ?? null).toBeNull();
    expect(last.content).toMatch(/Verbal Warning\*\* or a \*\*Written Warning/);
    expect(last.content).toMatch(/payroll deduct applicable/i);

    state.draft = MEETING_OBSERVATION;
    const { reference } = await create();
    const form = await review(reference.instanceId);
    expect(field(form, "warning_type")?.checked ?? []).toEqual([]);
    expect(field(form, "payroll_deduct")?.checked ?? []).toEqual([]);
    expect(field(form, "prior_actions")?.value ?? "").toBe("");
  });
});

describe("QA 22 Oct: the edited-policy warning", () => {
  it("appears only when the verified wording itself was changed", async () => {
    const { create } = await conversation([E1]);
    state.draft = MEETING_OBSERVATION;
    const { reference } = await create();

    // Another field edited: still verified, no warning.
    await save(reference.instanceId, { observation: "Observed:\nTess Varga missed the 10/20/2026 monthly meeting." });
    const form = await review(reference.instanceId);
    expect(field(form, "policy_language")!.provenance?.verified).toBe(true);

    // The quote rewritten: Finalize asks, and says why.
    await save(reference.instanceId, { policy_language: "Attendance at meetings is required." });
    const refused = await finalize(reference.instanceId);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("policy_verification_required");
    expect(refused.body.error).toMatch(/^You edited the policy wording on this form/);

    const acknowledged = await finalize(reference.instanceId, true);
    expect(acknowledged.status).toBe(200);
  });
});

/*
 * QA, 22 Oct 2026, round 2: requests worded the way managers word them,
 * none of them an earlier example. Each is created and the stored form read
 * back. The first three were known gaps in round 1.
 */
describe("QA 22 Oct: requests in new wording, through to the saved form", () => {
  it.each([
    // [message, level, payroll, date]
    ["write up tess varga, written warning. she blew off the monthly team meeting on 10/20/26. no payroll deduction", "written", "no", "2026-10-20"],
    ["written CA for tess varga: no-show at the 10/20/26 team meeting. payroll deduct not applicable", "written", "no", "2026-10-20"],
    ["Tess Varga skipped the mandatory store meeting 10-20-26 — written CA please, payroll deduct n/a", "written", "no", "2026-10-20"],
    ["please write tess varga up — verbal — she missed the monthly meeting on 10/20/26", "verbal", null, "2026-10-20"],
    ["can you write up tess varga? she skipped the meeting on 10/20/26. it's a written", "written", null, "2026-10-20"],
    ["Tess Varga needs a written CA for missing the meeting on 10-20-26", "written", null, "2026-10-20"],
    ["Verbal C/A — Tess Varga — no-show to team meeting 10/20/26", "verbal", null, "2026-10-20"],
    ["missed the monthly meeting on 10/20/26 — tess varga. verbal ca please", "verbal", null, "2026-10-20"],
    ["Tess Varga missed the meeting on 10/20/26. Create a verbal CA for her.", "verbal", null, "2026-10-20"],
    ["remy calder blew off the training session 10/19/26, written warning, no payroll deduction", "written", "no", "2026-10-19"],
  ])("%s", async (text, level, payroll, date) => {
    const { proposal, create } = await conversation([text]);
    expect(proposal.templateKey).toBe("dpoa");
    expect(proposal.employeeName).toMatch(/^(?:Tess Varga|Remy Calder)$/);
    expect(proposal.warningLevel ?? null).toBe(level);
    expect(proposal.payrollDeduct ?? null).toBe(payroll);
    expect(proposal.formDate).toBe(date);

    state.draft = MEETING_OBSERVATION;
    const { reference } = await create();
    const form = await review(reference.instanceId);
    expect(field(form, "employee_name")!.value).toBe(proposal.employeeName);
    expect(field(form, "warning_type")!.checked).toEqual([level]);
    expect(field(form, "payroll_deduct")?.checked ?? []).toEqual(payroll ? [payroll] : []);
    expect(field(form, "form_date")!.value).toBe(date);
    expect(field(form, "offense_type")!.checked).toEqual(["absenteeism"]);
    expect(field(form, "prior_actions")?.value ?? "").toBe("");
  });

  it("\"Write up Tess Varga for missing the meeting.\" opens her form and asks what it does not know", async () => {
    const { proposal, last } = await conversation(["Write up Tess Varga for missing the meeting."]);
    expect(proposal.templateKey).toBe("dpoa");
    expect(proposal.employeeName).toBe("Tess Varga");
    expect(proposal.warningLevel ?? null).toBeNull();
    expect(last.content).toMatch(/Verbal Warning\*\* or a \*\*Written Warning/);
    expect(last.content).toMatch(/payroll deduct applicable/i);
  });

  it("two people named: asked who each form is for, nothing created and nobody guessed", async () => {
    const { proposal, last } = await conversation([
      "write up tess varga and remy calder, written warning, they both skipped the 10/20/26 meeting",
    ]);
    expect(proposal).toBeUndefined();
    expect(last.formProposals ?? []).toEqual([]);
    expect(last.content).toMatch(/Who is each one for\?/);
  });

  it("a level on file is never this form's: \"she had a written CA, verbal ca please\" is verbal", async () => {
    const { proposal } = await conversation([
      "tess varga had a written CA in august. she missed the 10/20/26 meeting. verbal ca please",
    ]);
    expect(proposal.warningLevel).toBe("verbal");
  });
});

/**
 * The chat as it really runs: a turn the form intake does not take goes to an
 * ordinary answer (stood in for here), stays in the history, and the open card
 * is still the one continued. Returns which turns the intake took.
 */
async function chatTurns(turns: string[]) {
  const messages: ChatMessage[] = [];
  const taken: boolean[] = [];
  /* Whether the form intake answered the turn at all, rather than an ordinary answer. */
  const replied: boolean[] = [];
  let lastProposal: NonNullable<Awaited<ReturnType<typeof proposeFormForTurn>>> | null = null;
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
    taken.push(Boolean(response?.formProposal));
    replied.push(response !== null && response !== undefined);
    if (response?.formProposal) {
      lastProposal = response;
      open = response.formProposal.templateKey;
    }
    messages.push(message, {
      id: `a${sequence}`,
      role: "assistant",
      content: response?.content ?? "Noted.",
      createdAt: "2026-10-21T15:00:01Z",
      ...(response?.formProposal ? { formProposal: response.formProposal } : {}),
    } as ChatMessage);
  }
  return {
    taken,
    replied,
    // Read only where a form was proposed; a turn that started none leaves it unread.
    get proposal() {
      return lastProposal!.formProposal!;
    },
    create: async () => createInlineForm({ proposal: lastProposal!.formProposal!, messages, call, onCreated: () => {} }),
  };
}

describe("QA 22 Oct: answers given one at a time while the card is open", () => {
  const TURNS = [
    "create a CA for tess varga for not attending the monthly meeting on 10-20-26",
    "written",
    "prior coaching JBA Policy Manual 1-1-26, verbal ca 9-1-26",
    "no payroll deduct",
  ];

  it("records which turns the intake takes, and the final card holds every answer", async () => {
    const { taken, proposal, create } = await chatTurns(TURNS);
    expect(taken).toEqual([true, true, true, true]);
    expect(proposal.warningLevel).toBe("written");
    expect(proposal.payrollDeduct).toBe("no");

    state.draft = MEETING_OBSERVATION;
    const { reference } = await create();
    const form = await review(reference.instanceId);
    expect(field(form, "warning_type")!.checked).toEqual(["written"]);
    expect(field(form, "payroll_deduct")!.checked).toEqual(["no"]);
    expect(field(form, "prior_actions")!.value).toBe(
      "Coaching — JBA Policy Manual — signed 01/01/2026\nVerbal corrective action — signed 09/01/2026",
    );
    expect(field(form, "offense_type")!.checked).toEqual(["absenteeism"]);
  });
});

describe("QA 22 Oct: corrections while the card is open, before Create", () => {
  it("every turn updates the same card, the latest answer wins, and nothing earlier is lost", async () => {
    const { taken, proposal, create } = await chatTurns([
      "create a CA for tess varga for missing the monthly meeting",
      "it was on 10/20/26",
      "make it written",
      "actually verbal",
      "prior coaching jba policy manual 1-1-26",
      "no payroll deduct",
      "use standards of conduct instead",
    ]);
    expect(taken).toEqual([true, true, true, true, true, true, true]);
    expect(proposal.employeeName).toBe("Tess Varga");
    expect(proposal.warningLevel).toBe("verbal");
    expect(proposal.payrollDeduct).toBe("no");
    expect(proposal.formDate).toBe("2026-10-20");

    state.draft = { ...MEETING_OBSERVATION, checked: { offense_type: ["absenteeism"] } };
    const { reference } = await create();
    const form = await review(reference.instanceId);
    expect(field(form, "warning_type")!.checked).toEqual(["verbal"]);
    expect(field(form, "form_date")!.value).toBe("2026-10-20");
    expect(field(form, "payroll_deduct")!.checked).toEqual(["no"]);
    expect(field(form, "prior_actions")!.value).toBe("Coaching — JBA Policy Manual — signed 01/01/2026");
    expect(field(form, "offense_type")!.checked).toEqual(["standards_of_conduct"]);
    expect(store.form_instances).toHaveLength(1);
  });
});

/*
 * ============================================================================
 * ROUND 3 (QA, 22 Oct 2026): HOW MANAGERS ACTUALLY TYPE IT, THROUGH TO THE SAVED FORM
 * ============================================================================
 *
 * Two sets of phrasings: the ten the round-3 report found wanting, and sixteen
 * written afterwards, without looking at the readers, to test wording nobody
 * tuned for. Each conversation runs through the real proposal flow, is
 * created, and the SAVED form is read back — never only the card. Every turn
 * after the first request must stay with the form (no ordinary answer in the
 * middle of an account). `offense` null leaves the box unchecked here: lateness
 * and a short register are asked about rather than guessed.
 */
const NEUTRAL_DRAFT = { values: { observation: "Observed:\nAs the manager described." }, checked: {} };

type Round3Case = {
  turns: string[];
  employee: string;
  level: "verbal" | "written";
  payroll: "yes" | "no";
  /* null: a date given only as a deadline ("due 10/15/26") never dates the form (release decision F-03). */
  date: string | null;
  offense: string | null;
  /* POLICY_SPECIFIC_TOPICS_ENABLED: a register or drawer shortage is the Standards of Conduct (page 13), ticked where the model ticked nothing. */
  offenseOn?: string;
  prior: RegExp | "" | "none";
};

const ROUND3_CASES: Round3Case[] = [
  // The ten from the round-3 report.
  { turns: ["Hey, I need to document a written warning for Tess Varga — she didn't show for our 10/20/26 staff meeting. No deduction from her pay. She got coached on the handbook back on 1/1/26."], employee: "Tess Varga", level: "written", payroll: "no", date: "2026-10-20", offense: "absenteeism", prior: /^Coaching — signed 01\/01\/2026$/ },
  { turns: ["tess varga — no call to the 10/20/26 manager meeting, issue a verbal, previously verbally warned 9/1/26, payroll not applicable"], employee: "Tess Varga", level: "verbal", payroll: "no", date: "2026-10-20", offense: "absenteeism", prior: /^Verbal warning — signed 09\/01\/2026$/ },
  { turns: ["Doc a CA on Tess Varga. Missed mandatory meeting 10.20.26. Level: written. Payroll ded: N"], employee: "Tess Varga", level: "written", payroll: "no", date: "2026-10-20", offense: "absenteeism", prior: "" },
  { turns: ["Can we put Tess Varga on a written for skipping the 10/20/26 meeting? She's had a verbal before on 9/1/26. Don't deduct."], employee: "Tess Varga", level: "written", payroll: "no", date: "2026-10-20", offense: "absenteeism", prior: /^Verbal warning — signed 09\/01\/2026$/ },
  { turns: ["I'd like a verbal corrective for Remy Calder, register was $5 short on 10/19/26, $5 payroll deduction applies"], employee: "Remy Calder", level: "verbal", payroll: "yes", date: "2026-10-19", offense: null, offenseOn: "standards_of_conduct", prior: "" },
  { turns: ["remy calder came in 45 min late on 10/19/26 — write her up, verbal, payroll deduct none"], employee: "Remy Calder", level: "verbal", payroll: "no", date: "2026-10-19", offense: null, prior: "" },
  { turns: ["I have to write someone up", "Tess Varga", "she skipped the monthly meeting on 10/20/26", "written", "she had coaching on the jba manual 1/1/26 and a verbal ca 9/1/26", "no deduction"], employee: "Tess Varga", level: "written", payroll: "no", date: "2026-10-20", offense: "absenteeism", prior: /^Coaching — signed 01\/01\/2026\nVerbal corrective action — signed 09\/01\/2026$/ },
  { turns: ["need a CA for tess varga for missing the 10/20/26 meeting, verbal", "sorry, make that written", "wait, the meeting was 10/19/26", "she was coached 1-1-26 on the jba manual", "payroll deduct n/a"], employee: "Tess Varga", level: "written", payroll: "no", date: "2026-10-19", offense: "absenteeism", prior: /^Coaching — signed 01\/01\/2026$/ },
  { turns: ["tess varga blew off her woven training due 10/15/26", "can you start a verbal ca for that", "first offense", "no payroll"], employee: "Tess Varga", level: "verbal", payroll: "no", date: null, offense: "standards_of_conduct", prior: "none" },
  // Written afterwards, unseen by the readers.
  { turns: ["Tess Varga missed our team meeting yesterday 10/21/26 without telling anyone. I want to give her a written. No payroll deduction. She was coached on attendance 8/15/26."], employee: "Tess Varga", level: "written", payroll: "no", date: "2026-10-21", offense: "absenteeism", prior: /^Coaching.* — signed 08\/15\/2026$/ },
  { turns: ["Need to write up Remy Calder. He was 30 minutes late to his shift on 10/18/26. Verbal warning. Payroll deduct: no."], employee: "Remy Calder", level: "verbal", payroll: "no", date: "2026-10-18", offense: null, prior: "" },
  { turns: ["remy calder's drawer came up $20 short on 10/17/26. lets do a written ca, deduct the $20 from payroll"], employee: "Remy Calder", level: "written", payroll: "yes", date: "2026-10-17", offense: null, offenseOn: "standards_of_conduct", prior: "" },
  { turns: ["could you draft a verbal corrective action for Tess Varga? she skipped the 10/14/26 store meeting. not deducting pay"], employee: "Tess Varga", level: "verbal", payroll: "no", date: "2026-10-14", offense: "absenteeism", prior: "" },
  { turns: ["Tess Varga ditched the 10/20/26 all-hands meeting. Final step isn't needed yet, just a verbal. Payroll: N/A. No prior coaching."], employee: "Tess Varga", level: "verbal", payroll: "no", date: "2026-10-20", offense: "absenteeism", prior: "none" },
  { turns: ["Please document a written CA for Remy Calder — she didn't finish her Woven modules by the 10/12/26 deadline. She got a verbal for the same thing 9/10/26. No deduction."], employee: "Remy Calder", level: "written", payroll: "no", date: null, offense: "standards_of_conduct", prior: /^Verbal warning.* — signed 09\/10\/2026$/ },
  { turns: ["I need a corrective action", "it's for remy calder", "she ignored her woven training that was due 10/16/26", "verbal", "nothing prior", "no deduct"], employee: "Remy Calder", level: "verbal", payroll: "no", date: null, offense: "standards_of_conduct", prior: "none" },
  { turns: ["tess varga needs a write up", "she bailed on the 10/19/26 meeting", "make it a written warning", "oh and she had a verbal 9/2/26", "payroll no"], employee: "Tess Varga", level: "written", payroll: "no", date: "2026-10-19", offense: "absenteeism", prior: /^Verbal warning — signed 09\/02\/2026$/ },
  { turns: ["write up for tess varga, missed meeting 10/20/26, written", "actually make it verbal", "no payroll deduction"], employee: "Tess Varga", level: "verbal", payroll: "no", date: "2026-10-20", offense: "absenteeism", prior: "" },
  { turns: ["corrective action for remy calder for being late 10/15/26, verbal, no deduct", "correction: it was 10/16/26 not 10/15"], employee: "Remy Calder", level: "verbal", payroll: "no", date: "2026-10-16", offense: null, prior: "" },
  { turns: ["Remy Calder - CA - written - no call no show to manager meeting 10/13/26 - payroll deduction no - prior coaching 7/1/26"], employee: "Remy Calder", level: "written", payroll: "no", date: "2026-10-13", offense: "absenteeism", prior: /^Coaching — signed 07\/01\/2026$/ },
  { turns: ["Hi, can you help me start a written warning for Tess Varga? She never came to the 10/20/26 monthly meeting. We aren't docking her pay."], employee: "Tess Varga", level: "written", payroll: "no", date: "2026-10-20", offense: "absenteeism", prior: "" },
  { turns: ["I'd like to issue Remy Calder a verbal for showing up late on 10/18/26. No payroll deduction. First time."], employee: "Remy Calder", level: "verbal", payroll: "no", date: "2026-10-18", offense: null, prior: "none" },
];

describe("QA 22 Oct, round 3: everyday wording, single messages and multi-turn, through to the saved form", () => {
  /*
   * Each case runs with the flag OFF (the expectation main has always had) and,
   * where POLICY_SPECIFIC_TOPICS_ENABLED changes it on purpose, again with it ON:
   * a register or drawer shortage is the Standards of Conduct (page 13), ticked
   * where the model ticked nothing. The flag is set explicitly either way.
   */
  afterEach(() => vi.unstubAllEnvs());
  const round3 = async (c: Round3Case, on: boolean) => {
    vi.stubEnv("POLICY_SPECIFIC_TOPICS_ENABLED", on ? "true" : "");
    const { taken, replied, proposal, create } = await chatTurns(c.turns);
    // Once the form is asked for, every later turn stays with it.
    const first = taken.indexOf(true);
    expect(first, "no turn produced the form").toBeGreaterThanOrEqual(0);
    expect(replied.slice(first), "a turn after the request left the form").toEqual(replied.slice(first).map(() => true));
    expect(taken.slice(first)).toEqual(taken.slice(first).map(() => true));

    expect(proposal.templateKey).toBe("dpoa");
    expect(proposal.employeeName).toBe(c.employee);
    expect(proposal.warningLevel).toBe(c.level);
    expect(proposal.payrollDeduct).toBe(c.payroll);
    expect(proposal.formDate).toBe(c.date);

    state.draft = NEUTRAL_DRAFT;
    const { reference } = await create();
    const form = await review(reference.instanceId);
    expect(field(form, "employee_name")!.value).toBe(c.employee);
    expect(field(form, "warning_type")!.checked).toEqual([c.level]);
    expect(field(form, "payroll_deduct")!.checked).toEqual([c.payroll]);
    if (c.date) expect(field(form, "form_date")!.value).toBe(c.date);
    else expect(field(form, "form_date")?.value ?? "").not.toMatch(/^2026-10-1[256]$/);
    const offense = on && c.offenseOn ? c.offenseOn : c.offense;
    expect(field(form, "offense_type")?.checked ?? []).toEqual(offense ? [offense] : []);
    const prior = field(form, "prior_actions")?.value ?? "";
    if (c.prior === "none") expect(prior).toBe("None — first occurrence");
    else if (c.prior === "") expect(prior).toBe("");
    else expect(prior).toMatch(c.prior);
  };

  it.each(ROUND3_CASES.map((c) => [c.turns.join(" ⏎ "), c] as const))("%s", (_label, c) => round3(c, false));

  it.each(ROUND3_CASES.filter((c) => c.offenseOn).map((c) => [c.turns.join(" ⏎ "), c] as const))(
    "POLICY_SPECIFIC_TOPICS_ENABLED on: %s",
    (_label, c) => round3(c, true),
  );

  it.each([
    "What's our policy on missing meetings?",
    "how do I write up an employee?",
    "can you give me a written summary of the attendance policy",
    "I want everyone to get a written copy of the schedule",
  ])("a question or an unrelated request starts no form: %s", async (text) => {
    const { taken } = await chatTurns([text]);
    expect(taken).toEqual([false]);
  });
});
