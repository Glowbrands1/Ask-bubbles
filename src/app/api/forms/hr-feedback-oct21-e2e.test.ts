import { rosterResultFor } from "@/test/roster-result";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { AccessScope, ChatMessage } from "@/types";

/**
 * ============================================================================
 * HR FEEDBACK, 21 OCT 2026 — "BUBBLES DID NOT FILL OUT ANY SECTION OF THE CA"
 * ============================================================================
 *
 * The conversation, as HR typed it (the employee here is synthetic):
 *
 *   1. "create a written CA for <name> for not attending the monthly meeting on
 *       10-20-26. previous coaching: jba policy manual 1-1-26, verbal ca
 *       9-1-26. payroll deduct not applicable"
 *   2. "written"
 *
 * The second card was built from turn 2 alone: "create a … CA" was read as a
 * request for a DIFFERENT form than the Corrective Action Form, so the turn
 * that held the whole account was cut, and the draft was written from the one
 * word "written". The stored form had a name, a date, a title, a store and two
 * ticked boxes — nothing else. The same cut lost "verbal" on a second
 * conversation that day ("create verbal CA for …", then "no payroll deduct").
 *
 * Replayed through the real proposal flow, `createInlineForm` and the real
 * create / draft / review routes, exactly as the Oct 16 suite does.
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
  if (draft && typeof init?.body === "string") draftNotes.push((JSON.parse(init.body) as { notes: string }).notes);
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
  createdAt: "2026-10-21T18:08:00Z",
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
      ...(open ? { continueTemplateKey: open } : {}),
    });
    expect(response, `turn left the form intake: ${JSON.stringify(text)}`).not.toBeNull();
    responses.push(response!);
    if (response!.formProposal) open = response!.formProposal.templateKey;
    messages.push(message, {
      id: `a${sequence}`,
      role: "assistant",
      content: response!.content,
      createdAt: "2026-10-21T18:08:01Z",
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
  { id: "e-1", firstName: "Pat", lastName: "Rivera", preferredFirstName: null, employmentStatus: "active", locationIds: ["loc-264"], positionName: "Team Member Part Time" },
];

const draftNotes: string[] = [];

beforeEach(async () => {
  for (const key of Object.keys(store) as (keyof FakeStore)[]) store[key] = [];
  state.role = "admin";
  state.scope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
  state.draft = { values: {}, checked: {} };
  state.draftFails = false;
  state.directory = DIRECTORY;
  state.manual = null;
  sequence = 0;
  draftNotes.length = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-21T18:08:00Z"));
  await ensureTemplateLibrary("system");
});

const REQUEST =
  "create a written CA for pat rivera for not attending the monthly meeting on 10-20-26. previous coaching: jba policy manual 1-1-26, verbal ca 9-1-26. payroll deduct not applicable";

describe("a CA request answered with one word keeps the whole account", () => {
  it("drafts from the original request after the manager answers \"written\"", async () => {
    const { responses, proposal, create } = await conversation([REQUEST, "written"]);

    // Both turns are this form's: the request is not "another form".
    expect(proposal.sourceMessageIds).toEqual(["m1", "m2"]);
    expect(proposal).toMatchObject({
      templateKey: "dpoa",
      status: "ready",
      employeeName: "Pat Rivera",
      warningLevel: "written",
      payrollDeduct: "no",
      locationId: "loc-264",
    });
    // The prior steps she listed are hers, not something left for the form.
    expect(responses[1]!.content).not.toMatch(/You'll set any prior coaching/);
    // "written CA" already said the level, and 9/1 is her history, not an incident:
    // nothing on turn 1 needed asking again.
    expect(responses[0]!.formProposal!.warningLevel).toBe("written");
    expect(responses[0]!.content).not.toMatch(/Verbal Warning\*\* or a \*\*Written Warning/);
    expect(responses[0]!.content).not.toMatch(/Which date goes on the form/);
    expect(proposal.formDate).toBe("2026-10-20");

    state.draft = {
      values: { observation: "Observed:\nPat Rivera did not attend the monthly meeting on 10/20/2026." },
      checked: {},
    };
    const { reference } = await create();

    // What the draft is written from: the account, not the one-word answer.
    expect(draftNotes).toHaveLength(1);
    expect(draftNotes[0]).toContain("not attending the monthly meeting on 10-20-26");
    expect(draftNotes[0]).toContain("verbal ca 9-1-26");
    expect(draftNotes[0]).toContain("written");

    const form = await review(reference.instanceId);
    expect(form.instance.formDate).toBe("2026-10-20");
    // The model drafted no history here; both dated steps she gave are put on the line by code.
    expect(field(form, "prior_actions")!.value).toBe("Coaching — signed 01/01/2026\nVerbal warning — signed 09/01/2026");
    expect(field(form, "warning_type")!.checked).toEqual(["written"]);
    expect(field(form, "payroll_deduct")!.checked).toEqual(["no"]);
    expect(field(form, "observation")!.value).toContain("monthly meeting");
  });

  it("keeps a level stated in the request when the next turn answers something else", async () => {
    // The second conversation that day: "verbal" was lost when the reply was "no payroll deduct".
    const { proposal } = await conversation([
      "create verbal CA for pat rivera for violating visitors at work policy on 10-10-26. she spent 40 minutes talking with a friend and ignoring guests.",
      "no payroll deduct",
    ]);
    expect(proposal.sourceMessageIds).toEqual(["m1", "m2"]);
    expect(proposal.warningLevel).toBe("verbal");
    expect(proposal.payrollDeduct).toBe("no");
  });

  it("still leaves out a CA request for somebody else", async () => {
    const { proposal } = await conversation([
      "create a written CA for robin kessler for a missed shift on 10-19-26",
      "create a coaching form for pat rivera for not attending the monthly meeting on 10-20-26",
    ]);
    expect(proposal.templateKey).toBe("coaching");
    expect(proposal.sourceMessageIds).toEqual(["m2"]);
  });
});
