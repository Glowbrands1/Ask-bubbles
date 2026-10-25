import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { ChatFormProposal, ChatMessage } from "@/types";

vi.mock("@/config/company/locations", async () =>
  (await import("@/test/fixtures/reference-roster")).referenceRosterModule(),
);

/**
 * ============================================================================
 * A HIDDEN OR UNPUBLISHED FORM OPENS NO CARD — ASK BUBBLES' LIVE PATH, 25 OCT 2026
 * ============================================================================
 *
 * Production f04f97d, FORM_FULL_REMAP_ENABLED on. PR 128 hid the Tanning
 * Consultant Interview and both Management Interview Forms
 * (`config/company/forms/hidden.ts`). They left Form Templates, but chat still
 * made cards:
 *
 *   conv_mvnqbm6m28hg07j  "create a tanning consultant interview form for Test
 *                         Employee" -> "Here is the Coaching Form.", What
 *                         happened = "create a tanning consultant interview
 *                         form for".
 *   conv_mvnqblza266tbwt  "create a first round management interview form for
 *                         Test Employee" -> "Here is the Corrective Action Form."
 *
 * The full remap fills only the Corrective Action, Coaching, Follow-Up Coaching
 * and Policy Review forms, and its extraction can only choose among them, so a
 * request naming any other form landed on one of the four. A request naming a
 * form outside that set — a hidden or unpublished template, an interview form,
 * a library title the remap does not fill — now goes to the proposal flow,
 * which says the form is not published and opens no card. The model's guess
 * below is what it was in each production turn. Names are synthetic.
 */

const store = {
  form_instances: [],
  form_instance_values: [],
  form_instance_events: [],
  form_template_versions: [],
  form_templates: [],
  form_template_current: [],
  form_template_assets: [],
  chat_conversations: [],
  chat_messages: [],
  chat_traces: [],
  chat_form_state: [],
} as unknown as FakeStore & Record<string, Record<string, unknown>[]>;

const bag = vi.hoisted(() => ({
  /** The extraction model's guess of the form, as it was in each production turn. */
  guess: "dpoa" as string,
  /** Remap templates this test hides, on top of `config/company/forms/hidden.ts`. */
  alsoHidden: [] as string[],
}));

vi.mock("@/config/company/forms/hidden", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config/company/forms/hidden")>();
  return { ...actual, isHiddenTemplate: (key: string) => actual.isHiddenTemplate(key) || bag.alsoHidden.includes(key) };
});

vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin: () => fakeSupabase(store) }));
vi.mock("@/lib/api/respond", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/respond")>();
  return { ...actual, assertLiveMode: () => {}, assertNoConfigurationProblems: () => {}, assertWithinRateLimit: () => {} };
});
vi.mock("@/lib/config/server-env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config/server-env")>();
  return { ...actual, liveReadiness: () => ({ mode: "live", missing: [], problems: [], ready: true }) };
});
vi.mock("@/lib/auth/server", async () => {
  const { DEFAULT_PERMISSION_MATRIX, hasPermission } = await import("@/lib/permissions");
  const { AuthError } = await import("@/lib/auth/types");
  return {
    authorizeRequest: async (_request: Request, permission: string) => {
      if (!hasPermission(DEFAULT_PERMISSION_MATRIX, "location_manager" as never, permission as never)) {
        throw new AuthError("forbidden", "Your role does not have permission to do that.");
      }
      return {
        identity: {
          subject: "qa-manager",
          email: "qa-manager@example.test",
          displayName: "QA Manager",
          role: "location_manager",
          scope: { level: "location", primaryAreaId: "loc-0309", alsoCoversAreaIds: [] },
          verified: true,
        },
        permission,
        provider: "supabase",
      };
    },
  };
});
vi.mock("@/lib/analytics/record", () => ({
  openTurn: async () => "turn-qa",
  closeTurn: async () => {},
  recordActivity: async () => {},
  recordActivityAsync: () => {},
}));

vi.mock("@/lib/ai/call-claude", () => ({
  callClaude: async () => "A grounded answer.",
  callClaudeTool: async () => null,
  // The model's guess in each production turn: the Coaching Form, or the Corrective Action Form.
  callClaudeToolDetailed: async () => ({
    input: { templateKey: bag.guess, employeeName: null, observation: null, actionPlan: null },
    inputTokens: 1,
    outputTokens: 1,
  }),
}));
vi.mock("@/lib/ai/anthropic", () => ({
  getAnthropicClient: () => ({ messages: { create: async () => ({ content: [] }) } }),
}));
vi.mock("@/lib/knowledge/providers/supabase", () => ({
  SupabaseKnowledgeProvider: class {
    async search() {
      return [];
    }
    async match() {
      return [];
    }
    async fetchRoleGrounding() {
      return { ok: false, failure: { code: "missing", detail: "not used", missingGroups: [] } };
    }
    async fetchOfficialPolicyManual() {
      return { ok: false, reason: "not needed" };
    }
  },
}));
vi.mock("@/lib/knowledge", () => ({
  getKnowledgeProvider: () => {
    throw new Error("not on the server");
  },
}));
vi.mock("@/lib/reporting/read/report-briefing", () => ({ loadReportBriefing: async () => null }));
vi.mock("@/lib/reporting/read/employee-facts", () => ({
  loadEmployeeFacts: async () => null,
  NO_EMPLOYEE_DATA_REASON: "no dataset",
  NO_EMPLOYEE_DATASET_REASON: "no dataset",
  EMPLOYEE_DATA_HEADING: "CURRENT EMPLOYEE PERFORMANCE DATA",
}));

process.env.NEXT_PUBLIC_DEMO_MODE = "false";

const { ensureTemplateLibrary } = await import("@/lib/forms/repository");
const chatRoute = await import("./route");
const { remapShouldRun } = await import("@/lib/ai/form-full-remap");

/* Production's form path here: the full remap. */
const FLAGS = ["FORM_FULL_REMAP_ENABLED"] as const;
const saved = new Map<string, string | undefined>();

let sequence = 0;
function conversationId(): string {
  sequence += 1;
  return `conv_${Date.now().toString(36)}qa${String(sequence).padStart(3, "0")}`;
}

interface Turn {
  readonly user: string;
  /** This app's production reply with the same words, put into history in place of this harness's. */
  readonly recordedReply?: string;
}

/** Each turn through POST /api/chat, the browser's whole messages as history. */
async function replay(turns: readonly (Turn | string)[], id = conversationId()) {
  const messages: ChatMessage[] = [];
  const replies: { content: string; formProposal?: ChatFormProposal }[] = [];
  let proposal: ChatFormProposal | null = null;
  for (const [index, step] of turns.entries()) {
    const turn = typeof step === "string" ? { user: step } : step;
    const response = await chatRoute.POST(
      new Request("https://app.test/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: turn.user,
          mode: "standard",
          history: messages,
          questionMessageId: `msg_${Date.now().toString(36)}u${index}x`,
          conversationId: id,
          ...(proposal ? { continueProposalTemplateKey: proposal.templateKey } : {}),
        }),
      }),
    );
    const payload = (await response.json()) as { content: string; formProposal?: ChatFormProposal; error?: string };
    expect(response.status, JSON.stringify(payload)).toBe(200);
    replies.push(payload);
    if (payload.formProposal) proposal = payload.formProposal;
    messages.push(
      { id: `msg_${Date.now().toString(36)}u${index}x`, role: "user", content: turn.user, createdAt: "2026-10-24T20:00:00Z" } as ChatMessage,
      {
        id: `msg_${Date.now().toString(36)}a${index}x`,
        role: "assistant",
        content: turn.recordedReply ?? payload.content,
        createdAt: "2026-10-24T20:00:01Z",
        ...(payload.formProposal ? { formProposal: payload.formProposal } : {}),
      } as ChatMessage,
    );
  }
  return replies;
}

beforeEach(async () => {
  for (const key of Object.keys(store)) (store as Record<string, unknown[]>)[key] = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-25T16:00:00Z"));
  for (const name of FLAGS) {
    saved.set(name, process.env[name]);
    process.env[name] = "true";
  }
  bag.guess = "dpoa";
  bag.alsoHidden = [];
  await ensureTemplateLibrary("system");
});
afterEach(() => {
  vi.useRealTimers();
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});


/* The two production turns, exactly as typed. */
const TANNING_INTERVIEW = "create a tanning consultant interview form for Test Employee";
const FIRST_ROUND_INTERVIEW = "create a first round management interview form for Test Employee";
const NOT_PUBLISHED = /not published/i;
const A_CARD = /Here is the (?:Coaching|Corrective Action|Follow-Up Coaching) Form|Here is the Policy Review/i;

describe("acceptance: a hidden interview form opens no card (QA, 25 Oct 2026)", () => {
  it("conv_mvnqbm6m28hg07j: the tanning consultant interview is not published, and no Coaching Form", async () => {
    bag.guess = "coaching";
    const [reply] = await replay([TANNING_INTERVIEW]);
    expect(reply!.formProposal).toBeUndefined();
    expect(reply!.content).toMatch(NOT_PUBLISHED);
    expect(reply!.content).not.toMatch(A_CARD);
    expect(reply!.content).not.toContain("create a tanning consultant interview form for");
  });

  it("conv_mvnqblza266tbwt: the first round management interview is not published, and no Corrective Action Form", async () => {
    bag.guess = "dpoa";
    const [reply] = await replay([FIRST_ROUND_INTERVIEW]);
    expect(reply!.formProposal).toBeUndefined();
    expect(reply!.content).toMatch(NOT_PUBLISHED);
    expect(reply!.content).not.toMatch(A_CARD);
    expect(reply!.content).not.toMatch(/Verbal or written\?|Is payroll deduct applicable\?/);
  });

  it("the second round management interview, the same way", async () => {
    const [reply] = await replay(["create a second round management interview form for Test Employee"]);
    expect(reply!.formProposal).toBeUndefined();
    expect(reply!.content).toMatch(NOT_PUBLISHED);
  });

  it("a name sent after the not-published reply still opens no card", async () => {
    bag.guess = "coaching";
    const replies = await replay([TANNING_INTERVIEW, "Test Employee"]);
    expect(replies[1]!.formProposal).toBeUndefined();
    expect(replies[1]!.content).not.toMatch(A_CARD);
  });

  it("asked while a Coaching card is open, the interview still opens no card", async () => {
    bag.guess = "coaching";
    const replies = await replay(["create a coaching form for Test Employee at Kearney, late to her shift on 10-20", TANNING_INTERVIEW]);
    expect(replies[0]!.formProposal?.templateKey).toBe("coaching");
    expect(replies[1]!.formProposal ?? null).toBeNull();
    expect(replies[1]!.content).not.toMatch(A_CARD);
    expect(replies[1]!.content).toMatch(NOT_PUBLISHED);
  });

  it.each([
    ["coaching", "create an interview form for Test Employee"],
    ["coaching", "create a store manager interview form for Test Employee"],
    ["dpoa", "create a store manager interview for Test Employee"],
  ])("an interview that is no single title (%s guess): %s opens no card", async (guess, question) => {
    bag.guess = guess;
    const [reply] = await replay([question]);
    // The proposal flow's answer: the forms this deployment publishes, no interview among them, nothing opened.
    expect(reply!.formProposal).toBeUndefined();
    expect(reply!.content).not.toMatch(A_CARD);
    expect(JSON.stringify(reply)).not.toMatch(/interview/i);
  });
});

describe("a remap form this deployment hides or does not publish opens no card", () => {
  it("a hidden Policy Review is not published, not a Policy Review card", async () => {
    bag.alsoHidden = ["policy-review"];
    bag.guess = "policy-review";
    const [reply] = await replay(["Create a Policy Review for Test Employee at Kearney, cell phone on the floor 10-20"]);
    expect(reply!.formProposal).toBeUndefined();
    expect(reply!.content).not.toMatch(A_CARD);
    expect(reply!.content).toMatch(NOT_PUBLISHED);
  });

  it("an inactive Coaching Form is not published, not a Coaching card", async () => {
    for (const row of (store as Record<string, Record<string, unknown>[]>).form_templates!) {
      if (row.key === "coaching") row.active = false;
    }
    bag.guess = "coaching";
    const [reply] = await replay(["create a coaching form for Test Employee at Kearney, late to her shift on 10-20"]);
    expect(reply!.formProposal).toBeUndefined();
    expect(reply!.content).not.toMatch(A_CARD);
    expect(reply!.content).toMatch(NOT_PUBLISHED);
  });

  it("the model choosing a hidden remap form for an unnamed request opens no card", async () => {
    bag.alsoHidden = ["policy-review"];
    bag.guess = "policy-review";
    const [reply] = await replay(["write up Test Employee at Kearney for a no call no show on 10-20"]);
    expect(reply!.formProposal?.templateKey ?? null).not.toBe("policy-review");
  });
});

describe("unchanged: the remap's own forms still make their cards", () => {
  it.each([
    ["dpoa", "CA for Test Employee at Kearney, out of dress code 10/11", "dpoa"],
    ["dpoa", "write up Test Employee at Kearney for a no call no show on 10-20", "dpoa"],
    ["coaching", "create a coaching form for Test Employee at Kearney, late to her shift on 10-20", "coaching"],
    ["dpoa", "create a CA for Test Employee at Kearney, she skipped the interview training on 10-20", "dpoa"],
    ["coaching", "create a coaching form for Test Employee at Kearney, she wants a transfer and was late on 10-20", "coaching"],
  ])("(%s guess) %s -> %s", async (guess, question, key) => {
    bag.guess = guess;
    const [reply] = await replay([question]);
    expect(reply!.formProposal?.templateKey).toBe(key);
  });

  it("a field note mentioning an interview stays on the open Corrective Action Form", async () => {
    const replies = await replay(["CA for Test Employee at Kearney, out of dress code 10/11", "verbal, no payroll, she missed her interview shift too"]);
    expect(replies[1]!.formProposal?.templateKey).toBe("dpoa");
  });

  it("the exit form still goes to the Resignation/Exit Form (PR 126)", async () => {
    const [reply] = await replay(["Create an exit form for Test Employee at Kearney, she resigned and her last day was 10-20"]);
    expect(reply!.formProposal?.templateKey).toBe("resignation-exit");
    expect(reply!.content).not.toMatch(/Corrective Action/i);
  });
});

describe("remapShouldRun", () => {
  it("leaves the remap for every hidden template, an interview, and an unpublished remap form", () => {
    for (const question of [TANNING_INTERVIEW, FIRST_ROUND_INTERVIEW, "create an interview form for Test Employee", "create a store manager interview for Test Employee"]) {
      expect(remapShouldRun({ question, history: [], formsTurn: true }), question).toBe(false);
    }
    expect(remapShouldRun({ question: "Yes", history: [], formsTurn: true, continueTemplateKey: "tanning-consultant-interview" })).toBe(false);
    expect(
      remapShouldRun({ question: "create a coaching form for Test Employee", history: [], formsTurn: true, unpublished: ["coaching"] }),
    ).toBe(false);
    expect(
      remapShouldRun({ question: "create a coaching form for Test Employee", history: [], formsTurn: true, unpublished: ["demotion"] }),
    ).toBe(true);
  });
});
