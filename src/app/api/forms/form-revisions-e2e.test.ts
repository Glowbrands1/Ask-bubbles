import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import { joinedOnRead } from "@/test/overview-join";
import type { ChatFormProposal, ChatMessage } from "@/types";

vi.mock("@/config/company/locations", async () =>
  (await import("@/test/fixtures/reference-roster")).referenceRosterModule(),
);

/**
 * ============================================================================
 * EDITING A FINALIZED FORM, WITH A REASON AND A HISTORY (FORM_REVISIONS_ENABLED)
 * ============================================================================
 *
 * Port from Ask Sunny: three pieces of its production feedback, replayed
 * through this app's real routes and its live chat path (POST /api/chat, with
 * FORM_FULL_REMAP_ENABLED on as in production, and off). The people are
 * invented; the managers' words are theirs, with the company's name taken out.
 *
 *   "Document would not let us edit the document once it was finalized."
 *   "works reallly good wish we could edit after this step but i like it!"
 *   "It will not let me write an additional document for an employee who was
 *    given a previous document. It is telling me to start a new chat and when
 *    I do that it will still not recreate."
 *
 * The harness is `finalized-form-revision-e2e.test.ts`'s, on the reference
 * store roster.
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
const historyRoute = await import("./instances/[id]/history/route");
const pdfRoute = await import("./instances/[id]/pdf/route");
const { REVISION_REASON_REQUIRED } = await import("@/lib/forms/revision-history");
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
const fieldOf = async (id: string, key: string) => (await review(id)).values.find((row) => row.fieldKey === key) ?? null;
const ref = (id: string) => id.slice(0, 8);
const createdEvent = (id: string) =>
  store.form_instance_events.find((event) => event.instance_id === id && event.kind === "created")!.detail as Record<string, unknown>;

async function post(id: string, body: Record<string, unknown>) {
  const response = await instanceRoute.POST(
    new Request(`https://app.test/api/forms/instances/${id}`, { method: "POST", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );
  return { status: response.status, body: (await response.json()) as { error?: string; code?: string } };
}

const finalize = (id: string) => act(id, { action: "finalize", acknowledgeUnverifiedPolicy: true });

async function save(id: string, values: Record<string, string>) {
  const response = await instanceRoute.PATCH(
    new Request(`https://app.test/api/forms/instances/${id}`, { method: "PATCH", body: JSON.stringify({ values, checked: {} }) }),
    { params: Promise.resolve({ id }) },
  );
  expect(response.status).toBe(200);
}

interface HistoryBody {
  history: { entries: { id: string; revisionNumber: number; reason: string | null; status: string }[] };
  marks: { kind: string }[];
  label: string | null;
}

async function history(id: string) {
  const response = await historyRoute.GET(new Request(`https://app.test/api/forms/instances/${id}/history`), {
    params: Promise.resolve({ id }),
  });
  return { status: response.status, body: (await response.json()) as HistoryBody };
}

/** Every string drawn on the PDF, as printed. */
async function printed(id: string): Promise<string> {
  const response = await pdfRoute.GET(new Request(`https://app.test/api/forms/instances/${id}/pdf`), {
    params: Promise.resolve({ id }),
  });
  expect(response.status).toBe(200);
  const source = Buffer.from(await response.arrayBuffer()).toString("latin1");
  return [...source.matchAll(/Tm \((.*?)\) Tj ET/g)].map((match) => match[1]!.replace(/\\([\\()])/g, "$1")).join("\n");
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
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T19:23:00Z"));
  process.env.FORM_REVISIONS_ENABLED = "true";
  await ensureTemplateLibrary("system");
});

afterEach(() => {
  delete process.env.FORM_REVISIONS_ENABLED;
  delete process.env.FORM_FULL_REMAP_ENABLED;
});

describe.each([
  ["form-full-remap on, as in production", "true"],
  ["form-full-remap off", undefined],
] as const)("with %s", (_label, remap) => {
  beforeEach(() => {
    if (remap) process.env.FORM_FULL_REMAP_ENABLED = remap;
  });

  describe('"Document would not let us edit the document once it was finalized." (Corrective Action)', () => {
    it("edits the finalized form as Revision 1, with the reason on its history and the marks on both PDFs", async () => {
      const original = await fromChat("create ca for Marisol Quenby at lincoln o street", "dpoa");
      await finalize(original);
      const frozen = (await review(original)).values;

      const reason = "Wrong offense date was entered; the incident was on 10/18.";
      const revision = (await act(original, { action: "revise", reason })).id;
      expect(statusOf(revision)).toBe("draft");
      expect(createdEvent(revision)).toMatchObject({ revisionOf: original, kind: "revised", reason, revisionNumber: 1 });
      expect(await printed(revision)).toContain(`Revision 1 of ${ref(original)}, draft (supersedes ${ref(original)} once finalized)`);

      await save(revision, { observation: "Arrived 40 minutes late on 10/18 without calling ahead." });
      vi.setSystemTime(new Date("2026-10-21T15:00:00Z"));
      await finalize(revision);
      expect(statusOf(original)).toBe("revised");
      expect((await review(original)).values).toEqual(frozen);

      expect(await printed(revision)).toMatch(new RegExp(`Revised \\S+ \\(supersedes ${ref(original)}\\)`));
      expect(await printed(original)).toMatch(new RegExp(`Superseded \\S+ by ${ref(revision)}`));

      const { status, body } = await history(revision);
      expect(status).toBe(200);
      expect(body.label).toBe(`Revision 1 of ${ref(original)}`);
      expect(body.history.entries.map((entry) => [entry.id, entry.revisionNumber, entry.reason])).toEqual([
        [original, 0, null],
        [revision, 1, reason],
      ]);

      const second = (await act(revision, { action: "revise", reason: "Manager signature line was printed for the wrong manager." })).id;
      expect(createdEvent(second)).toMatchObject({ revisionOf: revision, revisionNumber: 2 });
    });

    it("refuses an edit with no reason, and opens nothing", async () => {
      const original = await fromChat("create ca for Marisol Quenby at lincoln o street", "dpoa");
      await finalize(original);
      const before = store.form_instances.length;
      for (const body of [{ action: "revise" }, { action: "revise", reason: "   " }, { action: "revise", reason: " . " }]) {
        const refused = await post(original, body);
        expect(refused.status).toBe(400);
        expect(refused.body.code).toBe(REVISION_REASON_REQUIRED);
        expect(refused.body.error).toContain("needs a reason");
        expect(refused.body.error).toContain("signed again");
      }
      expect(store.form_instances).toHaveLength(before);
      expect(statusOf(original)).toBe("finalized");
    });
  });

  describe('"works reallly good wish we could edit after this step but i like it!" (Exit Form)', () => {
    const words =
      "can you make me an exit form for tamsin ardwell at lincoln o street she is quiting due to starting hair school and with hair school hours she wont be able to fit work into her schedule";

    it("a chat edit asks for the reason first; with the draft open, the same request lands on it", async () => {
      const original = await fromChat(words, "resignation-exit");
      await finalize(original);

      thread = [];
      const refused = await say("duplicate exit for tamsin ardwell and change date notice given to 10-12-26");
      expect(refused.content).toContain("needs a reason");
      expect(refused.content).toContain("Edit as new draft");
      expect(refused.content).toContain("signed again");
      expect(refused.formInstanceRef?.instanceId).toBe(original);
      expect(store.form_instances).toHaveLength(1);

      const draft = (await act(original, { action: "revise", reason: "She gave notice on 10/12, not 10/13." })).id;
      thread = [];
      const applied = await say("duplicate exit for tamsin ardwell and change date notice given to 10-12-26");
      expect(applied.formInstanceRef?.instanceId).toBe(draft);
      expect((await fieldOf(draft, "notice_given_date"))?.value).toBe("2026-10-12");
      expect(store.form_instances).toHaveLength(2);

      await finalize(draft);
      expect((await history(draft)).body.history.entries.map((entry) => entry.status)).toEqual(["revised", "finalized"]);
      expect(await printed(original)).toMatch(new RegExp(`Superseded \\S+ by ${ref(draft)}`));
    });
  });

  describe('"It will not let me write an additional document for an employee who was given a previous document." (Corrective Action)', () => {
    it("the manager can open, edit and read the earlier document's new version at a store they cover", async () => {
      const previous = await fromChat("create a corrective action form for Juniper Halloway at lincoln o street", "dpoa");
      expect(store.form_instances.find((row) => row.id === previous)?.location_id).toBe("loc-0311");
      await finalize(previous);

      const revision = (await act(previous, { action: "revise", reason: "Second offense: adding the 10/20 no-call no-show." })).id;
      await review(revision);
      const { status, body } = await history(revision);
      expect(status).toBe(200);
      expect(body.history.entries.map((entry) => entry.id)).toEqual([previous, revision]);

      thread = [];
      const additional = await fromChat("create a corrective action form for Juniper Halloway at lincoln o street", "dpoa");
      expect(additional).not.toBe(previous);
      await review(additional);
    });
  });
});

describe("with the flag off", () => {
  it("revises without a reason, records no reason or number, and has no history route", async () => {
    delete process.env.FORM_REVISIONS_ENABLED;
    const original = await fromChat("create ca for Marisol Quenby at lincoln o street", "dpoa");
    await finalize(original);
    const revision = (await act(original, { action: "revise", reason: "ignored with the flag off" })).id;
    expect(createdEvent(revision)).toEqual({ revisionOf: original, kind: "revised" });
    expect((await history(revision)).status).toBe(404);
    await finalize(revision);
    expect(await printed(original)).not.toContain("Superseded");
  });
});
