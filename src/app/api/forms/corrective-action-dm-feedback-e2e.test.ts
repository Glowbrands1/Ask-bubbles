import { rosterResultFor } from "@/test/roster-result";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { AccessScope, ChatMessage } from "@/types";

/**
 * ============================================================================
 * CORRECTIVE ACTION FEEDBACK FROM A DISTRICT MANAGER, 21 OCT 2026 — END TO END
 * ============================================================================
 *
 * Four production conversations, each rated low, replayed through the real
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
 * which stands in for the section's first paragraph.
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

const MANUAL = { chunks: [STANDARDS_OF_CONDUCT_CHUNK, ATTENDANCE_CHUNK, VISITORS_CHUNK] };

/* The production turns, names replaced. */
const A1 =
  "create verbal CA for remy calder for violating visitors at work policy on 10-10-26. juno spent 40 minutes talking with friend and ignoring guests. previous coaching was jba policy manual 1-1-26";
const B1 =
  "create ca form for tess varga for violating attendance policy on 10-20-26. verbal. no payroll deduct. jba manual 1-1-26 for previous coaching";

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
});

/* ========================================================================= */
/* A4 — A POLICY NAMED BY THE MANUAL'S OWN SECTION                            */
/* ========================================================================= */

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

    expect(last.content).toMatch(/couldn't find a section of the current policy manual for "unicorn parking"/);

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
