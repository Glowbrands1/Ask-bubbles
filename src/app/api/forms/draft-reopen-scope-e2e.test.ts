import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FakeStore } from "@/test/fake-supabase";
import { rosterResultFor } from "@/test/roster-result";
import type { AccessScope, ChatMessage } from "@/types";

/**
 * ============================================================================
 * AN OPEN DRAFT FROM ANOTHER CHAT IS REOPENED ONLY IF IT IS THE CALLER'S OWN
 * ============================================================================
 *
 * Ported from Ask Sunny. A district manager there, conv_mvh1m29j25aig2n
 * (20 Oct 2026):
 *
 *   "It will not let me write an additional document for an employee who was
 *    given a previous document. It is telling me to start a new chat and when
 *    I do that it will still not recreate."
 *
 * Sunny's create route reopened an open draft for the same form and employee
 * from any chat and any manager, at any location. Here the same mechanism is
 * CROSS_CHAT_DRAFT_DEDUPE_ENABLED (`findCrossChatOpenDraft`): an open draft
 * for the same employee, form and incident date, from any manager, at any
 * store. When that draft was at a store the caller cannot open, the card
 * pointed at a form the next read refused with a 404, and a new chat found
 * the same draft again.
 *
 * Replayed through the real proposal flow, `createInlineForm`, the real create
 * route and the real instance GET. Only identity, the model, the knowledge
 * provider, the employee directory read and the database are stand-ins. Every
 * person is synthetic.
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
  subject: "manager-1",
  role: "location_manager",
  scope: null as unknown,
  directory: [] as unknown[],
}));

vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabase: fake } = await import("@/test/fake-supabase");
  return { getSupabaseAdmin: () => fake(store) };
});

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
          subject: state.subject,
          email: `${state.subject}@example.com`,
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
      create: async () => ({
        stop_reason: "tool_use",
        content: [{ type: "tool_use", name: "write_form_fields", input: { values: {}, checked: {} } }],
      }),
    },
  }),
}));

vi.mock("@/lib/knowledge/providers/supabase", () => ({
  SupabaseKnowledgeProvider: class {
    async search() {
      return [];
    }
    async fetchRoleGrounding() {
      return { ok: false, reason: "not used" };
    }
    async fetchOfficialPolicyManual() {
      return { ok: false, reason: "The official policy manual is not in the knowledge base." };
    }
  },
}));

vi.mock("@/lib/knowledge", () => ({
  getKnowledgeProvider: () => {
    throw new Error("getKnowledgeProvider() is the browser knowledge client and must not be used on the server");
  },
}));

vi.mock("@/lib/forms/employee-roster", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/forms/employee-roster")>();
  return {
    ...actual,
    loadScopedRoster: async (scope: AccessScope | null) => actual.scopeRoster(state.directory as never, scope),
    loadScopedRosterResult: async (scope: AccessScope | null) =>
      rosterResultFor(actual.scopeRoster, state.directory as never, scope),
  };
});

process.env.NEXT_PUBLIC_DEMO_MODE = "false";

const { ensureTemplateLibrary, listTemplateSummaries } = await import("@/lib/forms/repository");
const { proposeFormForTurn } = await import("@/lib/ai/form-proposal");
const { createInlineForm } = await import("@/features/chat/create-inline-form");
const instancesRoute = await import("./instances/route");
const instanceRoute = await import("./instances/[id]/route");
const draftRoute = await import("./instances/[id]/draft/route");

/** The view's join, which the fake does not model — see `one-draft-per-conversation-e2e.test.ts`. */
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
  joinOverview();
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

/** The card's own read of the form it opened: the inline editor's GET. */
async function openCard(id: string): Promise<number> {
  joinOverview();
  const response = await instanceRoute.GET(new Request(`https://app.test/api/forms/instances/${id}`), {
    params: Promise.resolve({ id }),
  });
  return response.status;
}

let sequence = 0;

/** A new chat: the manager's turns, and Create pressed on the last one's card. */
async function newChat(turns: readonly string[]) {
  const messages: ChatMessage[] = [];
  let response: Awaited<ReturnType<typeof proposeFormForTurn>> = null;
  let open: string | undefined;
  for (const text of turns) {
    const message: ChatMessage = { id: `m${(sequence += 1)}`, role: "user", content: text, createdAt: "2026-10-20T18:55:00Z" };
    response = await proposeFormForTurn({
      history: messages,
      question: text,
      questionMessageId: message.id,
      actor: { role: state.role as never, scope: state.scope as AccessScope },
      summaries: await listTemplateSummaries(),
      today: "2026-10-20",
      policyManual: async () => null,
      ...(open ? { continueTemplateKey: open } : {}),
    });
    if (response?.formProposal) open = response.formProposal.templateKey;
    messages.push(message, {
      id: `a${sequence}`,
      role: "assistant",
      content: response?.content ?? "Noted.",
      createdAt: "2026-10-20T18:55:01Z",
      ...(response?.formProposal ? { formProposal: response.formProposal } : {}),
    } as ChatMessage);
  }
  const proposal = response?.formProposal;
  expect(proposal, "no card to press").toBeDefined();
  const result = await createInlineForm({ proposal: proposal!, messages, call, onCreated: () => {} });
  const id = result.reference.instanceId;
  return { id, reused: Boolean(result.reused), status: await openCard(id), proposal: proposal! };
}

const drafts = () => (store.form_instances ?? []).filter((row) => row.status === "draft");
const creatorOf = (id: string) => store.form_instances.find((row) => row.id === id)?.created_by;

/* The manager's request, synthetic name. The typed 10-15 date is the incident date the cross-chat match keys on. */
const REQUEST = "create a corrective action form for Tess Varga for missing the 10-15-26 woven deadline";

const AT_264: AccessScope = { level: "location", primaryAreaId: "loc-264", alsoCoversAreaIds: [] };
const AT_265: AccessScope = { level: "location", primaryAreaId: "loc-265", alsoCoversAreaIds: [] };
const GLOBAL: AccessScope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };

function as(subject: string, role: string, scope: AccessScope) {
  state.subject = subject;
  state.role = role;
  state.scope = scope;
}

beforeEach(async () => {
  for (const key of Object.keys(store) as (keyof FakeStore)[]) store[key] = [];
  // DRAFT_DEDUPE_ENABLED's incident fingerprints (`rememberDraftIncident` / `findResentDraft`).
  (store as unknown as Record<string, unknown[]>).chat_form_incidents = [];
  as("manager-1", "location_manager", AT_265);
  state.directory = [
    { id: "e-2", firstName: "Tess", lastName: "Varga", preferredFirstName: null, employmentStatus: "active", positionName: "Operator", locationIds: ["loc-264"] },
  ];
  sequence = 0;
  process.env.CROSS_CHAT_DRAFT_DEDUPE_ENABLED = "1";
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T18:55:00Z"));
  await ensureTemplateLibrary("system");
});

afterEach(() => {
  delete process.env.CROSS_CHAT_DRAFT_DEDUPE_ENABLED;
  vi.useRealTimers();
});

describe("reopening an open draft from another chat (CROSS_CHAT_DRAFT_DEDUPE_ENABLED on; Ask Sunny conv_mvh1m29j25aig2n)", () => {
  it('"It will not let me write an additional document for an employee who was given a previous document. It is telling me to start a new chat and when I do that it will still not recreate."', async () => {
    // The store's own manager already has an open draft for this employee.
    as("manager-2", "location_manager", AT_264);
    const theirs = await newChat([REQUEST]);
    expect(theirs.status).toBe(200);

    // The district manager: creates against any store, reads forms under no home store here.
    as("manager-1", "district_manager", GLOBAL);
    const first = await newChat([REQUEST]);
    // Before the fix: the card opened their draft, and its read was a 404.
    expect(first.status).toBe(200);
    expect(first.id).not.toBe(theirs.id);
    expect(first.reused).toBe(false);
    expect(creatorOf(first.id)).toBe("manager-1");

    // "start a new chat": the form opens again — the district manager's own draft.
    const again = await newChat([REQUEST]);
    expect(again.status).toBe(200);
    expect(again.id).not.toBe(theirs.id);
    expect(creatorOf(theirs.id)).toBe("manager-2");
  });

  it("another manager's matching open draft at a store the caller cannot see is not reopened; a new, visible draft is created", async () => {
    as("manager-2", "location_manager", AT_264);
    const theirs = await newChat([REQUEST]);

    state.directory = [
      { id: "e-2", firstName: "Tess", lastName: "Varga", preferredFirstName: null, employmentStatus: "active", positionName: "Operator", locationIds: ["loc-264", "loc-265"] },
    ];
    as("manager-1", "location_manager", AT_265);
    const mine = await newChat([REQUEST]);
    expect(mine.status).toBe(200);
    expect(mine.id).not.toBe(theirs.id);
    expect(mine.reused).toBe(false);
    expect(drafts()).toHaveLength(2);
  });

  it("the caller's own matching draft at a store they can see is still reopened", async () => {
    as("manager-1", "location_manager", AT_264);
    const first = await newChat([REQUEST]);
    const second = await newChat([REQUEST]);
    expect(second.id).toBe(first.id);
    expect(second.reused).toBe(true);
    expect(second.status).toBe(200);
    expect(drafts()).toHaveLength(1);
  });

  it("the caller's own draft at a store no longer in their scope is not reopened", async () => {
    as("manager-1", "location_manager", AT_264);
    const before = await newChat([REQUEST]);

    // Transferred: their scope is now another store, where the employee also works.
    state.directory = [
      { id: "e-2", firstName: "Tess", lastName: "Varga", preferredFirstName: null, employmentStatus: "active", positionName: "Operator", locationIds: ["loc-264", "loc-265"] },
    ];
    as("manager-1", "location_manager", AT_265);
    expect(await openCard(before.id)).toBe(404);
    const after = await newChat([REQUEST]);
    expect(after.status).toBe(200);
    expect(after.id).not.toBe(before.id);
    expect(after.reused).toBe(false);
  });
});

describe("a resent create (DRAFT_DEDUPE_ENABLED on, cross-chat off): the same rule", () => {
  beforeEach(() => {
    process.env.CROSS_CHAT_DRAFT_DEDUPE_ENABLED = "0";
    process.env.DRAFT_DEDUPE_ENABLED = "1";
  });
  afterEach(() => {
    delete process.env.DRAFT_DEDUPE_ENABLED;
  });

  /* The column default (`created_at default now()`) the fake's upsert does not apply. */
  const stampIncidents = () => {
    for (const row of (store as unknown as Record<string, Record<string, unknown>[]>).chat_form_incidents!) {
      row.created_at ??= new Date().toISOString();
    }
  };

  it("the caller's own resent draft at a store they can see is still reused", async () => {
    as("manager-1", "location_manager", AT_264);
    const first = await newChat([REQUEST]);
    stampIncidents();
    const second = await newChat([REQUEST]);
    expect(second.id).toBe(first.id);
    expect(second.reused).toBe(true);
    expect(second.status).toBe(200);
  });

  it("the caller's own resent draft at a store no longer in their scope is not reused", async () => {
    as("manager-1", "location_manager", AT_264);
    const before = await newChat([REQUEST]);
    stampIncidents();

    state.directory = [
      { id: "e-2", firstName: "Tess", lastName: "Varga", preferredFirstName: null, employmentStatus: "active", positionName: "Operator", locationIds: ["loc-264", "loc-265"] },
    ];
    as("manager-1", "location_manager", AT_265);
    const after = await newChat([REQUEST]);
    expect(after.status).toBe(200);
    expect(after.id).not.toBe(before.id);
    expect(after.reused).toBe(false);
  });
});
