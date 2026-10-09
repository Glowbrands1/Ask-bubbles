import { extractText, getDocumentProxy } from "unpdf";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { AccessScope, ChatMessage } from "@/types";

vi.mock("@/config/company/locations", async () =>
  (await import("@/test/fixtures/reference-roster")).referenceRosterModule(),
);

/**
 * ============================================================================
 * THE WARNING BEING ISSUED NOW IS THE MANAGER'S — END TO END
 * ============================================================================
 *
 * Production, 9 Oct 2026:
 *
 *   "create a ca form for paulyne test, she was late again for 30 mins today.
 *    given verbal warning on 9/21"
 *
 * came back with Written Warning ticked, while the 9/21 verbal warning was
 * correctly listed as history. The earlier warning (and "again") was read as
 * a reason to escalate, by an intake that took ANY "verbal warning" as the
 * answer to "verbal or written?" and a drafting model that was allowed to
 * tick the box.
 *
 * Every scenario here runs the real chain — conversation -> proposal ->
 * `createInlineForm` -> POST /api/forms/instances -> POST .../draft -> GET
 * .../[id] -> a correction in chat -> GET .../pdf — against the in-memory
 * Supabase fake. No production record or draft is read or written.
 *
 * THE MODEL HERE TICKS WRITTEN WARNING ON EVERY DRAFT, which is the production
 * behaviour. Nothing it ticks on Type of Warning may reach the record; what
 * the box holds is the level the manager stated for this form, or nothing.
 */

const TODAY = "2026-10-09";

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
  role: "location_manager",
  scope: null as unknown,
  modelCalls: 0,
  toolValues: {} as Record<string, string>,
  toolChecked: {} as Record<string, string[]>,
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
          subject: "manager-1",
          email: "manager@example.com",
          displayName: "Manager",
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
        state.modelCalls += 1;
        return {
          content: [
            {
              type: "tool_use",
              name: "write_form_fields",
              input: { values: state.toolValues, checked: state.toolChecked },
            },
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
    // A healthy Performance Management Framework, so the governed draft runs.
    async fetchRoleGrounding() {
      const row = (index: number, locator: string, content: string) => ({
        chunk_id: `pmf-${index}`,
        document_id: "doc-progression",
        document_title: "ASK BUBBLES PERFORMANCE MANAGEMENT FRAMEWORK KB TEXT",
        category: "leadership_coaching",
        locator,
        page: null,
        section: null,
        content,
        similarity: 0,
      });
      return {
        ok: true,
        grounding: {
          role: { id: "performance_management_framework" },
          documentId: "doc-progression",
          documentTitle: "ASK BUBBLES PERFORMANCE MANAGEMENT FRAMEWORK KB TEXT",
          matchedBy: "tag",
          rows: [
            row(0, "SECTION 2 – PERFORMANCE MANAGEMENT LADDER", "Solve the issue at the lowest appropriate level."),
            row(1, "10.7 Final operating rule for Ask Bubbles", "Classify the issue before escalating."),
          ],
          presentGroups: ["escalation_ladder", "final_operating_rule"],
        },
      };
    }
    async fetchOfficialPolicyManual() {
      return { ok: false, reason: "not needed" };
    }
  },
}));

vi.mock("@/lib/knowledge", () => ({
  /* Server code must search through SupabaseKnowledgeProvider; the browser client cannot run here. */
  getKnowledgeProvider: () => {
    throw new Error("getKnowledgeProvider() is the browser knowledge client and must not be used on the server");
  },
}));

process.env.NEXT_PUBLIC_DEMO_MODE = "false";

const { ensureTemplateLibrary, listTemplateSummaries } = await import("@/lib/forms/repository");
const { proposeFormForTurn } = await import("@/lib/ai/form-proposal");
const { createInlineForm } = await import("@/features/chat/create-inline-form");
const { correctActiveForm } = await import("@/lib/forms/chat-correction");
const instancesRoute = await import("./instances/route");
const instanceRoute = await import("./instances/[id]/route");
const draftRoute = await import("./instances/[id]/draft/route");
const pdfRoute = await import("./instances/[id]/pdf/route");

/** The view's join, which the fake does not model — see `exit-form-e2e.test.ts`. */
function joinOverview() {
  for (const row of store.form_instances ?? []) {
    const template = store.form_templates!.find((entry) => entry.id === row.template_id);
    const version = store.form_template_versions.find((entry) => entry.id === row.template_version_id);
    Object.assign(row, {
      form_date: row.form_date ?? TODAY,
      template_key: template?.key,
      template_name: template?.name,
      layout_family: template?.layout_family,
      template_version: version?.version,
    });
  }
}

const requests: { url: string; body: Record<string, unknown> }[] = [];

/** The browser's `formsFetch`, dispatched straight into the route handlers. */
async function call<T>(url: string, init?: RequestInit): Promise<T> {
  requests.push({ url, body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> });
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

let sequence = 0;
const said = (content: string): ChatMessage => ({
  id: `m${(sequence += 1)}`,
  role: "user",
  content,
  createdAt: "2026-10-09T15:00:00Z",
});

/**
 * Plays the manager's turns through the real proposal flow, feeding Ask
 * Bubbles' real answers forward as history, then creates the form from the
 * last proposal exactly as the chat's Create draft button does.
 */
async function conversation(turns: string[]) {
  const messages: ChatMessage[] = [];
  let proposal = null as Awaited<ReturnType<typeof proposeFormForTurn>> extends infer R
    ? R extends { formProposal?: infer P } ? P | null : null
    : null;
  let content = "";
  for (const turn of turns) {
    const message = said(turn);
    const response = await proposeFormForTurn({
      history: messages,
      question: message.content,
      questionMessageId: message.id,
      actor: { role: state.role as never, scope: state.scope as AccessScope },
      summaries: await listTemplateSummaries(),
      today: TODAY,
      ...(proposal ? { continueTemplateKey: proposal.templateKey } : {}),
    });
    expect(response?.formProposal, turn).toBeDefined();
    proposal = response!.formProposal!;
    content = response!.content;
    messages.push(message, {
      id: `a${sequence}`,
      role: "assistant",
      content,
      createdAt: "2026-10-09T15:00:01Z",
      formProposal: proposal,
    } as ChatMessage);
  }
  expect(proposal!.templateKey).toBe("dpoa");
  expect(proposal!.supportsInlineDraft).toBe(true);
  const result = await createInlineForm({
    proposal: proposal!,
    messages: messages.filter((message) => message.role === "user"),
    call,
    onCreated: () => {},
  });
  return { proposal: proposal!, content, result };
}

beforeEach(async () => {
  for (const key of Object.keys(store) as (keyof FakeStore)[]) store[key] = [];
  requests.length = 0;
  state.role = "location_manager";
  state.scope = { level: "location", primaryAreaId: "loc-0310", alsoCoversAreaIds: [] };
  state.modelCalls = 0;
  state.toolValues = {};
  /*
   * THE MODEL, AS IT BEHAVED IN PRODUCTION: it ticks Written Warning on every
   * draft. Nothing it ticks on Type of Warning may reach the record.
   */
  state.toolChecked = { warning_type: ["written"], offense_type: ["tardiness"] };
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-09T15:00:00Z"));
  await ensureTemplateLibrary("system");
});



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

async function download(id: string) {
  joinOverview();
  const response = await pdfRoute.GET(new Request(`https://app.test/api/forms/instances/${id}/pdf`), {
    params: Promise.resolve({ id }),
  });
  expect(response.status).toBe(200);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const { text } = await extractText(await getDocumentProxy(bytes.slice()), { mergePages: true });
  return text;
}

async function row(id: string, key: string) {
  return (await review(id)).values.find((entry) => entry.fieldKey === key) ?? null;
}

const ticked = async (id: string) => (await row(id, "warning_type"))?.checked ?? [];

async function correct(id: string, question: string) {
  return correctActiveForm({
    request: new Request("https://app.test/api/chat"),
    instanceId: id,
    question,
    today: TODAY,
  });
}

const QUESTION = "Is this new corrective action a **Verbal Warning** or a **Written Warning**?";
const REPORT =
  "create a ca form for paulyne test, she was late again for 30 mins today. given verbal warning on 9/21";

/* ------------------------------------------------------------------------ */

describe("1. previous verbal warning, current warning unspecified (the production report)", () => {
  /*
   * THE OWNER'S RULE, 9 Oct 2026: "given verbal warning on 9/21" ticks Verbal
   * — the level that was given — and the 9/21 date is the history line. The
   * model's Written tick never lands.
   */
  it("ticks Verbal from \"given verbal warning\", records the 9/21 history, and never Written", async () => {
    const { proposal, content, result } = await conversation([REPORT]);

    expect(proposal.employeeName).toBe("Paulyne Test");
    expect(proposal.warningLevel).toBe("verbal");
    expect(content).toContain("**Type of warning:** Verbal Warning, as you said");
    expect(content).not.toContain(QUESTION);

    const id = result.reference.instanceId;
    expect(await ticked(id)).toEqual(["verbal"]);
    expect((await row(id, "prior_actions"))?.value).toBe("Verbal warning — signed 09/21/2026");
    expect((await row(id, "offense_type"))?.checked).toEqual(["tardiness"]);

    const text = await download(id);
    expect(text).toContain("Verbal warning - signed 09/21/2026");
  });

  it("with no level given at all, asks and ticks nothing", async () => {
    const { proposal, content, result } = await conversation([
      "create a ca form for paulyne test, she was late again for 30 mins today. got a verbal warning on 9/21",
    ]);

    expect(proposal.warningLevel).toBeNull();
    expect(content).toContain(QUESTION);
    expect(await ticked(result.reference.instanceId)).toEqual([]);
  });

  it("takes a one-word answer to the question onto the same open proposal", async () => {
    const { proposal, content } = await conversation([REPORT, "verbal"]);

    expect(proposal.warningLevel).toBe("verbal");
    expect(proposal.employeeName).toBe("Paulyne Test");
    expect(content).toContain("**Type of warning:** Verbal Warning, as you said");
    expect(content).not.toContain(QUESTION);
  });

  it("an answer after the draft exists updates that draft, not a new one", async () => {
    const { result } = await conversation([REPORT]);
    const id = result.reference.instanceId;

    const reply = await correct(id, "verbal");

    expect(reply?.formUpdate).toEqual({ instanceId: id, updated: ["warning_type"] });
    expect(reply?.content).toMatch(/Type of Warning → Verbal Warning/);
    expect(await ticked(id)).toEqual(["verbal"]);
    expect(store.form_instances).toHaveLength(1);
    expect((await row(id, "prior_actions"))?.value).toBe("Verbal warning — signed 09/21/2026");
  });
});

describe("2. previous verbal warning, current verbal warning explicitly requested", () => {
  it("ticks Verbal only, as the manager's statement, and keeps the history", async () => {
    const { proposal, content, result } = await conversation([
      `${REPORT}. give her a verbal warning for today`,
    ]);

    expect(proposal.warningLevel).toBe("verbal");
    expect(content).toContain("**Type of warning:** Verbal Warning, as you said");
    expect(content).not.toContain(QUESTION);

    const id = result.reference.instanceId;
    const warning = await row(id, "warning_type");
    expect(warning?.checked).toEqual(["verbal"]);
    expect(warning?.checked).not.toContain("written");
    expect(warning?.filledBy).toBe("system");
    expect((await row(id, "prior_actions"))?.value).toBe("Verbal warning — signed 09/21/2026");
  });
});

describe("3. previous verbal warning, current written warning explicitly requested", () => {
  it("ticks Written, because the manager said so", async () => {
    const { proposal, result } = await conversation([`${REPORT}. this one is a written warning`]);

    expect(proposal.warningLevel).toBe("written");
    const id = result.reference.instanceId;
    expect(await ticked(id)).toEqual(["written"]);
    expect((await row(id, "prior_actions"))?.value).toBe("Verbal warning — signed 09/21/2026");
  });
});

describe("4. multiple previous warnings with different dates", () => {
  it("lists every step oldest first and sets only the level stated for this form", async () => {
    const { proposal, result } = await conversation([
      "Create a CA for Jessica Moss. She was 30 minutes late again today. She was coached on 8/12, got a verbal warning on 9/2 and a written warning on 9/21. Give her a written warning. No payroll deduct.",
    ]);

    expect(proposal.warningLevel).toBe("written");
    const id = result.reference.instanceId;
    expect((await row(id, "prior_actions"))?.value).toBe(
      ["Coaching — signed 08/12/2026", "Verbal warning — signed 09/02/2026", "Written warning — signed 09/21/2026"].join("\n"),
    );
    expect(await ticked(id)).toEqual(["written"]);
    expect((await row(id, "payroll_deduct"))?.checked).toEqual(["no"]);
  });

  it("asks when the several prior warnings come with no level for this one", async () => {
    const { proposal, content, result } = await conversation([
      "Create a CA for Jessica Moss, late again today. She got a verbal warning on 9/2 and a written warning on 9/21.",
    ]);

    expect(proposal.warningLevel).toBeNull();
    expect(content).toContain(QUESTION);
    expect(await ticked(result.reference.instanceId)).toEqual([]);
  });
});

describe("5. the manager changes Written Warning to Verbal Warning through chat", () => {
  it("updates the same draft, unticks Written, and leaves every other line as it was", async () => {
    const { result } = await conversation([`${REPORT}. this one is a written warning. no payroll deduct`]);
    const id = result.reference.instanceId;
    expect(await ticked(id)).toEqual(["written"]);
    const before = Object.fromEntries(
      (await review(id)).values
        .filter((entry) => entry.fieldKey !== "warning_type")
        .map((entry) => [entry.fieldKey, { value: entry.value, checked: entry.checked }]),
    );

    const reply = await correct(id, "change written warning to verbal warning");

    expect(reply?.formUpdate).toEqual({ instanceId: id, updated: ["warning_type"] });
    expect(reply?.content).toMatch(/Type of Warning → Verbal Warning \(Written Warning unticked\)/);
    expect(await ticked(id)).toEqual(["verbal"]);
    // The correction is the manager's own edit.
    expect((await row(id, "warning_type"))?.filledBy).toBe("manager");

    // Nothing else moved: history, its date, the offense, payroll, the narrative.
    const after = Object.fromEntries(
      (await review(id)).values
        .filter((entry) => entry.fieldKey !== "warning_type")
        .map((entry) => [entry.fieldKey, { value: entry.value, checked: entry.checked }]),
    );
    expect(after).toEqual(before);
    expect(after.prior_actions?.value).toBe("Verbal warning — signed 09/21/2026");

    // One record — the correction did not start a second form.
    expect(store.form_instances).toHaveLength(1);
  });

  it("before the draft exists, the latest stated level wins on the same proposal", async () => {
    const { proposal, content, result } = await conversation([
      REPORT,
      "make it a written warning",
      "actually change it to verbal",
    ]);

    expect(proposal.employeeName).toBe("Paulyne Test");
    expect(proposal.warningLevel).toBe("verbal");
    expect(content).toContain("**Type of warning:** Verbal Warning, as you said");
    const id = result.reference.instanceId;
    expect(await ticked(id)).toEqual(["verbal"]);
    expect((await row(id, "prior_actions"))?.value).toBe("Verbal warning — signed 09/21/2026");
    expect(store.form_instances).toHaveLength(1);
  });

  it.each(["make it a verbal warning", "it should be verbal, not written", "Switch it to verbal."])(
    "%s",
    async (question) => {
      const { result } = await conversation([`${REPORT}. this one is a written warning`]);
      const id = result.reference.instanceId;

      const reply = await correct(id, question);

      expect(reply?.formUpdate?.updated).toEqual(["warning_type"]);
      expect(await ticked(id)).toEqual(["verbal"]);
      expect(store.form_instances).toHaveLength(1);
    },
  );

  it("keeps a final action a manager ticked by hand when only the level changes", async () => {
    const { result } = await conversation([`${REPORT}. this one is a written warning`]);
    const id = result.reference.instanceId;
    store.form_instance_values!.find(
      (entry) => entry.instance_id === id && entry.field_key === "warning_type",
    )!.checked = ["written", "demotion"];

    await correct(id, "change it to verbal");

    expect(await ticked(id)).toEqual(["demotion", "verbal"]);
  });

  it("does not treat more history, or a question, as a change", async () => {
    const { result } = await conversation([`${REPORT}. this one is a written warning`]);
    const id = result.reference.instanceId;

    expect(await correct(id, "she also had a verbal warning on 8/1")).toBeNull();
    expect(await correct(id, "should this be verbal?")).toBeNull();
    expect(await ticked(id)).toEqual(["written"]);
  });

  it("does not read a request for another person's form as a correction", async () => {
    const { result } = await conversation([`${REPORT}. this one is a written warning`]);
    const id = result.reference.instanceId;

    expect(await correct(id, "create a verbal warning for Jordan Smith, late today")).toBeNull();
    expect(await ticked(id)).toEqual(["written"]);
  });
});

describe("6. no prior corrective action", () => {
  it("records a first occurrence and the stated level", async () => {
    const { proposal, result } = await conversation([
      "create a ca for sarah test, she was 30 minutes late today, this is the first time. give her a verbal warning",
    ]);

    expect(proposal.warningLevel).toBe("verbal");
    const id = result.reference.instanceId;
    expect((await row(id, "prior_actions"))?.value).toBe("None — first occurrence");
    expect(await ticked(id)).toEqual(["verbal"]);
  });

  it("asks, rather than defaulting, when no level and no history were given", async () => {
    const { proposal, content, result } = await conversation([
      "create a ca for sarah test, she was 30 minutes late today, this is the first time",
    ]);

    expect(proposal.warningLevel).toBeNull();
    expect(content).toContain(QUESTION);
    expect(content).not.toMatch(/treated the earlier warning/);
    expect(await ticked(result.reference.instanceId)).toEqual([]);
  });
});

describe("7. ambiguous descriptions of disciplinary history", () => {
  it.each([
    "create a ca for sarah test, late again today. she's been warned before",
    "create a ca for sarah test, late again today. she got a written warning",
    "create a ca for sarah test, late again today, not sure if verbal or written",
    "create a ca for sarah test, late again today. should this be a written warning?",
  ])("%s -> asked, never escalated", async (opening) => {
    const { proposal, content, result } = await conversation([opening]);

    expect(proposal.warningLevel).toBeNull();
    expect(content).toContain(QUESTION);
    expect(await ticked(result.reference.instanceId)).toEqual([]);
  });

  it("a level the browser asserts but the conversation never stated is refused at creation", async () => {
    const { result } = await conversation([REPORT]);
    store.form_instances = [];
    store.form_instance_values = [];
    requests.length = 0;

    const forged = await call<{ instance: { id: string } }>("/api/forms/instances", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        templateKey: "dpoa",
        employeeName: "paulyne test",
        locationId: "loc-0310",
        source: "assistant",
        warningLevel: "written",
        conversation: [{ id: "m1", role: "user", content: REPORT }],
      }),
    });

    expect(result.reference.instanceId).toBeTruthy();
    expect(await ticked(forged.instance.id)).toEqual([]);
  });
});

/*
 * ============================================================================
 * THE INDEPENDENT REVIEW'S SCENARIOS (PR #10)
 * ============================================================================
 */
describe("review: a level said about another form, or as history, never lands on this one", () => {
  it.each([
    "written warning on the 21st, now late again",
    "written warning 2 weeks back, now late again",
    "written warning at her review, now late again today",
    "written warning issued, she's late again today",
  ])("a reply opening with past history, then the new incident: %s", async (reply) => {
    const { proposal, result } = await conversation(["create a ca form for paulyne test, late again today", reply]);

    expect(proposal.warningLevel).toBeNull();
    expect(await ticked(result.reference.instanceId)).toEqual([]);
  });

  it("a written warning stated for Jordan earlier in the chat does not tick Paulyne's form", async () => {
    const { proposal, result } = await conversation([
      "create a ca form for jordan smith, no call no show today. give a written warning",
      REPORT,
    ]);

    expect(proposal.employeeName).toBe("Paulyne Test");
    // Paulyne's own "given verbal warning", never Jordan's written one.
    expect(proposal.warningLevel).toBe("verbal");
    expect(await ticked(result.reference.instanceId)).toEqual(["verbal"]);
  });

  it.each([
    `${REPORT}.\nPrevious actions:\n- verbal warning\n- written warning`,
    `${REPORT}. she has a written warning from august`,
    `${REPORT}. she is on a written warning`,
    "create a ca form for paulyne test, late again today. she did get a written warning in august",
    "create a ca form for paulyne test, late again today. she did get a written warning on 9/21",
    "create a ca form for paulyne test, late again today. she gets a written warning 10/1",
    "create a ca form for paulyne test, late again today. 10/1 she gets a written warning",
    "create a ca form for paulyne test, late again today. first verbal warning 9/21 second written warning 10/1",
    "create a ca form for paulyne test, late again today. she's on her second written warning",
    "create a ca form for paulyne test, late again today. she'd get a written warning back then",
    "create a ca form for paulyne test, late again today. she always gets a written warning",
    `${REPORT}. last month written warning`,
    `${REPORT}. 2 weeks ago, written warning`,
    `${REPORT}. last CA: written warning`,
    `${REPORT}. in august: written warning`,
    `${REPORT}. the first time was a verbal warning`,
    `${REPORT}. she had one on 10/1. written warning`,
    `${REPORT}. back in the summer, written warning`,
    `${REPORT}. at her 90 day review written warning`,
    `${REPORT}. her old manager did a written warning`,
  ])("%s -> no level from the history (Verbal only where \"given verbal warning\" said so)", async (opening) => {
    const { proposal, content, result } = await conversation([opening]);

    if (opening.startsWith(REPORT)) {
      // The report's own "given verbal warning" is the level; the history after it never escalates it.
      expect(proposal.warningLevel).toBe("verbal");
      expect(await ticked(result.reference.instanceId)).toEqual(["verbal"]);
      return;
    }
    expect(proposal.warningLevel).toBeNull();
    expect(content).toContain(QUESTION);
    expect(await ticked(result.reference.instanceId)).toEqual([]);
  });
});

describe("review: corrections apply only to this form, and never from history", () => {
  it.each([
    "she also has a written warning from august",
    "fyi she is on a written warning",
    "Previous actions:\n- verbal warning\n- written warning",
    "jordan was late today, give him a verbal warning",
    "also marcus no call no show, give him a written warning",
    "for the other girl it's a written warning",
    "kim was late too - written warning",
    "sarah was late again today, make it a written warning",
    "Jordan Smith was late. Change it to written",
    "update it, last month written warning",
    "kim was late too. change it to written",
    "also change it to written for sarah",
    "change it to written for kim",
    "kim was rude. change it to written",
    "for jordan: change it to written",
    "and jo was late. change to written",
    "kim's late too, change it to written",
    "change kim to written",
    "change it to written for kim please",
    "change it to written for kim's form",
    "also jo. change it to written",
    "kim too, make it written",
  ])("%s leaves the draft's Verbal tick alone", async (question) => {
    const { result } = await conversation([`${REPORT}. give her a verbal warning for today`]);
    const id = result.reference.instanceId;
    expect(await ticked(id)).toEqual(["verbal"]);

    expect(await correct(id, question)).toBeNull();
    expect(await ticked(id)).toEqual(["verbal"]);
  });

  it.each([
    "change written warning to verbal",
    "change the written warning to verbal",
    "change written warning to verbal for paulyne",
    "set the warning type to verbal",
    "verbal not written",
    "no, verbal",
    "actually verbal",
    "oops i meant verbal",
    "it should have been verbal",
    "change paulyne's warning to verbal",
    "Paulyne Test was late. change it to verbal",
    "she was late because of traffic, change it to verbal",
    "change it to verbal for tardiness",
    "traffic was bad, change it to verbal",
    "manager was wrong, change it to verbal",
    "my mistake was picking written, change it to verbal",
    "make it verbal for sure",
    "change it to verbal for real",
    "verbal please",
    "change it to verbal for consistency",
    "change it to verbal for fairness",
    "the schedule was wrong, change it to verbal",
    "my dm was clear, change it to verbal",
    "payroll was wrong, change it to verbal",
  ])("%s updates the same draft", async (question) => {
    const { result } = await conversation([`${REPORT}. this one is a written warning`]);
    const id = result.reference.instanceId;

    const reply = await correct(id, question);

    expect(reply?.formUpdate).toEqual({ instanceId: id, updated: ["warning_type"] });
    expect(await ticked(id)).toEqual(["verbal"]);
    expect(store.form_instances).toHaveLength(1);
  });

  it("a level with no conversation behind it is not written at creation", async () => {
    const forged = await call<{ instance: { id: string } }>("/api/forms/instances", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        templateKey: "dpoa",
        employeeName: "paulyne test",
        locationId: "loc-0310",
        source: "assistant",
        warningLevel: "written",
      }),
    });
    expect(await ticked(forged.instance.id)).toEqual([]);
  });
});

describe("review: the history line across the year boundary", () => {
  it("a December warning, mentioned in January, is dated last December", async () => {
    vi.setSystemTime(new Date("2027-01-05T15:00:00Z"));
    const { proposal, result } = await conversation([
      "create a ca form for paulyne test, she was late again for 30 mins today. given verbal warning on 12/20",
    ]);

    expect(proposal.warningLevel).toBe("verbal");
    const id = result.reference.instanceId;
    expect(await ticked(id)).toEqual(["verbal"]);
    expect((await row(id, "prior_actions"))?.value).toBe("Verbal warning — signed 12/20/2026");
  });
});
