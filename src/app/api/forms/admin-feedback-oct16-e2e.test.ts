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
        messages: messages.filter((message) => message.role === "user"),
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
      "My employee tiffany lempka was late on 10/5 and 10/15. Please create a CA form.",
      "She is at Dodge",
    ]);
    expect(responses[0]!.formProposal!.employeeName).toBe("Tiffany Lempka");
    expect(proposal.employeeName).toBe("Tiffany Lempka");
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

  it("the manager's own title wins over Woven's, and the disagreement is said", async () => {
    const { proposal, last } = await conversation(["Create a corrective action for Casey Brandt at Kearney, she is a shift lead, out of dress code on 10/11."]);
    expect(proposal.employeeRole).toBe("Shift Lead");
    expect(proposal.employeeRoleSource).toBe("manager");
    expect(last.content).toMatch(/Woven lists \*\*Casey\*\* as \*\*Makery Associate\*\*/);
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
    expect(last.content).toMatch(/Woven shows \*\*Casey\*\* at \*\*Kearney, NE\*\*, but you said \*\*Bellevue, NE\*\*/);
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
