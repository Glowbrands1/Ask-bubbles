import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { ChatFormProposal, ChatMessage } from "@/types";

vi.mock("@/config/company/locations", async () =>
  (await import("@/test/fixtures/reference-roster")).referenceRosterModule(),
);

/**
 * ============================================================================
 * THE OWNER'S SIGNED-IN QA, 8 OCT 2026 — THROUGH THE WHOLE APPLICATION
 * ============================================================================
 *
 * Two release-blocking cases, reproduced the way the browser drives them and
 * asserted where they went wrong — on the stored record, not on a parser:
 *
 *   CASE 1  "jordan testperson needs a written warning for cash handling"
 *           Production filed a Corrective Action for an employee called
 *           "cash handling", with no Type of Warning ticked and the manual's
 *           cover page and Background Checks page as the policy.
 *
 *   CASE 2  "coaching form for Avery Testperson and a CA for Jordan Testperson"
 *           Production showed one Coaching card asking "Avery or Jordan?" and
 *           the Corrective Action was never mentioned again.
 *
 * Each turn goes through POST /api/chat (the real route and `answerQuestion`);
 * each card goes through `createInlineForm` — the Create button's own
 * orchestrator — into POST /api/forms/instances and POST .../draft; the stored
 * rows are read back from the database the forms suite uses in memory.
 *
 * Real: the chat route, the proposal, the form library, the create and draft
 * routes, the currency check, the draft notes, the policy derivation. Doubled:
 * identity, the model, the knowledge base and the database. All people are
 * synthetic. The manual text below is the Production manual's Standards of
 * Conduct, as the existing policy tests quote it.
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

const SOC_OPENING =
  "The Company expects Employees to follow rules of conduct that will protect the interests and\n" +
  "safety of all customers, Employees, and The Company.\n" +
  "The following are examples (non-inclusive list) of infractions that may result in disciplinary\n" +
  "action:\n" +
  "o Failing to follow the policies and procedures of The Company";

function manual(withShortages: boolean) {
  return {
    ok: true,
    documentId: "doc-woven-manual",
    documentTitle: "2025 JBA Policy Manual - Edited 5-2025",
    matchedBy: "fallback",
    chunks: [
      {
        chunkIndex: 0,
        page: 1,
        printedPage: null,
        sections: [],
        section: null,
        content: "2025 JB & Associates Employment Policy Manual. This manual is designed to acquaint employees.",
      },
      {
        chunkIndex: 36,
        page: 13,
        printedPage: 12,
        sections: [{ heading: "Standards of Conduct", page: 12 }],
        section: "Standards of Conduct",
        content: `Standards of Conduct\n${SOC_OPENING}`,
      },
      {
        chunkIndex: 37,
        page: 13,
        printedPage: 12,
        sections: [],
        section: "Standards of Conduct",
        content:
          "o Lack of sales performance\no Giving unauthorized discounts\n" +
          (withShortages ? "o Register / Bank shortages\n" : "") +
          "o Insubordination -the refusal to follow the directions of the manager.",
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
}

const state = vi.hoisted(() => ({
  manual: null as unknown,
  /** What the model answers on every draft: deliberately the WRONG level and no offense. */
  toolValues: {} as Record<string, string>,
  toolChecked: { warning_type: ["verbal"] } as Record<string, string[]>,
  modelPrompts: [] as string[],
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
      if (!hasPermission(DEFAULT_PERMISSION_MATRIX, "admin" as never, permission as never)) {
        throw new AuthError("forbidden", "Your role does not have permission to do that.");
      }
      return {
        identity: {
          subject: "qa-admin",
          email: "qa@example.test",
          displayName: "QA Admin",
          role: "admin",
          scope: { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] },
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
      create: async (input: unknown) => {
        state.modelPrompts.push(JSON.stringify(input));
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
    /*
     * THE PRODUCTION FAILURE'S RAW MATERIAL: the nearest passages a search for
     * "cash handling" found were the cover page and Background Checks. They are
     * returned here on purpose — nothing may cite them.
     */
    async search() {
      return [
        { chunkId: "c0", documentId: "doc-woven-manual", documentTitle: "2025 JBA Policy Manual - Edited 5-2025", locator: "Page 1", content: "2025 JB & Associates Employment Policy Manual.", score: 0.91, category: "policies_compliance" },
        { chunkId: "c69", documentId: "doc-woven-manual", documentTitle: "2025 JBA Policy Manual - Edited 5-2025", locator: "Page 21 — Background Checks", content: "Employees are subject to background checks.", score: 0.9, category: "policies_compliance" },
      ];
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
const continuation = await import("@/lib/forms/proposal-continuation");
const chatRoute = await import("@/app/api/chat/route");
const instancesRoute = await import("./instances/route");
const instanceRoute = await import("./instances/[id]/route");
const draftRoute = await import("./instances/[id]/draft/route");

/** The view's join, which the fake does not model — see `exit-form-e2e.test.ts`. */
function joinOverview() {
  for (const row of store.form_instances ?? []) {
    const template = store.form_templates!.find((entry) => entry.id === row.template_id);
    const version = store.form_template_versions.find((entry) => entry.id === row.template_version_id);
    Object.assign(row, {
      template_key: template?.key,
      template_name: template?.name,
      layout_family: template?.layout_family,
      template_version: version?.version,
    });
  }
}

const drafts: { id: string; notes: string; response: Record<string, unknown> }[] = [];

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
  joinOverview();
  const body = (await response.json()) as T & { error?: string };
  if (draft) {
    drafts.push({ id: draft[1]!, notes: String(JSON.parse(String(init?.body ?? "{}")).notes ?? ""), response: body as Record<string, unknown> });
  }
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
    values: { fieldKey: string; value: string | null; checked: string[] }[];
  };
}

/* ------------------------------------------------- the browser, in short -- */

let sequence = 0;
let thread: ChatMessage[] = [];

/** One manager turn, sent exactly as `chat-screen.tsx` sends it. */
async function say(question: string): Promise<ChatMessage> {
  const history = [...thread];
  const user: ChatMessage = { id: `msg_${(sequence += 1)}`, role: "user", content: question, createdAt: "2026-10-08T23:30:00Z" };
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
  };
  expect(response.status, JSON.stringify(payload)).toBe(200);
  const assistant: ChatMessage = {
    id: `msg_${(sequence += 1)}`,
    role: "assistant",
    content: payload.content,
    createdAt: "2026-10-08T23:30:01Z",
    ...(payload.formProposal ? { formProposal: payload.formProposal } : {}),
    ...(payload.formProposals && payload.formProposals.length > 1 ? { formProposals: payload.formProposals } : {}),
  };
  thread.push(assistant);
  return assistant;
}

/** The card's Create button: `createInlineForm`, then the reference recorded as the store does. */
async function create(message: ChatMessage, proposal: ChatFormProposal) {
  expect(continuation.isProposalSuperseded(thread, proposal.proposalId)).toBe(false);
  let instanceId = "";
  const result = await createInlineForm({
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
  return { instanceId, result };
}

const cards = (message: ChatMessage) => continuation.proposalsOf(message);
const value = (form: Awaited<ReturnType<typeof review>>, key: string) =>
  form.values.find((row) => row.fieldKey === key);

beforeEach(async () => {
  for (const key of Object.keys(store) as (keyof FakeStore)[]) store[key] = [];
  drafts.length = 0;
  thread = [];
  state.manual = manual(true);
  state.toolValues = { observation: "Observed:\nCash handling concern." };
  state.toolChecked = { warning_type: ["verbal"] };
  state.modelPrompts = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-08T23:30:00Z"));
  await ensureTemplateLibrary("system");
});

/* ============================================================== CASE 1 === */

describe("case 1 — 'jordan testperson needs a written warning for cash handling'", () => {
  const PROMPT = "jordan testperson needs a written warning for cash handling";

  it("proposes a Corrective Action for Jordan Testperson, a written warning, for cash handling — and creates nothing", async () => {
    const answer = await say(PROMPT);
    const [card, ...rest] = cards(answer);
    expect(rest).toHaveLength(0);
    expect(card!.templateKey).toBe("dpoa");
    expect(card!.employeeName!.toLowerCase()).toBe("jordan testperson");
    expect(card!.employeeName!.toLowerCase()).not.toContain("cash");
    expect(card!.warningLevel).toBe("written");
    expect(card!.issue).toBe("cash handling");
    expect(answer.content).toContain("**Issue:** cash handling");
    expect(answer.content).toContain("**Type of warning:** Written Warning, as you said");
    // A proposal is not a record: nothing exists until Create is pressed.
    expect(store.form_instances).toHaveLength(0);
    expect(store.form_instance_values).toHaveLength(0);
  });

  it("the created record: the right employee, Written Warning ticked over the model's 'verbal', and the manual's own cash line", async () => {
    const answer = await say(PROMPT);
    const { instanceId } = await create(answer, cards(answer)[0]!);

    expect(store.form_instances).toHaveLength(1);
    const form = await review(instanceId);
    expect(String(form.instance.employeeName).toLowerCase()).toBe("jordan testperson");
    expect(value(form, "warning_type")?.checked).toEqual(["written"]);
    expect(value(form, "offense_type")?.checked).toEqual(["standards_of_conduct"]);
    expect(value(form, "policy_violated")?.value).toBe("Standards of Conduct");
    const policy = value(form, "policy_language")?.value ?? "";
    expect(policy).toContain("Source: JBA Policy Manual — Standards of Conduct, p. 12");
    expect(policy).not.toMatch(/p\. 1\b|Background Checks|Employment Policy Manual\./);
    expect(drafts[0]!.response.caPolicy).toMatchObject({ applied: true, anchor: "o Register / Bank shortages" });
  });

  it("a manual with no cash line cites NOTHING — never the cover page or Background Checks", async () => {
    state.manual = manual(false);
    const answer = await say(PROMPT);
    const { instanceId } = await create(answer, cards(answer)[0]!);
    const form = await review(instanceId);

    expect(value(form, "policy_language")?.value ?? null).toBeNull();
    expect(value(form, "offense_type")?.checked ?? []).not.toContain("standards_of_conduct");
    expect(drafts[0]!.response.withheld).toContain("policy_language");
    // The level the manager stated is still theirs.
    expect(value(form, "warning_type")?.checked).toEqual(["written"]);
  });

  it("after the production conversation, the draft is written from that turn ONLY", async () => {
    await say("What does the JBA policy manual say about shirts for Buff City Soap employees?");
    await say("What employee discount do I get?");
    await say("coaching form for Avery Testperson and a CA for Jordan Testperson");
    await say("coaching form for Avery Testperson. what does the JBA manual say about attendance?");
    const answer = await say(PROMPT);
    const card = cards(answer)[0]!;
    expect(card.employeeName!.toLowerCase()).toBe("jordan testperson");
    expect(card.sourceMessageIds).toEqual([thread[thread.length - 2]!.id]);

    await create(answer, card);
    expect(drafts[0]!.notes).toBe(PROMPT);
    const prompt = state.modelPrompts.join("\n");
    expect(prompt).not.toContain("shirts");
    expect(prompt).not.toContain("Avery");
    expect(prompt).not.toContain("discount");
  });
});

/* ============================================================== CASE 2 === */

describe("case 2 — 'coaching form for Avery Testperson and a CA for Jordan Testperson'", () => {
  const PROMPT = "coaching form for Avery Testperson and a CA for Jordan Testperson";

  it("two independent cards, each ready, and no question about who either is for", async () => {
    const answer = await say(PROMPT);
    const [coaching, ca, ...rest] = cards(answer);
    expect(rest).toHaveLength(0);
    expect([coaching!.templateKey, coaching!.employeeName]).toEqual(["coaching", "Avery Testperson"]);
    expect([ca!.templateKey, ca!.employeeName]).toEqual(["dpoa", "Jordan Testperson"]);
    expect(coaching!.proposalId).not.toBe(ca!.proposalId);
    expect(coaching!.status).toBe("ready");
    expect(ca!.status).toBe("ready");
    expect(answer.content).not.toMatch(/Which of them/i);
    // Neither card supersedes its sibling.
    expect(continuation.isProposalSuperseded(thread, coaching!.proposalId)).toBe(false);
    expect(continuation.isProposalSuperseded(thread, ca!.proposalId)).toBe(false);
    expect(store.form_instances).toHaveLength(0);
  });

  it("both cards create their own record, for their own person, drafted only from their own words", async () => {
    const answer = await say(PROMPT);
    const [coaching, ca] = cards(answer);
    const first = await create(answer, coaching!);
    const second = await create(thread.find((entry) => entry.id === answer.id)!, ca!);

    expect(store.form_instances).toHaveLength(2);
    expect(first.instanceId).not.toBe(second.instanceId);
    const avery = await review(first.instanceId);
    const jordan = await review(second.instanceId);
    expect([avery.instance.templateKey, avery.instance.employeeName]).toEqual(["coaching", "Avery Testperson"]);
    expect([jordan.instance.templateKey, jordan.instance.employeeName]).toEqual(["dpoa", "Jordan Testperson"]);

    const notes = Object.fromEntries(drafts.map((entry) => [entry.id, entry.notes]));
    expect(notes[first.instanceId]).toBe("coaching form for Avery Testperson");
    expect(notes[second.instanceId]).toBe("a CA for Jordan Testperson");

    // Each card keeps its own pointer; creating one never marks the other created.
    const stored = thread.find((entry) => entry.id === answer.id)!;
    expect(continuation.instanceRefFor(stored, coaching!.proposalId)?.instanceId).toBe(first.instanceId);
    expect(continuation.instanceRefFor(stored, ca!.proposalId)?.instanceId).toBe(second.instanceId);
    expect(stored.formInstanceRef).toBeUndefined();
  });

  it("creating the same card twice reuses its record; its sibling is still its own", async () => {
    const answer = await say(PROMPT);
    const [coaching, ca] = cards(answer);
    const first = await create(answer, coaching!);
    const again = await createInlineForm({ proposal: coaching!, messages: thread, call, onCreated: () => {} });
    expect(again.reused).toBe(true);
    await create(thread.find((entry) => entry.id === answer.id)!, ca!);
    expect(store.form_instances).toHaveLength(2);
    expect(store.form_instances!.map((row) => row.id)).toContain(first.instanceId);
  });

  it("a correction that names neither form is answered with 'which one?' and changes nothing", async () => {
    const answer = await say(PROMPT);
    const [coaching, ca] = cards(answer);
    const avery = await create(answer, coaching!);
    const jordan = await create(thread.find((entry) => entry.id === answer.id)!, ca!);
    const before = JSON.stringify(store.form_instance_values);

    const reply = await say("change the date to 10/01/2026");
    expect(reply.content).toContain("Which one should I change?");
    expect(reply.content).toContain("Avery Testperson");
    expect(reply.content).toContain("Jordan Testperson");
    expect(JSON.stringify(store.form_instance_values)).toBe(before);
    expect(value(await review(avery.instanceId), "form_date")?.value).toBe(value(await review(jordan.instanceId), "form_date")?.value);
  });

  it("a correction that names one person changes only that person's form", async () => {
    const answer = await say(PROMPT);
    const [coaching, ca] = cards(answer);
    const avery = await create(answer, coaching!);
    const jordan = await create(thread.find((entry) => entry.id === answer.id)!, ca!);
    const jordanBefore = await review(jordan.instanceId);

    const reply = await say("change Avery's date to 10/01/2026");
    expect(reply.content).toContain("Updated the **Coaching Form** for **Avery Testperson**");
    expect(value(await review(avery.instanceId), "form_date")?.value).toBe("2026-10-01");
    expect(value(await review(jordan.instanceId), "form_date")?.value).toBe(value(jordanBefore, "form_date")?.value);
  });
});

/* ===================================================== RELATED PATTERNS === */

describe("related multi-intent patterns, through the chat route", () => {
  const summary = (message: ChatMessage) =>
    cards(message).map((card) => [card.templateKey, card.employeeName?.toLowerCase() ?? null]);

  it.each([
    ["two forms, same employee", "a coaching form and a CA for Jordan Testperson", [["coaching", "jordan testperson"], ["dpoa", "jordan testperson"]]],
    ["one form each for two people", "coaching forms for Avery Testperson and Jordan Testperson", [["coaching", "avery testperson"], ["coaching", "jordan testperson"]]],
    ["separate sentences", "Coaching form for Avery Testperson. Also a CA for Jordan Testperson.", [["coaching", "avery testperson"], ["dpoa", "jordan testperson"]]],
    ["a comma", "coaching form for Avery Testperson, CA for Jordan Testperson", [["coaching", "avery testperson"], ["dpoa", "jordan testperson"]]],
    ["a correction in the same message is ONE form", "coaching form for Avery Testperson, actually make it a CA", [["dpoa", "avery testperson"]]],
    ["a single form is unchanged", "coaching form for Avery Testperson", [["coaching", "avery testperson"]]],
  ])("%s: '%s'", async (_label, prompt, expected) => {
    expect(summary(await say(prompt))).toEqual(expected);
  });

  it("one form for two people is still asked about, never split or guessed (QA F18)", async () => {
    const answer = await say("coaching form for Avery Testperson and Jordan Testperson");
    expect(summary(answer)).toEqual([["coaching", null]]);
    expect(answer.content).toContain("Which of them");
  });

  it("a declined form is named back and not proposed", async () => {
    const answer = await say("coaching form for Avery Testperson but no CA for Jordan Testperson");
    expect(summary(answer)).toEqual([["coaching", "avery testperson"]]);
    expect(answer.content).toContain("I haven't started a **Corrective Action Form** for **Jordan Testperson**, as you said.");
  });

  it("a conditional form is named back and not proposed", async () => {
    const answer = await say("coaching form for Avery Testperson and if Jordan Testperson is late again a CA for him");
    expect(summary(answer)).toEqual([["coaching", "avery testperson"]]);
    expect(answer.content).toContain("depends on something that hasn't happened yet");
    const only = await say("if jordan testperson is late again I'll need a CA");
    expect(summary(only)).toEqual([]);
    expect(only.content).toContain("depends on something that hasn't happened yet");
  });

  it("each form keeps its own date, issue and warning level", async () => {
    const answer = await say(
      "coaching form for avery testperson about attendance dated 10/1/2026 and a written warning for jordan testperson for cash handling",
    );
    const [coaching, ca] = cards(answer);
    expect([coaching!.templateKey, coaching!.formDate, coaching!.warningLevel ?? null]).toEqual(["coaching", "2026-10-01", null]);
    expect([ca!.templateKey, ca!.formDate, ca!.warningLevel, ca!.issue]).toEqual(["dpoa", null, "written", "cash handling"]);
  });

  it("two forms with nobody named: asked who each is for, and no card yet", async () => {
    const answer = await say("I need a coaching form and a CA");
    expect(cards(answer)).toEqual([]);
  });
});
