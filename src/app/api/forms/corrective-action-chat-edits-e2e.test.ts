import { rosterResultFor } from "@/test/roster-result";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
const { correctActiveForm } = await import("@/lib/forms/chat-correction");
const { changeActiveFormPolicy } = await import("@/lib/forms/chat-policy-change");
const { reviseActiveForm } = await import("@/lib/forms/chat-revision");
const { describeOpenForm } = await import("@/lib/forms/open-form-summary");
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

/* ========================================================================= */
/* A POLICY NAMED IN THE CONVERSATION GOES ONTO THE OPEN FORM                 */
/* ========================================================================= */

describe("a policy named in the conversation goes onto the open form", () => {
  it("adds Late Opening to Direct policy, in the manual's own words, as verified", async () => {
    const { id, history } = await createdForm();
    expect((await row(id, "policy_language"))?.value).toContain("Source: JBA Policy Manual — Attendance, p. 14");
    expect((await row(id, "action_plan"))?.value).toMatch(/^Management will review the Attendance policy with Pat\./);

    const answer = await changeActiveFormPolicy({
      request: chat(),
      instanceId: id,
      question: "can you add late opening policy to the direct policy section of this form",
      history,
    });

    expect(answer?.content).toMatch(/Updated Direct policy from official manual on the \*\*Corrective Action Form\*\* for \*\*Pat Rivera\*\*/);
    expect(answer?.content).toContain("**Late Opening:**");
    expect(answer?.content).not.toMatch(/no form has been created/i);
    expect(answer?.formUpdate).toEqual({ instanceId: id, updated: ["policy_language", "policy_violated", "action_plan"] });
    expect(store.form_instances).toHaveLength(1);
    /* Policy Violated names the section beside its box, as a first draft does (District Manager feedback, 21 Oct 2026). */
    expect((await row(id, "policy_violated"))?.value).toBe("Tardiness/Leaving Early — Late Opening");
    /* The Action Plan follows Direct policy: both sections, in the order cited. */
    expect(answer?.content).toContain("The Action Plan now says management will review the Attendance and Late Opening policies with Pat.");
    expect((await row(id, "action_plan"))?.value).toBe(
      "Management will review the Attendance and Late Opening policies with Pat. Future policy violations may result in additional corrective action up to and including termination of employment.",
    );

    const policy = await row(id, "policy_language");
    expect(policy?.value).toContain("When an employee assigned to open a location is unable to open the location");
    expect(policy?.value).toContain("Source: JBA Policy Manual — Late Opening, p. 15");
    expect(policy?.value).toContain("Source: JBA Policy Manual — Attendance, p. 14");
    expect(policy?.filledBy).toBe("ai");
    expect(policy?.provenance).toMatchObject({ verified: true, source: "official_policy_manual", via: "chat_policy_change" });
  });

  it("keeps what was cited when the manager says add, and replaces it when they say instead", async () => {
    const { id, history } = await createdForm();

    await changeActiveFormPolicy({ request: chat(), instanceId: id, question: "add the late opening policy too", history });
    const added = (await row(id, "policy_language"))?.value ?? "";
    expect(added).toContain("Attendance");
    expect(added).toContain("Late Opening");

    const swapped = await changeActiveFormPolicy({
      request: chat(),
      instanceId: id,
      question: "Actually use the dress code policy instead",
      history,
    });
    const value = (await row(id, "policy_language"))?.value ?? "";
    expect(value).toContain("Dress Code for The Company");
    expect(value).not.toContain("Late Opening");
    expect(value).not.toContain("Attendance");
    expect(swapped?.content).toMatch(/no longer cites/i);
    /* Late Opening is no longer cited, so Policy Violated no longer names it beside the box. */
    expect((await row(id, "policy_violated"))?.value).toBe("Tardiness/Leaving Early");
  });

  it("removes a section the manager takes off, and blanks the line when it was the only one", async () => {
    const { id, history } = await createdForm();

    const answer = await changeActiveFormPolicy({
      request: chat(),
      instanceId: id,
      question: "take the attendance policy off the form",
      history,
    });
    expect(answer?.content).toMatch(/Removed \*\*Attendance\*\* \(page 14\)/);
    expect(answer?.content).toMatch(/That line is now blank/);
    expect((await row(id, "policy_language"))?.value ?? "").toBe("");
  });

  it("finds a section named the way managers name it, as a first draft does", async () => {
    const { id, history } = await createdForm();
    await changeActiveFormPolicy({
      request: chat(),
      instanceId: id,
      question: "use the visitors at work policy instead",
      history,
    });
    expect((await row(id, "policy_language"))?.value).toContain("Source: JBA Policy Manual — Visitors in the Workplace, p. 30");
  });

  it("says plainly when the manual has no such section, and changes nothing", async () => {
    const { id, history } = await createdForm();
    const before = (await row(id, "policy_language"))?.value;

    const answer = await changeActiveFormPolicy({
      request: chat(),
      instanceId: id,
      question: "add the moon landing policy",
      history,
    });
    expect(answer?.content).toMatch(/couldn't find a section called "moon landing" in the JBA Policy Manual/);
    expect((await row(id, "policy_language"))?.value).toBe(before);
  });

  it("reads 'that policy' from the turn that quoted it", async () => {
    const { id, history } = await createdForm();
    const quoted: ChatMessage[] = [
      ...history,
      said("what does the manual say about opening late?"),
      answered("The manual's Late Opening section says the employee must notify the manager."),
    ];
    await changeActiveFormPolicy({ request: chat(), instanceId: id, question: "please use that policy on the form", history: quoted });
    const value = (await row(id, "policy_language"))?.value ?? "";
    expect(value).toContain("Late Opening");
    expect(value).not.toContain("Attendance");
  });

  it("leaves a turn that names no policy, a question, or another form to the ordinary flow", async () => {
    const { id, history } = await createdForm();
    for (const question of [
      "I have independently verified and the policy is correct you may issue",
      "what is the late opening policy?",
      "create a corrective action for Dana Moss for the dress code policy",
      "add the dress code policy to Dana Moss's form",
    ]) {
      expect(await changeActiveFormPolicy({ request: chat(), instanceId: id, question, history }), question).toBeNull();
    }
  });

  it("says so, and changes nothing, when the manual cannot be read or cannot be settled", async () => {
    const { id, history } = await createdForm();
    const before = (await row(id, "policy_language"))?.value;

    state.manual = null;
    const down = await changeActiveFormPolicy({ request: chat(), instanceId: id, question: "add the late opening policy", history });
    expect(down?.content).toMatch(/couldn't read the official policy manual/);

    state.manualProblem = "ambiguous";
    const two = await changeActiveFormPolicy({ request: chat(), instanceId: id, question: "add the late opening policy", history });
    expect(two?.content).toMatch(/More than one document .* claims to be the official policy manual/);

    expect((await row(id, "policy_language"))?.value).toBe(before);
  });
});

/* ========================================================================= */
/* A SECTION CITED UNDER VIOLATION OF COMPANY POLICIES                        */
/* ========================================================================= */

describe("a section cited under Violation of Company Policies", () => {
  it("keeps Policy Violated naming the section Direct policy cites", async () => {
    const { id, history } = await createdForm(
      "create verbal CA for pat rivera for violating visitors at work policy on 10-10-26. pat spent 40 minutes talking with a friend and ignoring guests. payroll deduct no.",
      { values: { observation: "Observed:\nPat Rivera spent 40 minutes talking with a friend." }, checked: {} },
    );
    expect((await row(id, "offense_type"))?.checked).toEqual(["company_policies"]);
    expect((await row(id, "policy_violated"))?.value).toBe("Violation of Company Policies — Visitors in the Workplace");
    expect((await row(id, "action_plan"))?.value).toBe(
      "Management will review the Visitors in the Workplace policy with Pat. Future policy violations may result in additional corrective action up to and including termination of employment.",
    );

    const answer = await changeActiveFormPolicy({
      request: chat(),
      instanceId: id,
      question: "use the cell phone policy instead",
      history,
    });

    expect(answer?.formUpdate).toEqual({ instanceId: id, updated: ["policy_language", "policy_violated", "action_plan"] });
    expect((await row(id, "action_plan"))?.value).toBe(
      "Management will review the Cell Phone Usage policy with Pat. Future policy violations may result in additional corrective action up to and including termination of employment.",
    );
    expect(answer?.content).toMatch(/Policy Violated now names the same section/);
    expect((await row(id, "policy_language"))?.value).toContain("Source: JBA Policy Manual — Cell Phone Usage, p. 32");
    expect((await row(id, "policy_violated"))?.value).toBe("Violation of Company Policies — Cell Phone Usage");
    expect((await row(id, "offense_type"))?.checked).toEqual(["company_policies"]);
  });
});

/* ========================================================================= */
/* ANY OTHER CHANGE TO THE OPEN CORRECTIVE ACTION FORM IS MADE IN PLACE       */
/* ========================================================================= */

describe("any other change to the open Corrective Action Form is made in place", () => {
  it("changes the warning level, re-derives Policy Violated, and never lets the model write a policy line", async () => {
    const { id, history } = await createdForm();
    const before = (await row(id, "policy_language"))?.value;
    const plan = (await row(id, "action_plan"))?.value;
    state.draft = {
      values: {
        policy_language: "Invented policy text.",
        policy_violated: "Something else",
        action_plan: "Pat must apologise to the whole team before her next shift.",
      },
      checked: { warning_type: ["written"], offense_type: ["absenteeism"] },
    };

    const answer = await reviseActiveForm({
      request: chat(),
      instanceId: id,
      question: "Change it to a written warning and change the offense to absenteeism",
      history,
      today: "2026-10-20",
    });

    expect(answer?.content).toMatch(/Updated the \*\*Corrective Action Form\*\* for \*\*Pat Rivera\*\*/);
    expect(answer?.content).toMatch(/Direct policy from official manual is as it was/);
    expect(store.form_instances).toHaveLength(1);
    expect((await row(id, "warning_type"))?.checked).toEqual(["written"]);
    expect((await row(id, "offense_type"))?.checked).toEqual(["absenteeism"]);
    expect((await row(id, "policy_violated"))?.value).toBe("Absenteeism");
    expect((await row(id, "policy_language"))?.value).toBe(before);
    /* The Action Plan is built, not drafted: a revision that did not name it leaves it as built. */
    expect((await row(id, "action_plan"))?.value).toBe(plan);
    expect(plan).toMatch(/^Management will review the Attendance policy with Pat\./);
    const system = state.systems.at(-1) ?? "";
    expect(system).toContain("Corrective Action Form");
    expect(system).not.toContain("COACHING IS NOT ALWAYS ABOUT A PROBLEM");
  });

  it("never ticks Termination for the manager", async () => {
    const { id, history } = await createdForm();
    state.draft = { values: {}, checked: { warning_type: ["termination"] } };
    const answer = await reviseActiveForm({
      request: chat(),
      instanceId: id,
      question: "change the warning to termination",
      history,
      today: "2026-10-20",
    });
    expect(answer).not.toBeNull();
    expect(answer!.content).toMatch(/haven't changed the \*\*Corrective Action Form\*\*|didn't tick a termination/);
    expect((await row(id, "warning_type"))?.checked).toEqual(["verbal"]);
    expect(answer!.content).not.toMatch(/Type of Warning/);
  });

  it("changes the Action Plan only when the manager names it, and then leaves their wording alone", async () => {
    const { id, history } = await createdForm();
    state.draft = { values: { action_plan: "Pat will retake the attendance training this week." }, checked: {} };

    const answer = await reviseActiveForm({
      request: chat(),
      instanceId: id,
      question: "change the action plan to say Pat will retake the attendance training this week",
      history,
      today: "2026-10-20",
    });
    expect(answer?.formUpdate?.updated).toContain("action_plan");
    expect((await row(id, "action_plan"))?.value).toBe(
      "Pat will retake the attendance training this week. Future policy violations may result in additional corrective action up to and including termination of employment.",
    );

    /* Asked for in their words, so a later policy change does not rebuild it. */
    const policy = await changeActiveFormPolicy({ request: chat(), instanceId: id, question: "add the late opening policy", history });
    expect(policy?.formUpdate?.updated).toEqual(["policy_language", "policy_violated"]);
    expect((await row(id, "action_plan"))?.value).toMatch(/^Pat will retake the attendance training this week\./);
  });

  it("is not a revision when the manager asks for another Corrective Action", async () => {
    const { id, history } = await createdForm();
    expect(
      await reviseActiveForm({
        request: chat(),
        instanceId: id,
        question: "create a new corrective action for Pat Rivera",
        history,
        today: "2026-10-20",
      }),
    ).toBeNull();
  });

  it("puts the deduction in the Action Plan when payroll deduct is changed to Yes, and takes it out on No", async () => {
    const { id, history } = await createdForm();
    const closing =
      "Future policy violations may result in additional corrective action up to and including termination of employment.";

    const yes = await correctActiveForm({
      request: chat(),
      instanceId: id,
      question: "change payroll deduct to yes, $3.25 will be deducted",
      today: "2026-10-20",
      history,
    });
    expect(yes?.formUpdate?.updated).toEqual(["payroll_deduct", "action_plan"]);
    expect(yes?.content).toMatch(/The Action Plan now states the payroll deduction/);
    expect((await row(id, "action_plan"))?.value).toBe(
      `Management will review the Attendance policy with Pat. $3.25 will be deducted from Pat's pay. ${closing}`,
    );

    const no = await correctActiveForm({
      request: chat(),
      instanceId: id,
      question: "change payroll deduct to no",
      today: "2026-10-20",
      history,
    });
    expect(no?.formUpdate?.updated).toEqual(["payroll_deduct", "action_plan"]);
    expect((await row(id, "action_plan"))?.value).toBe(`Management will review the Attendance policy with Pat. ${closing}`);
  });

  it("takes a bare 'no' as the answer to Ask Bubbles' own payroll question", async () => {
    const { id, history } = await createdForm(
      "Create a corrective action for Pat Rivera. She was 20 minutes late for her 2pm shift on 10/20. Verbal warning.",
    );
    expect((await row(id, "payroll_deduct"))?.checked ?? []).toEqual([]);
    const asked: ChatMessage[] = [...history, answered("One more question: **Is payroll deduct applicable?** Yes or No?")];

    const answer = await correctActiveForm({ request: chat(), instanceId: id, question: "no", today: "2026-10-20", history: asked });
    expect(answer?.formUpdate?.updated).toEqual(["payroll_deduct"]);
    expect((await row(id, "payroll_deduct"))?.checked).toEqual(["no"]);

    // Without that question just before it, "no" answers nothing.
    const elsewhere: ChatMessage[] = [
      ...asked,
      said("what does the manual say about opening late?"),
      answered("The Late Opening section says the employee must notify the manager."),
    ];
    expect(
      await correctActiveForm({ request: chat(), instanceId: id, question: "no", today: "2026-10-20", history: elsewhere }),
    ).toBeNull();
  });
});

/* ========================================================================= */
/* AN ORDINARY ANSWER KNOWS THE FORM IS OPEN                                  */
/* ========================================================================= */

describe("an ordinary answer knows the form is open", () => {
  it("describes the form, its employee and what it says, for the prompt", async () => {
    const { id } = await createdForm();
    const summary = await describeOpenForm(chat(), id);
    expect(summary).toMatchObject({ templateName: "Corrective Action Form", employeeName: "Pat Rivera", status: "draft" });
    expect(summary!.lines).toEqual(
      expect.arrayContaining([
        { label: "Type of Warning", value: "Verbal Warning" },
        expect.objectContaining({ label: "Direct policy from official manual" }),
      ]),
    );
    expect(summary!.unverifiedPolicy).toEqual([]);
    // What the policy line cites, from its provenance — what a follow-up about "the policy" is searched with.
    expect(summary!.cited).toEqual(["Attendance"]);
  });

  it("tells nobody about a form they may not see", async () => {
    const { id } = await createdForm();
    state.role = "location_manager";
    state.scope = { level: "location", primaryAreaId: "loc-999", alsoCoversAreaIds: [] };
    expect(await describeOpenForm(chat(), id)).toBeNull();
  });
});

/* ========================================================================= */
/* A FORM ASKED FOR LATER KEEPS THE PERSON THE CONVERSATION IS ABOUT           */
/* ========================================================================= */

describe("changing to a different form keeps the person the conversation is about", () => {
  it("carries Pat Rivera into a Coaching Form asked for well after she was named", async () => {
    const turns = [
      LATE,
      "can you add late opening policy to the direct policy section of this form",
      "I have independently verified and the policy is correct",
      "what does the manual say about reimbursing the company?",
      "how much notice do openers have to give?",
      "and who covers the shift?",
      "ok thanks",
    ];
    const history: ChatMessage[] = [];
    for (const turn of turns) history.push(said(turn), answered("Noted."));

    const response = await proposeFormForTurn({
      history,
      question: "Create a Coaching Form from this conversation.",
      actor: { role: state.role as never, scope: state.scope as AccessScope },
      summaries: await listTemplateSummaries(),
      today: "2026-10-20",
    });
    expect(response?.formProposal?.templateKey).toBe("coaching");
    expect(response?.formProposal?.employeeName).toBe("Pat Rivera");
    expect(response?.content).toContain("from earlier in this conversation");
  });

  it("never carries a name over one the request itself gives", async () => {
    const turns = [
      LATE,
      "what does the manual say about reimbursing the company?",
      "how much notice do openers have to give?",
      "and who covers the shift?",
      "is that in the manual?",
      "ok thanks",
      "one more thing",
    ];
    const history: ChatMessage[] = [];
    for (const turn of turns) history.push(said(turn), answered("Noted."));

    const response = await proposeFormForTurn({
      history,
      question: "Create a Coaching Form for Dana Moss.",
      actor: { role: state.role as never, scope: state.scope as AccessScope },
      summaries: await listTemplateSummaries(),
      today: "2026-10-20",
    });
    expect(response?.formProposal?.employeeName).toBe("Dana Moss");
    expect(response?.content).not.toContain("from earlier in this conversation");
  });
});

/* ========================================================================= */
/* QA, 22 Oct 2026 — the open form, told its facts one turn at a time         */
/* ========================================================================= */

/*
 * The chat route's order for a turn with a form open: correction, policy
 * change, revision (`app/api/chat/route.ts`). Whatever takes the turn, the
 * stored form is read back after it.
 */
async function onOpenForm(id: string, history: ChatMessage[], question: string) {
  const correction = await correctActiveForm({ request: chat(), instanceId: id, question, today: "2026-10-20", history });
  const policy = correction ? null : await changeActiveFormPolicy({ request: chat(), instanceId: id, question, history });
  const revision =
    correction || policy ? null : await reviseActiveForm({ request: chat(), instanceId: id, question, history, today: "2026-10-20" });
  const answer = correction ?? policy ?? revision;
  history.push(said(question), answered(answer?.content ?? "(ordinary answer)"));
  return answer;
}

describe("QA 22 Oct: facts told after the form exists go onto the open form", () => {
  it("prior steps, the date, the level, payroll and the policy, each in its own turn, with nothing lost", async () => {
    const { id, history } = await createdForm();
    const values = async () => Object.fromEntries((await review(id)).values.map((entry) => [entry.fieldKey, entry]));

    const coaching = await onOpenForm(id, history, "prior coaching JBA Policy Manual 7-29-26");
    expect(coaching?.formUpdate?.updated).toEqual(["prior_actions"]);
    expect((await values()).prior_actions?.value).toBe("Coaching — JBA Policy Manual — signed 07/29/2026");

    await onOpenForm(id, history, "she also had a verbal ca on 9-1-26");
    expect((await values()).prior_actions?.value).toBe(
      "Coaching — JBA Policy Manual — signed 07/29/2026\nVerbal corrective action — signed 09/01/2026",
    );
    // The same fact again duplicates nothing.
    await onOpenForm(id, history, "she also had a verbal ca on 9-1-26");
    expect((await values()).prior_actions?.value?.split("\n")).toHaveLength(2);

    // A date change is said as one; the form-date reader moves the drafted paragraphs' day with it.
    const dated = await onOpenForm(id, history, "change the date to 10/19/26");
    expect(dated?.formUpdate?.updated).toContain("form_date");
    expect((await values()).form_date?.value).toBe("2026-10-19");

    await onOpenForm(id, history, "make it a written");
    await onOpenForm(id, history, "use the attendance policy instead");

    const form = await values();
    expect(form.warning_type?.checked).toEqual(["written"]);
    expect(form.payroll_deduct?.checked).toEqual(["no"]);
    expect(form.form_date?.value).toBe("2026-10-19");
    expect(form.prior_actions?.value?.split("\n")).toHaveLength(2);
    expect(form.policy_language?.value).toContain("Attendance");
    expect(form.observation?.value).toContain("Pat Rivera arrived 20 minutes late");
    expect(form.observation?.value).not.toMatch(/\b10\/20\b/);
    expect(store.form_instances).toHaveLength(1);
  });

  it('"first time, no prior coaching" fills an empty Prior Actions, and never overwrites a list', async () => {
    const { id, history } = await createdForm();
    await onOpenForm(id, history, "first time, no prior coaching");
    expect((await row(id, "prior_actions"))?.value).toBe("None — first occurrence");

    await onOpenForm(id, history, "prior coaching JBA Policy Manual 7-29-26");
    expect((await row(id, "prior_actions"))?.value).toBe("Coaching — JBA Policy Manual — signed 07/29/2026");
    const kept = await onOpenForm(id, history, "it's her first time");
    expect(kept?.content).toMatch(/Prior Actions already lists/);
    expect((await row(id, "prior_actions"))?.value).toBe("Coaching — JBA Policy Manual — signed 07/29/2026");
  });

  it("a new incident, a question, or another person is not a fact about this form", async () => {
    const { id, history } = await createdForm();
    const before = (await review(id)).values;
    for (const question of [
      "she was late again on 10/19",
      "when did she have prior coaching?",
      "remy calder had a verbal ca on 9-1-26",
    ]) {
      const answer = await correctActiveForm({ request: chat(), instanceId: id, question, today: "2026-10-20", history });
      expect(answer?.formUpdate, question).toBeUndefined();
    }
    expect((await review(id)).values).toEqual(before);
  });
});

describe("QA 22 Oct, round 3: corrections in everyday wording change only what they name", () => {
  it("level, date, prior coaching, payroll and policy, one turn each, every other field untouched", async () => {
    const { id, history } = await createdForm();
    const snapshot = async () =>
      Object.fromEntries(
        (await review(id)).values.map((entry) => [entry.fieldKey, JSON.stringify([entry.value ?? null, entry.checked ?? []])]),
      );
    const changedBy = async (question: string) => {
      const before = await snapshot();
      const answer = await onOpenForm(id, history, question);
      const after = await snapshot();
      const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
      return { answer, changed: keys.filter((key) => before[key] !== after[key]).sort() };
    };
    const values = async () => Object.fromEntries((await review(id)).values.map((entry) => [entry.fieldKey, entry]));
    const observation = (await values()).observation?.value;
    expect(observation).toBeTruthy();

    expect((await changedBy("oops, should've been written")).changed).toEqual(["warning_type"]);
    expect((await values()).warning_type?.checked).toEqual(["written"]);

    // The day in the drafted Observation moves with the Date ("one date everywhere"); nothing else does.
    expect((await changedBy("the date was actually 10/18/26")).changed).toEqual(["form_date", "observation"]);
    expect((await values()).form_date?.value).toBe("2026-10-18");
    const redated = (await values()).observation?.value ?? "";
    expect(redated).not.toMatch(/\b10\/20\b/);
    expect(redated).toBe(observation!.replace("10/20", "October 18, 2026"));

    expect((await changedBy("she was coached on the handbook 6/3/26 too")).changed).toEqual(["prior_actions"]);
    expect((await values()).prior_actions?.value).toMatch(/^Coaching.* — signed 06\/03\/2026$/);

    const planBefore = (await values()).action_plan?.value ?? "";
    const payroll = await changedBy("actually we are docking her pay for this one");
    // The Action Plan may gain the one payroll sentence that depends on the answer, and says so; nothing else moves.
    expect(payroll.changed.filter((key) => key !== "action_plan")).toEqual(["payroll_deduct"]);
    expect((await values()).payroll_deduct?.checked).toEqual(["yes"]);
    if (payroll.changed.includes("action_plan")) {
      const planAfter = (await values()).action_plan?.value ?? "";
      expect(planAfter.replace(/\s*A payroll deduction applies\./, "")).toBe(planBefore);
      expect(payroll.answer?.content).toMatch(/Action Plan now states the payroll deduction/);
    }

    const policy = await changedBy("switch the policy to dress code");
    // Only the policy's own sections move; nothing the manager stated does.
    for (const key of ["warning_type", "form_date", "prior_actions", "payroll_deduct", "observation", "employee_name"]) {
      expect(policy.changed, key).not.toContain(key);
    }
    expect(policy.changed).toContain("policy_language");
    expect((await values()).policy_language?.value ?? "").toMatch(/Dress Code/);
    expect((await values()).policy_language?.value ?? "").not.toMatch(/Attendance/);

    // A section the manual does not have is said so, and nothing changes.
    const missing = await changedBy("change the policy to moon landing");
    expect(missing.answer?.content).toMatch(/couldn't find a section called "moon landing"/);
    expect(missing.changed).toEqual([]);

    const form = await values();
    expect(form.warning_type?.checked).toEqual(["written"]);
    expect(form.form_date?.value).toBe("2026-10-18");
    expect(form.payroll_deduct?.checked).toEqual(["yes"]);
    expect(form.observation?.value).toBe(redated);
    expect(store.form_instances).toHaveLength(1);
  });
});
