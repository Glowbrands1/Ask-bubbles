import { rosterResultFor } from "@/test/roster-result";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { AccessScope, ChatMessage } from "@/types";

/**
 * ============================================================================
 * A CORRECTIVE ACTION ASKED FOR BY NAME ALONE, AND A LATE OPENING — END TO END
 * ============================================================================
 *
 * Ported from the reference platform (production, 20 Oct 2026): "create ca for
 * <name>" was offered a Create draft with nothing described. The draft wrote
 * nothing, the form was completed by hand, and the policy wording — the
 * manual's Late Opening section — was pasted in with no section or page. The
 * form is still offered on a name alone, the card says why its policy line
 * cannot be cited yet, and telling Ask Bubbles what happened redrafts the form
 * on screen with the section and page (`chat-redraft.ts`).
 *
 * Replayed through the real proposal flow, `createInlineForm`, and the real
 * create / draft / review routes, with the shipped Buff City Soap store roster.
 * The JBA Policy Manual is the same document for every brand, so a Buff City
 * Soap late opener cites the same Late Opening section, at the page the manual
 * prints. Only identity, the model, the knowledge provider, the employee
 * directory read and the database are stand-ins. Every employee is synthetic.
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
const { redraftActiveForm } = await import("@/lib/forms/chat-redraft");
const { saveInstanceValues } = await import("@/lib/forms/instances");

function joinOverview() {
  for (const row of store.form_instances ?? []) {
    const template = store.form_templates!.find((entry) => entry.id === row.template_id);
    const version = store.form_template_versions.find((entry) => entry.id === row.template_version_id);
    Object.assign(row, {
      form_date: row.form_date ?? "2026-10-16",
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
  createdAt: "2026-10-16T15:00:00Z",
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
      today: "2026-10-16",
      ...(open ? { continueTemplateKey: open } : {}),
    });
    expect(response, `turn left the form intake: ${JSON.stringify(text)}`).not.toBeNull();
    responses.push(response!);
    if (response!.formProposal) open = response!.formProposal.templateKey;
    messages.push(message, {
      id: `a${sequence}`,
      role: "assistant",
      content: response!.content,
      createdAt: "2026-10-16T15:00:01Z",
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
  { id: "e-1", firstName: "Pat", lastName: "Rivera", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Operator" },
];

/*
 * THE MANUAL AS THE KNOWLEDGE BASE HOLDS IT: each section on the sheet it is
 * printed on, with the page the manual prints (one less than the PDF's).
 */
const ATTENDANCE_CHUNK = {
  chunkIndex: 33,
  chunkId: "c-33",
  locator: "Page 15",
  page: 15,
  printedPage: 14,
  sections: [{ heading: "Attendance", page: 14 }],
  section: "Attendance",
  content:
    "Attendance\nIt is the responsibility of each employee to know his or her work schedule and to always be on\ntime. Lack of punctuality or absenteeism has a negative impact on everyone's schedule and\ncreates a lack of service for the client.",
};

const LATE_OPENING_CHUNK = {
  chunkIndex: 34,
  chunkId: "c-34",
  locator: "Page 16",
  page: 16,
  printedPage: 15,
  sections: [{ heading: "Late Opening", page: 15 }],
  section: "Late Opening",
  content:
    "15 | P a g e\nLate Opening\nWhen an employee assigned to open a location is unable to open the location at the proper\ntime, the employee must notify the manager as soon as possible.",
};

const MANUAL = { chunks: [ATTENDANCE_CHUNK, LATE_OPENING_CHUNK] };

const LATE_OPENER =
  "Pat was scheduled to open the store at 9:30 on 10/16 and did not arrive until 11:23. Verbal warning, payroll deduct no.";

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
  vi.setSystemTime(new Date("2026-10-16T15:00:00Z"));
  await ensureTemplateLibrary("system");
});

/* ========================================================================= */
/* WHAT HAPPENED, BEFORE THE DRAFT                                            */
/* ========================================================================= */

describe("a Corrective Action asked for by name alone", () => {
  it("is offered, and says the policy manual cannot be cited until Ask Bubbles is told what happened", async () => {
    const { proposal, last } = await conversation(["create ca for Pat Rivera"]);

    expect(proposal).toMatchObject({
      templateKey: "dpoa",
      employeeName: "Pat Rivera",
      locationId: "loc-264",
      awaitingIncident: true,
      supportsInlineDraft: true,
    });
    expect(last.content).toMatch(/I can create a \*\*Corrective Action Form\*\* for \*\*Pat Rivera\*\*/);
    expect(last.content).toMatch(/haven't told me what happened yet/);
    expect(last.content).toMatch(/can't cite the policy manual/);
    expect(last.content).not.toMatch(/from what you've described/);
    expect(last.content).toMatch(/create the draft here/i);
  });

  it("takes the reply as the account and continues the intake, in words no topic list names", async () => {
    const { responses, proposal } = await conversation([
      "create ca for Pat Rivera",
      "Pat got to the store at 11:23 for a 9:30 shift on 10/16",
    ]);

    expect(responses[1]!.formProposal!.templateKey).toBe("dpoa");
    expect(proposal.awaitingIncident).toBeUndefined();
    expect(proposal.supportsInlineDraft).toBe(true);
    expect(responses[1]!.content).toMatch(/from what you've described/);
  });
});

/* ========================================================================= */
/* THE LATE OPENING SECTION, CITED ON THE FORM                                */
/* ========================================================================= */

describe("Direct policy from official manual, for a late opener", () => {
  it("cites the manual's Late Opening section and its printed page, ahead of Attendance", async () => {
    const { create } = await conversation(["create ca for Pat Rivera", LATE_OPENER]);
    state.draft = {
      values: {
        observation: "Observed:\nPat Rivera was scheduled to open the store at 9:30 on 10/16 and arrived at 11:23.",
        policy_language: "Invented late-opening rule.",
      },
      checked: { offense_type: ["tardiness"] },
    };

    const { reference, draftWarning } = await create();
    expect(draftWarning).toBeNull();
    const form = await review(reference.instanceId);
    const policy = field(form, "policy_language")!.value!;

    expect(field(form, "offense_type")!.checked).toEqual(["tardiness"]);
    expect(policy).toContain("When an employee assigned to open a location is unable to open the location");
    expect(policy).toContain("Source: JBA Policy Manual — Late Opening, p. 15");
    expect(policy).toContain("Source: JBA Policy Manual — Attendance, p. 14");
    expect(policy.indexOf("Late Opening, p. 15")).toBeLessThan(policy.indexOf("Attendance, p. 14"));
    expect(policy).not.toMatch(/Invented/);
    expect(field(form, "policy_language")!.provenance).toMatchObject({ verified: true });
  });

  /*
   * QA, 24 Oct 2026, and HR, 21 Oct 2026 (conv_mvifqra017j15ld8: "noted
   * tardiness/leaving early vs late open policy pg.15"): with
   * LATE_OPEN_DATE_ENABLED a late opening cites Late Opening, p. 15 only.
   */
  describe("LATE_OPEN_DATE_ENABLED", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it.each([
      [LATE_OPENER],
      ["Pat was late to open the store 10-15, verbal, no payroll"],
    ])("a late opening cites Late Opening, p. 15 only: %s", async (account) => {
      vi.stubEnv("LATE_OPEN_DATE_ENABLED", "1");
      const { create } = await conversation(["create ca for Pat Rivera", account]);
      state.draft = {
        values: { observation: "Observed:\nPat Rivera opened the store late." },
        checked: { offense_type: ["tardiness"] },
      };

      const { reference } = await create();
      const form = await review(reference.instanceId);
      const policy = field(form, "policy_language")!.value!;

      expect(policy).toContain("Source: JBA Policy Manual — Late Opening, p. 15");
      expect(policy).not.toMatch(/Attendance/);
      expect(field(form, "action_plan")!.value).not.toMatch(/Attendance/);
    });
  });

  it("cites Attendance alone for lateness that is not an opening", async () => {
    const { create } = await conversation([
      "Create a corrective action for Pat Rivera. She was 20 minutes late for her 2pm shift on 10/16. Verbal warning, payroll deduct no.",
    ]);
    state.draft = {
      values: { observation: "Observed:\nPat Rivera arrived 20 minutes late for a 2pm shift on 10/16." },
      checked: { offense_type: ["tardiness"] },
    };

    const { reference } = await create();
    const form = await review(reference.instanceId);
    const policy = field(form, "policy_language")!.value!;

    expect(policy).toContain("Source: JBA Policy Manual — Attendance, p. 14");
    expect(policy).not.toMatch(/Late Opening/);
    // "Verbal warning, payroll deduct no." — the comma after warning still states both.
    expect(field(form, "warning_type")!.checked).toEqual(["verbal"]);
    expect(field(form, "payroll_deduct")!.checked).toEqual(["no"]);
  });
});

/* ========================================================================= */
/* CREATED FROM A NAME ALONE, THEN REDRAFTED FROM THE ACCOUNT                 */
/* ========================================================================= */

describe("a form created from a name alone is redrafted, with the citation, once the manager says what happened", () => {
  const chatRequest = () =>
    new Request("https://app.test/api/chat", { method: "POST", headers: { cookie: "session=abc" } });

  async function blankForm() {
    const played = await conversation(["create ca for Pat Rivera"]);
    /* Nothing to draft from: the model writes nothing. */
    state.draft = { values: {}, checked: {} };
    const { reference } = await played.create();
    const blank = await review(reference.instanceId);
    expect(blank.values.filter((row) => row.filledBy === "ai")).toEqual([]);
    return { ...played, instanceId: reference.instanceId };
  }

  it("redrafts the form on screen, and Direct policy cites Late Opening, p. 15, then Attendance, p. 14", async () => {
    const { instanceId, messages } = await blankForm();
    state.draft = {
      values: {
        observation: "Observed:\nPat Rivera was scheduled to open the store at 9:30 on 10/16 and arrived at 11:23.",
      },
      checked: { offense_type: ["tardiness"] },
    };

    const answer = await redraftActiveForm({
      request: chatRequest(),
      instanceId,
      question: "Pat was scheduled to open the store at 9:30 on 10/16 and did not arrive until 11:23",
      history: messages,
    });

    expect(answer!.content).toMatch(/Redrafted the \*\*Corrective Action Form\*\* for \*\*Pat Rivera\*\*/);
    expect(answer!.content).toMatch(/cites its section and page/);
    expect(answer!.formUpdate!.instanceId).toBe(instanceId);
    expect(answer!.formUpdate!.updated).toContain("policy_language");
    expect(store.form_instances).toHaveLength(1);

    const form = await review(instanceId);
    const policy = field(form, "policy_language")!.value!;
    expect(field(form, "observation")!.value).toContain("scheduled to open the store");
    expect(field(form, "offense_type")!.checked).toEqual(["tardiness"]);
    expect(policy).toContain("When an employee assigned to open a location is unable to open the location");
    expect(policy).toContain("Source: JBA Policy Manual — Late Opening, p. 15");
    expect(policy).toContain("Source: JBA Policy Manual — Attendance, p. 14");
    expect(policy.indexOf("Late Opening, p. 15")).toBeLessThan(policy.indexOf("Attendance, p. 14"));
    expect(field(form, "policy_language")!.provenance).toMatchObject({ verified: true });
    /* The Action Plan names both sections Direct policy cites (District Manager feedback, 21 Oct 2026). */
    expect(field(form, "action_plan")!.value).toBe(
      "Management will review the Late Opening and Attendance policies with Pat. Future policy violations may result in additional corrective action up to and including termination of employment.",
    );
  });

  it("keeps what the manager typed; their tick decides the section; only the uncited policy line is replaced", async () => {
    const { instanceId, messages } = await blankForm();
    await saveInstanceValues(
      instanceId,
      {
        values: {
          observation: "Observed:\nWhat the manager wrote.",
          policy_language: "Openers have to be on time.",
          action_plan: "Pat and I agreed she will set two alarms.",
        },
        checked: { offense_type: ["tardiness"] },
      },
      "admin-1",
    );
    /* The model would tick another box; the manager's tick decides the section. */
    state.draft = {
      values: { observation: "Observed:\nThe model's account." },
      checked: { offense_type: ["standards_of_conduct"] },
    };

    const answer = await redraftActiveForm({
      request: chatRequest(),
      instanceId,
      question: "She was supposed to open the Makery at 9:30 and nobody was there until 11:23",
      history: messages,
    });
    expect(answer!.content).toMatch(/kept as you wrote it/);

    const form = await review(instanceId);
    expect(field(form, "observation")!.value).toBe("Observed:\nWhat the manager wrote.");
    expect(field(form, "offense_type")!.checked).toEqual(["tardiness"]);
    const policy = field(form, "policy_language")!.value!;
    expect(policy).not.toMatch(/Openers have to be on time/);
    expect(policy).toContain("Source: JBA Policy Manual — Late Opening, p. 15");
    /* The manager's own Action Plan is theirs: only the required closing is added. */
    expect(field(form, "action_plan")!.value).toBe(
      "Pat and I agreed she will set two alarms. Future policy violations may result in additional corrective action up to and including termination of employment.",
    );
    expect(field(form, "action_plan")!.filledBy).toBe("manager");
  });

  it("keeps a policy line the manager typed when the redraft cannot cite one", async () => {
    const { instanceId, messages } = await blankForm();
    state.manual = null;
    await saveInstanceValues(
      instanceId,
      { values: { observation: "Observed:\nWhat the manager wrote.", policy_language: "Openers have to be on time." } },
      "admin-1",
    );
    state.draft = { values: { observation: "Observed:\nPat opened late." }, checked: { offense_type: ["tardiness"] } };

    const answer = await redraftActiveForm({
      request: chatRequest(),
      instanceId,
      question: "Pat was scheduled to open the store at 9:30 and did not arrive until 11:23",
      history: messages,
    });

    expect(answer!.content).toMatch(/couldn't match what you described to a section of the policy manual/);
    const form = await review(instanceId);
    expect(field(form, "policy_language")!.value).toBe("Openers have to be on time.");
    expect(field(form, "observation")!.value).toBe("Observed:\nWhat the manager wrote.");
    /* No section could be cited: the plan names what Policy Violated names. */
    expect(field(form, "action_plan")!.value).toBe(
      "Management will review the Tardiness/Leaving Early policy with Pat. Future policy violations may result in additional corrective action up to and including termination of employment.",
    );
  });

  it("leaves a question, and a form Ask Bubbles already drafted, to the ordinary answer", async () => {
    const { instanceId, messages } = await blankForm();
    expect(
      await redraftActiveForm({
        request: chatRequest(),
        instanceId,
        question: "what does the late opening policy say?",
        history: messages,
      }),
    ).toBeNull();

    const drafted = await conversation([
      "Create a corrective action for Pat Rivera. She was 20 minutes late for her 2pm shift on 10/16.",
    ]);
    state.draft = { values: { observation: "Observed:\nPat arrived late." }, checked: { offense_type: ["tardiness"] } };
    const { reference } = await drafted.create();
    expect(
      await redraftActiveForm({
        request: chatRequest(),
        instanceId: reference.instanceId,
        question: "Pat was scheduled to open the store at 9:30 and did not arrive until 11:23",
        history: drafted.messages,
      }),
    ).toBeNull();
  });
});
