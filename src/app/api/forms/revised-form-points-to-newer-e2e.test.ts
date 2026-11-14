import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import { joinedOnRead } from "@/test/overview-join";
import type { ChatFormProposal, ChatMessage } from "@/types";

vi.mock("@/config/company/locations", async () =>
  (await import("@/test/fixtures/reference-roster")).referenceRosterModule(),
);

/**
 * ============================================================================
 * EDITING A FORM A NEWER VERSION ALREADY REPLACED (REVISED_FORM_POINTS_TO_NEWER_ENABLED)
 * ============================================================================
 *
 * A live runtime error in the sibling app (Ask Sunny, 14 Nov 2026, 01:36Z); Ask Bubbles has the same path:
 *   route /api/forms/instances/[id]
 *   "[ask-sunny] forms/instance/action: Error: That form has already been revised."
 * QA's questions: "Is this guard thrown as a 500, or returned as a clear 4xx with a message the manager sees? What does
 * the manager see in the UI when they press "Edit as new draft" … on a form that already has a revision?"
 *
 * The real path: a card loaded while its form was finalized; a revision of it was then opened and finalized elsewhere
 * (another tab, the chat, the Forms Register); "Edit as new draft" is pressed on the stale card. Off, the route answered a
 * 500 "Something went wrong. Nothing was answered or saved." On, it is a 409 with `form_already_revised`, a line that
 * points to the newer version and its id, and nothing is opened or changed. The card's side is in
 * `features/chat/inline-form.dom.test.tsx`. The harness is `form-revisions-e2e.test.ts`'s; people are invented.
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
const chatRoute = await import("@/app/api/chat/route");
const instancesRoute = await import("./instances/route");
const instanceRoute = await import("./instances/[id]/route");
const draftRoute = await import("./instances/[id]/draft/route");
const { FORM_ALREADY_REVISED, FORM_ALREADY_REVISED_MESSAGE } = await import("@/lib/forms/revision-history");
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

async function post(id: string, body: Record<string, unknown>) {
  const response = await instanceRoute.POST(
    new Request(`https://app.test/api/forms/instances/${id}`, { method: "POST", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );
  return { status: response.status, body: (await response.json()) as { error?: string; code?: string } };
}

const finalize = (id: string) => act(id, { action: "finalize", acknowledgeUnverifiedPolicy: true });

interface HistoryBody {
  history: { entries: { id: string; revisionNumber: number; reason: string | null; status: string }[] };
  marks: { kind: string }[];
  label: string | null;
}

/** A form created from the manager's own words in chat, by the card's Create button. */
async function fromChat(words: string, templateKey: string): Promise<string> {
  const answer = await say(words);
  const card = cards(answer).find((entry) => entry.templateKey === templateKey);
  expect(card, JSON.stringify(cards(answer).map((entry) => entry.templateKey))).toBeTruthy();
  return create(answer, card!);
}

beforeEach(async () => {
  for (const key of Object.keys(store)) store[key] = [];
  store.form_instances = joinedOnRead(store, "2026-10-20");
  thread = [];
  sequence = 0;
  state.role = "location_manager";
  state.subject = "manager-1";
  state.scope = { level: "location", primaryAreaId: "loc-0310", alsoCoversAreaIds: ["loc-0311"] };
  state.toolValues = {};
  state.toolChecked = {};
  state.modelCalls = 0;
  state.manual = null;
  // The flag-off cases are off whatever the environment says (Gate-Bubbles, B887); the flag-on cases set it themselves.
  delete process.env.REVISED_FORM_POINTS_TO_NEWER_ENABLED;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T19:23:00Z"));
  await ensureTemplateLibrary("system");
});

afterEach(() => {
  delete process.env.FORM_REVISIONS_ENABLED;
  delete process.env.REVISED_FORM_POINTS_TO_NEWER_ENABLED;
});

/** A finalized form whose card has loaded, then revised and the revision finalized elsewhere. */
async function replacedWhileTheCardWasOpen(revisions: boolean) {
  if (revisions) process.env.FORM_REVISIONS_ENABLED = "true";
  const original = await fromChat("create ca for Marisol Quenby at lincoln o street", "dpoa");
  await finalize(original);
  await review(original); // the card, loaded while finalized (review asserts the 200)
  const body = revisions ? { action: "revise", reason: "Wrong offense date was entered." } : { action: "revise" };
  const revision = (await act(original, body)).id; // elsewhere
  await finalize(revision);
  expect(statusOf(original)).toBe("revised");
  return { original, revision, body };
}

const counts = () => ({ forms: store.form_instances.length, events: store.form_instance_events.length });

describe("\"That form has already been revised.\" (live runtime error, 14 Nov 2026)", () => {
  for (const revisions of [false, true]) {
    const label = revisions ? "with FORM_REVISIONS on" : "with FORM_REVISIONS off";

    it(`flag off: the stale card's Edit is a 500 with the generic line, as before (${label})`, async () => {
      const { original, body } = await replacedWhileTheCardWasOpen(revisions);
      const before = counts();
      const refused = await post(original, body);
      expect(refused.status).toBe(500);
      expect(refused.body.code).toBe("internal");
      expect(refused.body.error).toBe("Something went wrong. Nothing was answered or saved.");
      expect(counts()).toEqual(before);
    });

    it(`flag on: a 409 with form_already_revised, a line pointing to the newer version, nothing opened (${label})`, async () => {
      const { original, revision, body } = await replacedWhileTheCardWasOpen(revisions);
      process.env.REVISED_FORM_POINTS_TO_NEWER_ENABLED = "true";
      const before = counts();
      const refused = await post(original, body);
      expect(refused.status).toBe(409);
      expect(refused.body.code).toBe(FORM_ALREADY_REVISED);
      expect(refused.body.error).toBe(FORM_ALREADY_REVISED_MESSAGE);
      expect((refused.body as { newerId?: string }).newerId).toBe(revision);
      expect(counts()).toEqual(before);
      expect(statusOf(original)).toBe("revised");
      expect(statusOf(revision)).toBe("finalized");
    });
  }

  it("flag on: the line points to the NEWEST version when the chain was revised twice since", async () => {
    const { original, revision } = await replacedWhileTheCardWasOpen(true);
    const second = (await act(revision, { action: "revise", reason: "Manager name was wrong." })).id;
    await finalize(second);
    process.env.REVISED_FORM_POINTS_TO_NEWER_ENABLED = "true";
    const refused = await post(original, { action: "revise", reason: "Wrong offense date was entered." });
    expect(refused.status).toBe(409);
    expect((refused.body as { newerId?: string }).newerId).toBe(second);
  });

  it("flag on: a finalized form with no revision is edited exactly as before", async () => {
    process.env.REVISED_FORM_POINTS_TO_NEWER_ENABLED = "true";
    const original = await fromChat("create ca for Marisol Quenby at lincoln o street", "dpoa");
    await finalize(original);
    const revision = (await act(original, { action: "revise" })).id;
    expect(revision).not.toBe(original);
    expect(statusOf(revision)).toBe("draft");
    // A second press while that revision is still a draft returns the same draft (one open revision at a time).
    expect((await act(original, { action: "revise" })).id).toBe(revision);
  });
});
