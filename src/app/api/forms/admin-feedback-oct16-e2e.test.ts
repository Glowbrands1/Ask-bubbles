import { rosterResultFor } from "@/test/roster-result";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { AccessScope, ChatMessage } from "@/types";

/**
 * ============================================================================
 * ADMIN FEEDBACK, 16 OCT 2026 — THE THREE REPORTS, END TO END
 * ============================================================================
 *
 *   1. "It is not referencing the policy that should be acknowledged."
 *   2. "It does not seem to be pulling the correct locations. Also I would like
 *       it to ask the position of the employee."
 *   3. "I gave bubbles all of the information for a CA that it should need and
 *       it still would not populate the form."
 *
 * Replayed through the real proposal flow, `createInlineForm`, and the real
 * create / draft / review routes — with the SHIPPED Buff City Soap roster (not
 * the reference platform's fixture, which is why the bug survived: its stores
 * were all named "NE Kearney", Buff's are "Kearney, NE") and an administrator's
 * global scope. Only identity, the model, the knowledge provider, the employee
 * directory READ (its scoping is the real `scopeRoster`) and the database are
 * stand-ins. Every employee below is synthetic.
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
  draftFails: false,
  directory: [] as unknown[],
  /** The official manual the knowledge provider returns, or null for "not in the knowledge base". */
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
      create: async () => {
        if (state.draftFails) throw new Error("model unavailable");
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
    values: { fieldKey: string; value: string | null; checked: string[]; filledBy: string }[];
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
    proposal: last.formProposal!,
    create: async () => {
      const result = await createInlineForm({
        proposal: last.formProposal!,
        messages,
        call,
        onCreated: () => {},
      });
      return result;
    },
  };
}

/* Synthetic people only. Positions are what Woven would carry. */
const DIRECTORY = [
  { id: "e-1", firstName: "Pat", lastName: "Rivera", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Operator" },
  { id: "e-2", firstName: "Robin", lastName: "Kessler", preferredFirstName: null, employmentStatus: "active", locationIds: [], positionName: "Team Lead" },
  { id: "e-3", firstName: "Casey", lastName: "Brandt", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-66"], positionName: "Makery Associate" },
  { id: "e-4", firstName: "Taylor", lastName: "Voss", preferredFirstName: null, employmentStatus: "terminated", locationIds: ["loc-66"], positionName: "Operator" },
  { id: "e-5", firstName: "Morgan", lastName: "Hale", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-236"], positionName: null },
];

const MANUAL_CHUNKS = [
  {
    chunkIndex: 36,
    chunkId: "c-36",
    locator: "Page 16",
    page: 16,
    printedPage: 15,
    sections: [{ heading: "Dress Code for The Company", page: 15 }],
    section: "Dress Code for The Company",
    content:
      "Dress Code for The Company\nThe Company Employees are to keep a neat, clean, professional appearance at all times. Anyone\nviolating their Brand's Dress code policy will be sent home to change into proper work attire and\nmay be subject to disciplinary action, up to and potentially including termination.",
  },
];

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

beforeEach(async () => {
  for (const key of Object.keys(store) as (keyof FakeStore)[]) store[key] = [];
  state.role = "admin";
  state.scope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
  state.draft = { values: {}, checked: {} };
  state.draftFails = false;
  state.directory = DIRECTORY;
  state.manual = null;
  sequence = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-16T15:00:00Z"));
  await ensureTemplateLibrary("system");
});

/* ========================================================================= */
/* ISSUE 3 — a Corrective Action given in chat must populate the form        */
/* ========================================================================= */

describe("Issue 3 — Corrective Action from complete conversational information", () => {
  const COMPLETE =
    "My employee pat rivera was 10 minutes late on 10/5 and 10/15. I verbally coached her on the first one. She is at Dodge. Please create a CA form so I can document. This is a verbal warning. Payroll deduct is not applicable.";

  it("reads the lowercase name, the store, the position, the level and the payroll answer — and files them", async () => {
    const { proposal, last, create } = await conversation([COMPLETE]);

    expect(proposal).toMatchObject({
      templateKey: "dpoa",
      status: "ready",
      employeeName: "Pat Rivera",
      locationId: "loc-264",
      locationResolution: "resolved",
      employeeRole: "Operator",
      employeeRoleSource: "woven",
      warningLevel: "verbal",
      payrollDeduct: "no",
      supportsInlineDraft: true,
    });
    // The manager reads back which store, and where the position came from.
    expect(last.content).toContain("Omaha, NE (West Dodge Rd)");
    expect(last.content).toMatch(/Position:\*\* Operator, from Woven/);

    state.draft = {
      values: {
        observation: "Observed:\nPat Rivera arrived 10 minutes late on 10/5 and 10/15.",
        action_plan: "Pat Rivera is expected to arrive on time for every scheduled shift.",
      },
      checked: { offense_type: ["tardiness"] },
    };
    const { reference, draftWarning } = await create();
    expect(draftWarning).toBeNull();

    const form = await review(reference.instanceId);
    expect(form.instance.locationId).toBe("loc-264");
    expect(form.instance.employeeRole).toBe("Operator");
    expect(field(form, "warning_type")!.checked).toEqual(["verbal"]);
    expect(field(form, "payroll_deduct")!.checked).toEqual(["no"]);
    expect(field(form, "job_title")!.value).toBe("Operator");
    expect(field(form, "observation")!.value).toContain("10 minutes late");
    expect(field(form, "offense_type")!.checked).toEqual(["tardiness"]);
  });

  it("does not drop the intake when the manager only names a store or says she already answered", async () => {
    // The exact shape of the 16 Oct conversation: no usable name first, then
    // "I already told you … She is at Dodge".
    const { responses, proposal } = await conversation([
      "Please create a CA form for lateness on 10/5 and 10/15, I coached her verbally on the first.",
      "I already told you the employee name. She is at Dodge",
    ]);
    expect(responses[0]!.formProposal!.status).toBe("needs_employee");
    // Second turn stayed in the intake (not null), kept the form, and resolved the store.
    expect(proposal.templateKey).toBe("dpoa");
    expect(proposal.locationId).toBe("loc-264");
  });

  it("carries a name given earlier through a store-only reply, without asking again", async () => {
    const { responses, proposal } = await conversation([
      "My employee tiffany ostrander was late on 10/5 and 10/15. Please create a CA form.",
      "She is at Dodge",
    ]);
    // QA 22 Oct 2026 decision: off the directory the manager's spelling is kept as typed.
    expect(responses[0]!.formProposal!.employeeName).toBe("tiffany ostrander");
    // QA 22 Oct 2026 decision: off the directory the manager's spelling is kept as typed.
    expect(proposal.employeeName).toBe("tiffany ostrander");
    expect(proposal.locationId).toBe("loc-264");
    expect(responses[1]!.content).not.toMatch(/who is this/i);
  });

  it("files a partial draft when a fact is missing, says what is missing, and invents nothing", async () => {
    const { proposal, last, create } = await conversation([
      "Create a corrective action for Robin Kessler, she was late on 10/5 and 10/15.",
    ]);
    // Woven has no mapped store for Robin and the manager named none.
    expect(proposal.status).toBe("ready");
    expect(proposal.locationId).toBeNull();
    expect(last.content).toMatch(/Woven doesn't show a store I can match for \*\*Robin\*\*/);
    expect(proposal.employeeRole).toBe("Team Lead");

    state.draft = { values: { observation: "Observed:\nRobin Kessler was late on 10/5 and 10/15." }, checked: {} };
    const { reference } = await create();
    const form = await review(reference.instanceId);
    expect(form.instance.locationId).toBeNull();
    expect(field(form, "observation")!.value).toContain("late on 10/5");
    // Never fabricated: nothing the manager did not say is ticked.
    expect(field(form, "warning_type")?.checked ?? []).toEqual([]);
    expect(field(form, "payroll_deduct")?.checked ?? []).toEqual([]);
  });

  it("keeps the form when drafting fails, so a retry cannot file a second disciplinary record", async () => {
    const { create } = await conversation([COMPLETE]);
    state.draftFails = true;
    const { reference, draftWarning } = await create();
    expect(draftWarning).toMatch(/couldn't prefill/i);
    const form = await review(reference.instanceId);
    expect(form.instance.employeeName).toBe("Pat Rivera");
    expect(form.instance.locationId).toBe("loc-264");
    expect(store.form_instances).toHaveLength(1);
  });

  it("leaves existing forms untouched when a later conversation files another one", async () => {
    const first = await conversation([COMPLETE]);
    state.draft = { values: { observation: "Observed:\nFirst form text." }, checked: {} };
    const { reference } = await first.create();
    const before = await review(reference.instanceId);

    const second = await conversation(["Create a corrective action for Casey Brandt, out of dress code on 10/11. Verbal warning."]);
    const { reference: other } = await second.create();

    expect(other.instanceId).not.toBe(reference.instanceId);
    expect(store.form_instances).toHaveLength(2);
    const after = await review(reference.instanceId);
    expect(after.values).toEqual(before.values);
    expect(after.instance.locationId).toBe("loc-264");
  });
});

/* ========================================================================= */
/* ISSUE 2 — the employee's position                                         */
/* ========================================================================= */

describe("Issue 2 — the employee's position", () => {
  it("uses the position Woven holds and reads it back for correction", async () => {
    const { proposal, last } = await conversation(["Create a corrective action for Casey Brandt at Kearney, out of dress code on 10/11."]);
    expect(proposal.employeeRole).toBe("Makery Associate");
    expect(proposal.employeeRoleSource).toBe("woven");
    expect(last.content).toMatch(/Position:\*\* Makery Associate, from Woven — tell me if that has changed/);
  });

  // POLICY, 19 Oct 2026: the synchronized Woven directory is the source of truth for a job title.
  // A verified Woven position wins over the manager's wording, and the disagreement is said.
  it("Woven's verified title wins over the manager's wording, and the disagreement is said", async () => {
    const { proposal, last } = await conversation(["Create a corrective action for Casey Brandt at Kearney, she is a shift lead, out of dress code on 10/11."]);
    expect(proposal.employeeRole).toBe("Makery Associate");
    expect(proposal.employeeRoleSource).toBe("woven");
    expect(last.content).toMatch(/You described \*\*Casey Brandt\*\* as a Shift Lead, but Woven lists their job title as \*\*Makery Associate\*\*/);
  });

  it("asks once when there is no position anywhere, then uses the answer and stops asking", async () => {
    const { responses, proposal } = await conversation([
      "Create a corrective action for Sam Ortega at Kearney, out of dress code on 10/11.",
      "she is a barista",
      "Verbal warning",
    ]);
    expect(responses[0]!.content).toMatch(/position \(job title\)\?/);
    expect(responses[0]!.formProposal!.employeeRole).toBeNull();
    expect(responses[1]!.formProposal!.employeeRole).toBe("Barista");
    expect(responses[1]!.content).not.toMatch(/position \(job title\)\?/);
    expect(responses[2]!.content).not.toMatch(/position \(job title\)\?/);
    expect(proposal.employeeRole).toBe("Barista");
    expect(proposal.employeeRoleSource).toBe("manager");
  });

  it("asks when Woven holds the employee with no position, and does not repeat the question", async () => {
    const { responses } = await conversation([
      "Create a coaching form for Morgan Hale at Grand Island about the opening checklist.",
      "Use Grand Island",
    ]);
    expect(responses[0]!.content).toMatch(/position \(job title\)\?/);
    expect(responses[1]!.content).not.toMatch(/position \(job title\)\?/);
  });

  it("never borrows a terminated employee's Woven position", async () => {
    const { proposal, last } = await conversation(["Create a corrective action for Taylor Voss at Kearney, out of dress code on 10/11."]);
    expect(proposal.employeeRole).toBeNull();
    expect(last.content).toMatch(/didn't find \*\*Taylor Voss\*\*/);
    expect(last.content).toMatch(/position \(job title\)\?/);
  });
});

/* ========================================================================= */
/* ISSUE 2 — the store                                                       */
/* ========================================================================= */

describe("Issue 2 — the store the form is filed against", () => {
  it.each([
    ["Kearney", "loc-66"],
    ["our Grand Island location", "loc-236"],
    ["Lee's Summit", "loc-219"],
    ["store 264", "loc-264"],
    ["Omaha West Dodge", "loc-264"],
  ])("resolves %j from the roster", async (place, id) => {
    const { proposal } = await conversation([`Create a corrective action for Casey Brandt at ${place}, out of dress code on 10/11. Verbal warning.`]);
    expect(proposal.locationId).toBe(id);
  });

  it("asks which store when a city has two, naming only those two", async () => {
    const { responses, proposal } = await conversation([
      "Create a corrective action for Casey Brandt in Sioux Falls, out of dress code on 10/11. Verbal warning.",
    ]);
    expect(proposal.status).toBe("needs_location");
    expect(proposal.locationId).toBeNull();
    expect(proposal.locationCandidates).toEqual(["Sioux Falls, SD (W 41st St)", "Sioux Falls, SD (E 18th St)"]);
    expect(responses[0]!.content).toMatch(/More than one store matches/);
    expect(responses[0]!.content).not.toMatch(/Kearney|Omaha|Bellevue|Lee's Summit/);
  });

  it("settles the Sioux Falls question from a one-line answer", async () => {
    const { proposal } = await conversation([
      "Create a corrective action for Casey Brandt in Sioux Falls, out of dress code on 10/11. Verbal warning.",
      "E 18th St",
    ]);
    expect(proposal.locationId).toBe("loc-338");
    expect(proposal.status).toBe("ready");
  });

  it("never invents a store for a place that is not on the roster", async () => {
    const { proposal } = await conversation(["Create a corrective action for Casey Brandt at Springfield, out of dress code on 10/11."]);
    expect(proposal.locationId).toBe("loc-66"); // from Woven's record for Casey, not from "Springfield"
    const none = await conversation(["Create a corrective action for Sam Ortega at Springfield, out of dress code on 10/11."]);
    expect(none.proposal.locationId).toBeNull();
  });

  it("says so when the manager's store is not where Woven has the employee", async () => {
    const { proposal, last } = await conversation(["Create a corrective action for Casey Brandt at Bellevue, out of dress code on 10/11."]);
    expect(proposal.locationId).toBe("loc-67");
    expect(last.content).toMatch(/Woven has \*\*Casey Brandt\*\* at \*\*Kearney, NE \(Store 66\)\*\*, not \*\*Bellevue, NE \(Store 67\)\*\*/);
  });
});

/* ========================================================================= */
/* ISSUE 1 — the policy a Corrective Action cites                            */
/* ========================================================================= */

describe("Issue 1 — the policy referenced on the form", () => {
  const DRESS_CODE_CA =
    "Create a corrective action for Casey Brandt at Kearney. She has been out of dress code three shifts. I verbally coached her on the second and she is still out of dress code. Verbal warning, payroll deduct no.";

  it("cites the official manual's own Dress Code section — title, section and printed page", async () => {
    state.manual = { chunks: MANUAL_CHUNKS };
    state.draft = {
      values: {
        observation: "Observed:\nCasey Brandt has been out of dress code for three shifts.",
        action_plan: "Casey Brandt is expected to arrive in the required dress code.",
        // A model-invented policy must never survive.
        policy_language: "Section 99 Uniform Rule: employees must wear purple.",
      },
      checked: { offense_type: ["dress_code"] },
    };
    const { create } = await conversation([DRESS_CODE_CA]);
    const { reference } = await create();
    const form = await review(reference.instanceId);

    const policy = field(form, "policy_language")!.value!;
    expect(policy).toContain("Anyone\nviolating their Brand's Dress code policy will be sent home");
    expect(policy).toMatch(/Source: JBA Policy Manual — Dress Code for The Company, p\. 15/);
    expect(policy).not.toMatch(/purple|Section 99/);
    expect(field(form, "policy_violated")!.value).toBe("Dress Code Violation");
  });

  it("leaves the policy blank rather than invent one when the manual cannot be found", async () => {
    state.manual = null;
    state.draft = {
      values: {
        observation: "Observed:\nCasey Brandt has been out of dress code for three shifts.",
        policy_language: "Section 99 Uniform Rule: employees must wear purple.",
      },
      checked: { offense_type: ["dress_code"] },
    };
    const { create } = await conversation([DRESS_CODE_CA]);
    const { reference } = await create();
    const form = await review(reference.instanceId);
    const policy = field(form, "policy_language")?.value ?? "";
    expect(policy).not.toMatch(/purple|Section 99/);
    expect(policy.trim()).toBe("");
  });

  it("offers the Corrective Action Form beside Coaching once coaching has been tried and the problem repeats", async () => {
    const { proposeFormForTurn: propose } = await import("@/lib/ai/form-proposal");
    const response = await propose({
      history: [],
      question:
        "I have an employee Casey Brandt at our Kearney location who has been out of dress code three shifts. I verbally coached her on the second offense and she still is out of dress code",
      actor: { role: "admin", scope: state.scope as AccessScope },
      summaries: await listTemplateSummaries(),
      today: "2026-10-16",
    });
    // Not a proposal and not a creation: the same picker cards, as ever.
    const { suggestFormsForTurn } = await import("@/lib/ai/form-proposal");
    const suggested = suggestFormsForTurn({
      history: [],
      question:
        "I have an employee Casey Brandt at our Kearney location who has been out of dress code three shifts. I verbally coached her on the second offense and she still is out of dress code",
      actor: { role: "admin", scope: state.scope as AccessScope },
      summaries: await listTemplateSummaries(),
      today: "2026-10-16",
    });
    expect(response).toBeNull();
    expect(suggested!.selection.primary.templateKey).toBe("coaching");
    expect(suggested!.selection.additional.map((card) => card.templateKey)).toContain("dpoa");
  });
});

/* ========================================================================= */
/* THE FORM'S DATE: incident dates are not the creation date                  */
/* ========================================================================= */

describe("Issue 3 — which date goes on the form", () => {
  const TWO_DATES = "Create a corrective action for Pat Rivera at Dodge. She was late on 10/5 and 10/15. This is a verbal warning.";

  it("does not pick the first of two incident dates: it asks, once, and dates the form today meanwhile", async () => {
    const { responses, proposal } = await conversation([TWO_DATES, "Payroll deduct is not applicable."]);
    expect(responses[0]!.formProposal!.formDate).toBeNull();
    expect(responses[0]!.formProposal!.formDateCandidates).toEqual(["2026-10-05", "2026-10-15"]);
    expect(responses[0]!.content).toContain("Which date goes on the form?");
    expect(responses[0]!.content).toMatch(/Every date stays in the description/);
    // Asked once only.
    expect(responses[1]!.content).not.toContain("Which date goes on the form?");
    expect(proposal.formDate).toBeNull();
  });

  it.each([
    ["most recent", "2026-10-15"],
    ["use 10/5", "2026-10-05"],
    ["today", null],
  ])("settles on %j without asking again", async (answer, expected) => {
    const { responses, proposal, create } = await conversation([TWO_DATES, answer]);
    expect(proposal.formDate).toBe(expected);
    expect(proposal.formDateCandidates).toBeUndefined();
    expect(responses[1]!.content).not.toContain("Which date goes on the form?");
    expect(proposal.employeeName).toBe("Pat Rivera");

    state.draft = { values: { observation: "Observed:\nPat Rivera was late on 10/5 and 10/15." }, checked: {} };
    const { reference } = await create();
    const form = await review(reference.instanceId);
    // Both incidents stay in the description whichever date the form carries.
    expect(field(form, "observation")!.value).toContain("10/5 and 10/15");
    expect(field(form, "form_date")!.value).toBe(expected ?? "2026-10-16");
  });

  it("dates the form by a single incident date without asking", async () => {
    const { proposal, last } = await conversation(["Create a corrective action for Pat Rivera at Dodge, she was late on 10/15. This is a verbal warning."]);
    expect(proposal.formDate).toBe("2026-10-15");
    expect(last.content).not.toContain("Which date goes on the form?");
  });

  it("does not count the earlier coaching date as an incident", async () => {
    const { proposal, last } = await conversation(["Create a corrective action for Pat Rivera at Dodge, she was late on 10/15. I verbally coached her on 10/5. This is a verbal warning."]);
    expect(proposal.formDate).toBe("2026-10-15");
    expect(last.content).not.toContain("Which date goes on the form?");
  });
});

/* ========================================================================= */
/* VERIFIED BEFORE POPULATED: Woven store and position                         */
/* ========================================================================= */

describe("Woven store and position are verified, or asked for — never guessed", () => {
  it("says a store came from Woven, not from the manager", async () => {
    const { proposal, last } = await conversation(["Create a corrective action for Casey Brandt, out of dress code on 10/11. This is a verbal warning."]);
    expect(proposal.locationId).toBe("loc-66");
    expect(proposal.locationSource).toBe("woven");
    expect(last.content).toMatch(/Store:\*\* Kearney, NE, from Woven \(where Casey Brandt is assigned\)/);
    expect(last.content).not.toMatch(/Store:\*\* Kearney, NE, as you said/);
  });

  it("says a store came from the manager's own words", async () => {
    const { proposal, last } = await conversation(["Create a corrective action for Casey Brandt at Kearney, out of dress code on 10/11. This is a verbal warning."]);
    expect(proposal.locationSource).toBe("manager");
    expect(last.content).toMatch(/Store:\*\* Kearney, NE, as you said/);
  });

  it("asks for the store once when none can be verified, and files nothing meanwhile", async () => {
    const { responses, proposal } = await conversation([
      "Create a corrective action for Sam Ortega, out of dress code on 10/11. This is a verbal warning.",
      "Payroll deduct no",
    ]);
    expect(responses[0]!.content).toMatch(/which store they work at/);
    expect(proposal.locationId).toBeNull();
    expect(responses[1]!.content).not.toMatch(/which store they work at/);
  });

  it("asks for the store and the position when the directory cannot be read at all", async () => {
    state.directory = [];
    const { responses, proposal } = await conversation(["Create a corrective action for Casey Brandt, out of dress code on 10/11. This is a verbal warning."]);
    expect(proposal.locationId).toBeNull();
    expect(proposal.employeeRole).toBeNull();
    expect(responses[0]!.content).toMatch(/couldn't verify a store/);
    expect(responses[0]!.content).toMatch(/position \(job title\)\?/);
  });

  it("asks which store when Woven holds the employee at several and the manager named none", async () => {
    state.directory = [
      ...DIRECTORY,
      { id: "e-9", firstName: "Dana", lastName: "Multi", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-66", "loc-264"], positionName: "Shift Lead" },
    ];
    const { proposal, last } = await conversation(["Create a corrective action for Dana Multi, out of dress code on 10/11. This is a verbal warning."]);
    expect(proposal.status).toBe("needs_location");
    expect(proposal.locationId).toBeNull();
    expect(last.content).toMatch(/Which store is this about/);
  });
});

/* ========================================================================= */
/* RECOMMENDATIONS AND POLICY REFERENCES                                      */
/* ========================================================================= */

describe("Issue 1 — the right form, and only real policy", () => {
  it("cites the Attendance section — and only that — for lateness the manager calls an attendance violation", async () => {
    state.manual = { chunks: [...MANUAL_CHUNKS, ATTENDANCE_CHUNK] };
    state.draft = {
      values: { observation: "Observed:\nPat Rivera was late on 10/5 and 10/15.", policy_language: "Invented tardiness rule 7." },
      checked: { offense_type: ["tardiness"] },
    };
    const { create } = await conversation([
      "Create a corrective action for Pat Rivera at Dodge. She was late on 10/15. This is a verbal warning. Payroll deduct no.",
    ]);
    const { reference } = await create();
    const policy = field(await review(reference.instanceId), "policy_language")!.value!;
    expect(policy).toContain("Lack of punctuality or absenteeism");
    expect(policy).toMatch(/Source: JBA Policy Manual — Attendance, p\. 14/);
    expect(policy).not.toMatch(/Invented/);
    expect(policy).not.toMatch(/Dress Code/);
  });

  it("never puts a policy field on the Coaching Form without approval", async () => {
    const { listTemplateSummaries: list } = await import("@/lib/forms/repository");
    const coaching = (await list()).find((summary) => summary.key === "coaching")!;
    const keys = JSON.stringify(coaching.currentVersion!.document).match(/"key":"([a-z_]+)"/g) ?? [];
    expect(keys.join(" ")).not.toMatch(/policy/);
  });

  it("does not offer a Corrective Action Form for a first offence or for coaching that worked", async () => {
    const { suggestFormsForTurn } = await import("@/lib/ai/form-proposal");
    const base = { history: [], actor: { role: "admin" as const, scope: state.scope as AccessScope }, summaries: await listTemplateSummaries(), today: "2026-10-16" };
    for (const question of [
      "Casey Brandt was out of dress code today at Kearney",
      "I coached Casey Brandt about dress code and she improved, but she is still a little late sometimes",
    ]) {
      const suggested = suggestFormsForTurn({ ...base, question });
      expect(suggested?.selection.additional.map((card) => card.templateKey) ?? []).not.toContain("dpoa");
    }
  });
});

/* ========================================================================= */
/* A COMPLETE CONVERSATION                                                    */
/* ========================================================================= */

describe("a manager who gives everything is never asked for it again", () => {
  it("builds the correct populated form from details given across turns", async () => {
    state.manual = { chunks: MANUAL_CHUNKS };
    const asksFor = {
      name: /who is this|give me their name/i,
      store: /which location is this about|which store|more than one store/i,
      position: /position \(job title\)\?/,
      date: /Which date goes on the form\?/,
      payroll: /payroll deduct\*\*? yes or no/i,
      level: /verbal warning or a written warning/i,
    };

    const turns = [
      "I need a corrective action for sam ortega. She's a makery associate and works at Kearney.",
      "She was out of dress code on 10/11 and 10/12. I verbally coached her about it on 9/1. Use the dress code policy.",
      "Use 10/12 for the form date.",
      "This is a verbal warning and payroll deduct is not applicable.",
    ];
    const { responses, proposal, create } = await conversation(turns);

    // Every fact is asked for at most once, and never after it was given.
    const given = [
      { after: 0, pattern: asksFor.name },
      { after: 0, pattern: asksFor.store },
      { after: 0, pattern: asksFor.position },
      { after: 2, pattern: asksFor.date },
      { after: 3, pattern: asksFor.payroll },
      { after: 3, pattern: asksFor.level },
    ];
    for (const { after, pattern } of given) {
      for (const response of responses.slice(after + (pattern === asksFor.date ? 0 : 0))) {
        if (responses.indexOf(response) <= after && pattern !== asksFor.date) {
          // before it was given, the reply may legitimately still need it — but only name/store/position were given in turn 0
          if (after === 0) expect(response.content, String(pattern)).not.toMatch(pattern);
        } else if (responses.indexOf(response) > after) {
          expect(response.content, String(pattern)).not.toMatch(pattern);
        }
      }
    }
    expect(responses[1]!.content.match(/Which date goes on the form\?/g)?.length ?? 0).toBe(1);
    expect(responses.slice(2).every((response) => !asksFor.date.test(response.content))).toBe(true);

    expect(proposal).toMatchObject({
      templateKey: "dpoa",
      status: "ready",
      // QA 22 Oct 2026 decision: off the directory the manager's spelling is kept as typed.
      employeeName: "sam ortega",
      employeeRole: "Makery Associate",
      employeeRoleSource: "manager",
      locationId: "loc-66",
      locationSource: "manager",
      formDate: "2026-10-12",
      warningLevel: "verbal",
      payrollDeduct: "no",
      supportsInlineDraft: true,
    });

    state.draft = {
      values: {
        observation: "Observed:\nSam Ortega was out of dress code on 10/11 and 10/12.",
        action_plan: "Sam Ortega is expected to arrive in the required dress code.",
        prior_actions: "Verbal coaching — signed 09/01/2026",
      },
      checked: { offense_type: ["dress_code"] },
    };
    const { reference, draftWarning } = await create();
    expect(draftWarning).toBeNull();
    const form = await review(reference.instanceId);

    // QA 22 Oct 2026 decision: off the directory the manager's spelling is kept as typed.
    expect(form.instance.employeeName).toBe("sam ortega");
    expect(form.instance.locationId).toBe("loc-66");
    expect(field(form, "job_title")!.value).toBe("Makery Associate");
    expect(field(form, "form_date")!.value).toBe("2026-10-12");
    expect(field(form, "warning_type")!.checked).toEqual(["verbal"]);
    expect(field(form, "payroll_deduct")!.checked).toEqual(["no"]);
    expect(field(form, "offense_type")!.checked).toEqual(["dress_code"]);
    expect(field(form, "observation")!.value).toContain("10/11 and 10/12");
    expect(field(form, "policy_language")!.value).toMatch(/Source: JBA Policy Manual — Dress Code for The Company, p\. 15/);
    expect(field(form, "policy_violated")!.value).toBe("Dress Code Violation");
  });
});

/* ========================================================================= */
/* THE BROWSER SPEC'S PROPOSALS ARE THE SERVER'S, NOT HAND-WRITTEN            */
/* ========================================================================= */

describe("browser fixture", () => {
  it("e2e/fixtures/admin-feedback-oct16.json is what the server produces for these conversations", async () => {
    const { readFileSync, writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const scenarios = {
      complete: await conversation([
        "My employee pat rivera was 10 minutes late on 10/5 and 10/15. I verbally coached her on the first one. She is at Dodge. Please create a CA form so I can document. This is a verbal warning. Payroll deduct is not applicable.",
      ]),
      ambiguousStore: await conversation([
        "Create a corrective action for Casey Brandt in Sioux Falls, out of dress code on 10/11. This is a verbal warning.",
      ]),
      noPosition: await conversation([
        "Create a corrective action for Sam Ortega at Kearney, out of dress code on 10/11. This is a verbal warning.",
      ]),
    };
    const produced = Object.fromEntries(
      Object.entries(scenarios).map(([name, played]) => [
        name,
        { content: played.last.content, proposal: { ...played.proposal, proposalId: `prop-${name}` } },
      ]),
    );
    const path = join(process.cwd(), "e2e/fixtures/admin-feedback-oct16.json");
    if (process.env.UPDATE_E2E_FIXTURE) writeFileSync(path, `${JSON.stringify(produced, null, 2)}\n`);
    const normalize = (value: unknown) =>
      JSON.parse(JSON.stringify(value).replace(/"sourceMessageIds":\[[^\]]*\]/g, '"sourceMessageIds":[]'));
    expect(normalize(produced)).toEqual(normalize(JSON.parse(readFileSync(path, "utf8"))));
  });
});

describe("a bare answer is never taken for the employee's name", () => {
  it.each([
    ["which store?", "Kearney"],
    ["which store?", "Dodge"],
  ])("a bare %j answer %j keeps the employee", async (_q, store) => {
    const { proposal } = await conversation([
      "Create a corrective action for Sam Ortega, out of dress code on 10/11. This is a verbal warning.",
      store,
    ]);
    expect(proposal.employeeName).toBe("Sam Ortega");
    expect(proposal.locationId).toBe(store === "Kearney" ? "loc-66" : "loc-264");
  });

  it("a bare position answer sets the position, not the name", async () => {
    const { proposal } = await conversation([
      "Create a corrective action for Sam Ortega at Kearney, out of dress code on 10/11. This is a verbal warning.",
      "barista",
    ]);
    expect(proposal.employeeName).toBe("Sam Ortega");
    expect(proposal.employeeRole).toBe("Barista");
  });

  it("a bare date answer sets the date, not the name", async () => {
    const { proposal } = await conversation([
      "Create a corrective action for Sam Ortega at Kearney, late on 10/5 and 10/15. This is a verbal warning.",
      "most recent",
    ]);
    expect(proposal.employeeName).toBe("Sam Ortega");
    expect(proposal.formDate).toBe("2026-10-15");
  });
});

describe("a real correction after one of Bubbles' questions is still a correction", () => {
  it("changes the employee when the manager answers the position question with another person", async () => {
    const { responses, proposal } = await conversation([
      "Create a corrective action for Sam Ortega at Kearney, out of dress code on 10/11. This is a verbal warning.",
      "actually make it Jordan Vance",
    ]);
    expect(responses[0]!.content).toMatch(/position \(job title\)\?/);
    expect(proposal.employeeName).toBe("Jordan Vance");
  });
});
