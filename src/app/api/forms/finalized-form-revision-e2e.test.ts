import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import { joinedOnRead } from "@/test/overview-join";
import type { ChatFormProposal, ChatMessage } from "@/types";

vi.mock("@/config/company/locations", async () =>
  (await import("@/test/fixtures/reference-roster")).referenceRosterModule(),
);

/**
 * ============================================================================
 * EDITING A FINALIZED FORM AS A NEW DRAFT OF IT — THROUGH THE WHOLE APP
 * ============================================================================
 *
 * Ported from the reference platform's revision e2e test (its production
 * feedback, 20 Oct 2026: "change exit for <name>", "duplicate exit … and
 * change date notice given to 9-27-26", "show draft of exit" were all
 * answered "a created form can't be changed"), and extended to what only Ask
 * Bubbles has: several form cards in one message, the "which form?" question,
 * and header corrections on any form.
 *
 * Each turn goes through POST /api/chat (the real route, the real correction,
 * policy-change, revision and reopen paths); each card through
 * `createInlineForm` into POST /api/forms/instances and POST .../draft; the
 * card's buttons through POST/DELETE /api/forms/instances/[id]. The thread is
 * kept exactly as the browser keeps it: a turn's `formOpened` becomes that
 * answer's `formInstanceRef` (`openedFormReference`), and the next turn's
 * open form is read off it (`activeFormInstanceFor`).
 *
 * Real: the chat route, the proposal, the form library, the create, draft,
 * finalize, revise and delete routes, the Forms visibility rules. Doubled:
 * identity, the model, the knowledge base and the database. All people are
 * synthetic.
 */

const store = {
  form_instances: [],
  form_instance_values: [],
  form_instance_events: [],
  form_template_versions: [],
  form_templates: [],
  form_template_current: [],
  form_template_assets: [],
  // Woven's stores for a person (`forms-visibility.ts`), set per test.
  employee_access_preview: [],
  employee_location_affiliations: [],
  woven_location_map: [],
} as FakeStore & Record<string, Record<string, unknown>[]>;

const state = vi.hoisted(() => ({
  role: "location_manager",
  subject: "manager-1",
  scope: { level: "location", primaryAreaId: "loc-0310", alsoCoversAreaIds: ["loc-0311"] } as unknown,
  toolValues: {} as Record<string, string>,
  toolChecked: {} as Record<string, string[]>,
  modelCalls: 0,
  manual: null as unknown,
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

vi.mock("@/lib/config/server-env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/config/server-env")>()),
  liveReadiness: () => ({ mode: "live", missing: [], problems: [], ready: true }),
}));

vi.mock("@/lib/auth/server", async () => {
  const { DEFAULT_PERMISSION_MATRIX, hasPermission } = await import("@/lib/permissions");
  const { AuthError } = await import("@/lib/auth/types");
  return {
    authorizeRequest: async (_request: Request, permission: string) => {
      if (!hasPermission(DEFAULT_PERMISSION_MATRIX, state.role as never, permission as never)) {
        throw new AuthError("forbidden", "Your role does not have permission to do that.");
      }
      return {
        identity: {
          subject: state.subject,
          email: `${state.subject}@example.test`,
          displayName: state.subject,
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

/* The turn record is analytics, proven in `api/chat/turn-lifecycle.test.ts`; not what is under test here. */
vi.mock("@/lib/analytics/record", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics/record")>()),
  openTurn: async () => "00000000-0000-4000-8000-000000000001",
  closeTurn: async () => {},
}));

vi.mock("@/lib/ai/call-claude", () => ({
  callClaude: async () => "An ordinary answer.",
}));

vi.mock("@/lib/reporting/read/report-briefing", () => ({ loadReportBriefing: async () => null }));
vi.mock("@/lib/reporting/read/employee-facts", () => ({
  loadEmployeeFacts: async () => null,
  NO_EMPLOYEE_DATASET_REASON: "no dataset",
  EMPLOYEE_DATA_HEADING: "CURRENT EMPLOYEE PERFORMANCE DATA",
}));

vi.mock("@/lib/knowledge/providers/supabase", () => ({
  SupabaseKnowledgeProvider: class {
    readonly name = "test double";
    async search() {
      return [];
    }
    async match() {
      return [];
    }
    async fetchRoleGrounding() {
      const row = (index: number, locator: string, content: string) => ({
        chunk_id: `pmf-${index}`,
        document_id: "doc-progression",
        document_title: "ASK BUBBLES PERFORMANCE MANAGEMENT FRAMEWORK KB TEXT",
        category: "leadership_coaching",
        locator,
        page: null,
        section: locator,
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
            row(1, "SECTION 3 – COACHING FRAMEWORK", "Coach the behaviour."),
            row(2, "SECTION 6 – DPOA FRAMEWORK", "The formal corrective step after coaching."),
            row(3, "10.7 Final operating rule for Ask Bubbles", "Classify the issue before escalating."),
          ],
          presentGroups: ["escalation_ladder", "coaching_framework", "dpoa_framework", "final_operating_rule"],
        },
      };
    }
    async fetchOfficialPolicyManual() {
      return state.manual ?? { ok: false, reason: "The official policy manual is not in the knowledge base." };
    }
    async fetchNamedHandbook() {
      return { ok: false, reason: "not used" };
    }
  },
}));

vi.mock("@/lib/knowledge", () => ({
  getKnowledgeProvider: () => {
    throw new Error("the browser knowledge client must not be used on the server");
  },
}));

process.env.NEXT_PUBLIC_DEMO_MODE = "false";

const { ensureTemplateLibrary } = await import("@/lib/forms/repository");
const { createInlineForm } = await import("@/features/chat/create-inline-form");
const { openedFormReference } = await import("@/features/chat/form-update-events");
const continuation = await import("@/lib/forms/proposal-continuation");
const { listOutstandingFollowUps } = await import("@/lib/forms/instances");
const chatRoute = await import("@/app/api/chat/route");
const instancesRoute = await import("./instances/route");
const instanceRoute = await import("./instances/[id]/route");
const draftRoute = await import("./instances/[id]/draft/route");

/** The browser's `formsFetch`, dispatched straight into the route handlers. */
async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const request = new Request(`https://app.test${url}`, init);
  const draft = /^\/api\/forms\/instances\/([^/]+)\/draft$/.exec(url);
  const response = draft
    ? await draftRoute.POST(request, { params: Promise.resolve({ id: draft[1]! }) })
    : url === "/api/forms/instances"
      ? await instancesRoute.POST(request)
      : null;
  if (!response) throw new Error(`no route for ${url}`);
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body;
}

async function review(id: string) {
  const response = await instanceRoute.GET(new Request(`https://app.test/api/forms/instances/${id}`), {
    params: Promise.resolve({ id }),
  });
  expect(response.status).toBe(200);
  return (await response.json()) as {
    instance: Record<string, unknown>;
    values: { fieldKey: string; value: string | null; checked: string[] }[];
    events: { kind: string; detail: Record<string, unknown> }[];
  };
}

/** The form card's buttons: Finalize, Edit as new draft. */
async function act(id: string, body: Record<string, unknown>) {
  const response = await instanceRoute.POST(
    new Request(`https://app.test/api/forms/instances/${id}`, { method: "POST", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );
  const payload = (await response.json()) as { instance?: { id: string; status: string }; error?: string };
  expect(response.status, payload.error).toBe(200);
  return payload.instance!;
}

/* ------------------------------------------------- the browser, in short -- */

let sequence = 0;
let thread: ChatMessage[] = [];

type Answer = ChatMessage & { formUpdate?: { instanceId: string; updated: string[] } };

/** One manager turn, sent exactly as `chat-screen.tsx` sends it, and kept as it keeps it. */
async function say(question: string): Promise<Answer> {
  const history = [...thread];
  const user: ChatMessage = { id: `msg_${(sequence += 1)}`, role: "user", content: question, createdAt: "2026-09-28T15:00:00Z" };
  thread.push(user);
  const named = continuation.activeFormInstanceFor(history, question);
  const candidates = continuation.activeFormCandidates(history);
  const response = await chatRoute.POST(
    new Request("https://app.test/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question,
        mode: "standard",
        history,
        questionMessageId: user.id,
        continueProposalTemplateKey: continuation.continuationFor(history)?.templateKey,
        activeFormInstanceId: named,
        ...(named === undefined && candidates.length > 1
          ? { activeFormCandidateIds: candidates.map((candidate) => candidate.instanceId) }
          : {}),
      }),
    }),
  );
  const payload = (await response.json()) as Record<string, unknown> & {
    content: string;
    formProposal?: ChatFormProposal;
    formProposals?: ChatFormProposal[];
    formOpened?: { instanceId: string; templateName: string; revisesInstanceId: string | null };
    formUpdate?: { instanceId: string; updated: string[] };
  };
  expect(response.status, JSON.stringify(payload)).toBe(200);
  const assistant: Answer = {
    id: `msg_${(sequence += 1)}`,
    role: "assistant",
    content: payload.content,
    createdAt: "2026-09-28T15:00:01Z",
    ...(payload.formProposal ? { formProposal: payload.formProposal } : {}),
    ...(payload.formProposals && payload.formProposals.length > 1 ? { formProposals: payload.formProposals } : {}),
    // A form this turn opened, as a card on the answer — `openedFormReference`.
    ...(payload.formOpened ? { formInstanceRef: openedFormReference(payload.formOpened) } : {}),
  };
  thread.push(assistant);
  return { ...assistant, ...(payload.formUpdate ? { formUpdate: payload.formUpdate } : {}) };
}

/** The card's Create button: `createInlineForm`, then the reference recorded as the store does. */
async function create(message: ChatMessage, proposal: ChatFormProposal) {
  let instanceId = "";
  await createInlineForm({
    proposal,
    messages: thread,
    call,
    onCreated: (reference) => {
      instanceId = reference.instanceId;
      const index = thread.findIndex((entry) => entry.id === message.id);
      thread[index] = { ...thread[index]!, ...continuation.withInstanceRef(thread[index]!, reference) };
    },
  });
  expect(instanceId).not.toBe("");
  return instanceId;
}

const cards = (message: ChatMessage) => continuation.proposalsOf(message);
const statusOf = (id: string) => store.form_instances.find((row) => row.id === id)?.status;
const valueOf = async (id: string, key: string) =>
  (await review(id)).values.find((row) => row.fieldKey === key) ?? null;
const outstanding = async () => (await listOutstandingFollowUps(50, null)).map((row) => row.id);

const EXIT =
  "Create an exit form for Jordan Smith at lincoln o street. She quit by text on 9/20, last day 9/19. She returned her key.";

/** Jordan Smith's exit form, created in chat and finalized with a follow-up. */
async function finalizedExit(): Promise<string> {
  const answer = await say(EXIT);
  const [card] = cards(answer);
  expect(card!.templateKey).toBe("resignation-exit");
  const id = await create(answer, card!);
  await act(id, { action: "finalize", followUpDate: "2026-10-05" });
  expect(statusOf(id)).toBe("finalized");
  return id;
}

beforeEach(async () => {
  for (const key of Object.keys(store)) store[key] = [];
  store.form_instances = joinedOnRead(store, "2026-09-28");
  thread = [];
  sequence = 0;
  state.role = "location_manager";
  state.subject = "manager-1";
  state.scope = { level: "location", primaryAreaId: "loc-0310", alsoCoversAreaIds: ["loc-0311"] };
  state.toolValues = { details: "Jordan resigned by text message." };
  state.toolChecked = {};
  state.modelCalls = 0;
  state.manual = null;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-28T15:00:00Z"));
  await ensureTemplateLibrary("system");
});

/* ============================================== THE PRODUCTION FEEDBACK === */

describe("a finalized exit form, asked for again in chat", () => {
  it("opens a new draft with the change made, and replaces the original only when that is finalized", async () => {
    const original = await finalizedExit();
    const before = (await review(original)).values;

    // A new conversation: nothing on screen, the form found by name.
    thread = [];
    const reply = await say("duplicate exit for jordan smith and change date notice given to 9-27-26");
    const draft = reply.formInstanceRef!.instanceId;
    expect(draft).not.toBe(original);
    expect(reply.content).toContain("was finalized, so I opened a new draft of it");
    expect(reply.content).toContain("Date that notice was given");
    expect(reply.formUpdate).toMatchObject({ instanceId: draft });

    // The draft: every answer carried, the change made, the follow-up kept.
    expect(statusOf(draft)).toBe("draft");
    expect((await valueOf(draft, "notice_given_date"))?.value).toBe("2026-09-27");
    expect((await valueOf(draft, "last_day_worked"))?.value).toBe((await valueOf(original, "last_day_worked"))?.value);
    expect((await review(draft)).instance.followUpDate).toBe("2026-10-05");
    expect((await review(draft)).instance.revisesInstanceId).toBe(original);

    // The original: untouched, still finalized, still the one tracking the follow-up.
    expect(statusOf(original)).toBe("finalized");
    expect((await review(original)).values).toEqual(before);
    expect(await outstanding()).toEqual([original]);

    // Asking again — in another words, or the card's own button — lands on the same draft.
    thread = [];
    expect((await say("change exit for jordan smith")).formInstanceRef!.instanceId).toBe(draft);
    expect((await act(original, { action: "revise" })).id).toBe(draft);
    expect(store.form_instances).toHaveLength(2);

    // Finalizing the draft replaces the original, and moves the follow-up to it.
    await act(draft, { action: "finalize", followUpDate: "2026-10-05" });
    expect(statusOf(original)).toBe("revised");
    expect((await review(original)).values).toEqual(before);
    expect(await outstanding()).toEqual([draft]);
    // The original's own history names what replaced it — "Open newer version" on its card.
    expect((await review(original)).events).toContainEqual(
      expect.objectContaining({ kind: "revised", detail: { revisionId: draft } }),
    );
  });

  it("'show draft of exit' puts the form back in the thread as it is", async () => {
    const original = await finalizedExit();
    const reply = await say("show draft of exit");
    expect(reply.formInstanceRef!.instanceId).toBe(original);
    expect(reply.content).toContain("Edit as new draft");
    expect(store.form_instances).toHaveLength(1);
  });

  it("deleting the draft leaves the original exactly as it was", async () => {
    const original = await finalizedExit();
    const before = (await review(original)).values;
    const draft = (await act(original, { action: "revise" })).id;

    // Removing a draft is `manage_form_records`, an administrator's permission.
    state.role = "admin";
    state.scope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
    const removed = await instanceRoute.DELETE(new Request(`https://app.test/api/forms/instances/${draft}`, { method: "DELETE" }), {
      params: Promise.resolve({ id: draft }),
    });
    expect(removed.status).toBe(200);

    expect(statusOf(original)).toBe("finalized");
    expect((await review(original)).values).toEqual(before);
    expect((await review(original)).events.map((event) => event.kind)).not.toContain("revised");
    expect(await outstanding()).toEqual([original]);
    // And it can be edited again from scratch.
    const next = (await act(original, { action: "revise" })).id;
    expect(next).not.toBe(draft);
    expect(statusOf(next)).toBe("draft");
  });

  it("never creates a new form, and leaves a request for one to the proposal flow", async () => {
    await finalizedExit();
    const reply = await say("create an exit form for Jordan Smith");
    expect(reply.formInstanceRef).toBeUndefined();
    expect(cards(reply)[0]?.templateKey).toBe("resignation-exit");
    expect(store.form_instances).toHaveLength(1);
  });
});

/* =========================================== A CORRECTION IN THE THREAD === */

describe("a correction typed against a finalized form in the conversation", () => {
  it("is made on a new draft, which the thread then follows", async () => {
    const original = await finalizedExit();
    const before = (await review(original)).values;

    const first = await say("her last day was 9/16");
    const draft = first.formInstanceRef!.instanceId;
    expect(first.content).toContain("was finalized, so I opened a new draft of it");
    expect(first.content).toContain("Last Day Worked");
    expect((await valueOf(draft, "last_day_worked"))?.value).toBe("2026-09-16");
    expect((await review(original)).values).toEqual(before);

    // The next correction goes straight to the draft: no second revision.
    const second = await say("change the date to 9/27");
    expect(second.content).toContain("Updated the **Resignation/Exit Form** for **Jordan Smith**");
    expect(second.content).not.toContain("opened a new draft");
    expect(second.formUpdate?.instanceId).toBe(draft);
    expect((await valueOf(draft, "form_date"))?.value).toBe("2026-09-27");
    expect(store.form_instances).toHaveLength(2);
    expect((await review(original)).values).toEqual(before);
  });
});

/* ============================================ SEVERAL FORMS, ONE MESSAGE === */

describe("two forms from one message, both finalized", () => {
  const PROMPT = "coaching form for Avery Testperson and a CA for Jordan Testperson";

  async function bothFinalized() {
    state.role = "admin";
    state.scope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
    state.toolValues = { observation: "Observed:\nArrived late." };
    state.toolChecked = { warning_type: ["verbal"] };
    const answer = await say(PROMPT);
    const [coaching, ca] = cards(answer);
    const avery = await create(answer, coaching!);
    const jordan = await create(thread.find((entry) => entry.id === answer.id)!, ca!);
    await act(avery, { action: "finalize", followUpDate: null, acknowledgeUnverifiedPolicy: true });
    await act(jordan, { action: "finalize", followUpDate: null, acknowledgeUnverifiedPolicy: true });
    return { avery, jordan };
  }

  it("a correction that names neither is asked about, and opens no draft", async () => {
    await bothFinalized();
    const reply = await say("change the date to 10/01/2026");
    expect(reply.content).toContain("Which one should I change?");
    expect(reply.formInstanceRef).toBeUndefined();
    expect(store.form_instances).toHaveLength(2);
  });

  it("a correction that names one person opens a new draft of that person's form only", async () => {
    const { avery, jordan } = await bothFinalized();
    const jordanBefore = (await review(jordan)).values;
    const reply = await say("change Avery's date to 10/01/2026");
    const draft = reply.formInstanceRef!.instanceId;
    expect(reply.content).toContain("The **Coaching Form** for **Avery Testperson** was finalized");
    expect((await review(draft)).instance.revisesInstanceId).toBe(avery);
    expect((await valueOf(draft, "form_date"))?.value).toBe("2026-10-01");
    expect((await review(jordan)).values).toEqual(jordanBefore);
    expect(statusOf(avery)).toBe("finalized");
    expect(store.form_instances).toHaveLength(3);
  });

});

/* ========================================== THE CORRECTIVE ACTION FORM === */

/** The Production manual's Standards of Conduct, as the policy tests quote it. */
const MANUAL = {
  ok: true,
  documentId: "doc-manual",
  documentTitle: "Employment Policy Manual",
  matchedBy: "fallback",
  chunks: [
    {
      chunkIndex: 36,
      page: 13,
      printedPage: 12,
      sections: [{ heading: "Standards of Conduct", page: 12 }],
      section: "Standards of Conduct",
      content:
        "Standards of Conduct\nThe Company expects Employees to follow rules of conduct that will protect the interests and\nsafety of all customers, Employees, and The Company.",
    },
    {
      chunkIndex: 69,
      page: 21,
      printedPage: 21,
      sections: [{ heading: "Background Checks", page: 21 }],
      section: "Background Checks",
      content: "Background Checks\nEmployees are subject to background checks for certain positions.",
    },
  ],
};

describe("a finalized Corrective Action Form, changed in chat", () => {
  /** A CA with an account, so its Action Plan is the one Ask Bubbles builds. */
  async function finalizedCa(): Promise<string> {
    state.manual = MANUAL;
    state.toolValues = { observation: "Observed:\nArrived 30 minutes late." };
    state.toolChecked = { warning_type: ["verbal"] };
    const answer = await say(
      "Create a CA for Jordan Testperson at lincoln o street. She was 30 minutes late today, verbal warning. No payroll deduct.",
    );
    const [card] = cards(answer);
    expect(card!.templateKey).toBe("dpoa");
    const id = await create(answer, card!);
    expect((await valueOf(id, "action_plan"))?.value).toMatch(/^Management will review .+ with Jordan\./);
    await act(id, { action: "finalize", followUpDate: null, acknowledgeUnverifiedPolicy: true });
    return id;
  }

  it("a corrected payroll answer lands on a new draft, and the Action Plan follows it there", async () => {
    const original = await finalizedCa();
    const before = (await review(original)).values;
    const reply = await say("change payroll deduct to yes");
    const draft = reply.formInstanceRef!.instanceId;
    expect((await review(draft)).instance.revisesInstanceId).toBe(original);
    expect((await valueOf(draft, "payroll_deduct"))?.checked).toEqual(["yes"]);
    expect((await valueOf(draft, "action_plan"))?.value).toContain("A payroll deduction applies.");
    expect(reply.content).toContain("The Action Plan now states the payroll deduction.");
    expect((await review(original)).values).toEqual(before);
  });

  it("a policy named from the manual lands on a new draft, quoted, with the plan naming it", async () => {
    const original = await finalizedCa();
    const before = (await review(original)).values;
    const reply = await say("add the Standards of Conduct policy");
    const draft = reply.formInstanceRef!.instanceId;
    expect(reply.content).toContain("was finalized, so I opened a new draft of it");
    expect((await valueOf(draft, "policy_language"))?.value).toContain("The Company expects Employees to follow rules of conduct");
    expect((await valueOf(draft, "action_plan"))?.value).toContain("Management will review the Standards of Conduct policy with Jordan.");
    expect((await review(original)).values).toEqual(before);
  });

  it("a policy change that changes nothing opens no draft", async () => {
    await finalizedCa();
    const reply = await say("remove the Background Checks policy");
    expect(reply.content).toContain("isn't cited");
    expect(reply.formInstanceRef).toBeUndefined();
    expect(store.form_instances).toHaveLength(1);
  });
});

/* ===================================================== WHO MAY ASK === */

describe("a form on file is found under the current Forms visibility", () => {
  it("is not found by a manager at another store, and nothing is opened", async () => {
    const original = await finalizedExit();
    state.subject = "manager-2";
    state.scope = { level: "location", primaryAreaId: "loc-0313", alsoCoversAreaIds: [] };
    thread = [];
    const reply = await say("change exit for jordan smith");
    expect(reply.formInstanceRef).toBeUndefined();
    expect(reply.content).toContain("couldn't find a **Resignation/Exit Form** for **jordan smith** on file that you can open");
    expect(store.form_instances).toHaveLength(1);
    expect(statusOf(original)).toBe("finalized");
  });

  it("is found by a manager Woven assigns to the store", async () => {
    const original = await finalizedExit();
    state.subject = "manager-2";
    state.scope = { level: "location", primaryAreaId: "loc-0313", alsoCoversAreaIds: [] };
    store.employee_access_preview = [
      { app_user_id: "manager-2", employee_id: "emp-2", mapped_primary_location_id: "loc-0313" },
    ];
    store.employee_location_affiliations = [
      { employee_id: "emp-2", woven_location_id: "woven-0311", active: true, expires_on: null },
    ];
    store.woven_location_map = [{ woven_location_id: "woven-0311", location_id: "loc-0311", status: "mapped" }];
    thread = [];
    const reply = await say("change exit for jordan smith");
    expect((await review(reply.formInstanceRef!.instanceId)).instance.revisesInstanceId).toBe(original);
  });

  it("is found by its creator at a store outside their home store while their scope covers it", async () => {
    // A district manager: stored scope covers every store, reads narrowed to none but their own.
    state.role = "district_manager";
    state.scope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
    const original = await finalizedExit();
    thread = [];
    const reply = await say("change exit for jordan smith");
    expect((await review(reply.formInstanceRef!.instanceId)).instance.revisesInstanceId).toBe(original);

    // Somebody else in the same role does not find it.
    state.subject = "manager-3";
    thread = [];
    expect((await say("change exit for jordan smith")).formInstanceRef).toBeUndefined();
  });
});
