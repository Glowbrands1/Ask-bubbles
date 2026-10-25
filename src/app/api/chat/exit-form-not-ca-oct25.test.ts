import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { ChatFormProposal, ChatMessage } from "@/types";

vi.mock("@/config/company/locations", async () =>
  (await import("@/test/fixtures/reference-roster")).referenceRosterModule(),
);

/**
 * ============================================================================
 * AN EXIT FORM IS NOT A CORRECTIVE ACTION — ASK BUBBLES' LIVE PATH, 25 OCT 2026
 * ============================================================================
 *
 * conv_mvnmfb21286uhtq (production, FORM_FULL_REMAP_ENABLED on). The manager
 * asked for an exit form; the reply was "Here is the Corrective Action Form."
 * with "What happened: Create an exit form for", "Verbal or written?" and
 * "Is payroll deduct applicable?". The next turn, "Yes", set payroll deduct.
 *
 * The full remap only fills the Corrective Action, Coaching, Follow-Up
 * Coaching and Policy Review forms, but `remapShouldRun` said yes to every
 * forms turn, and the extraction model can only choose among those four.
 * A manager turn naming any other library form now leaves the remap, and the
 * proposal flow (which knows the Resignation/Exit Form) serves it.
 *
 * The extraction model here guesses "dpoa" on every turn, as it did in
 * production; only the manager's words may decide the form. Names are
 * synthetic; the store is this app's.
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

const bag = vi.hoisted(() => ({ modelLevel: null as "verbal" | "written" | null }));

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
  // The model's guess in conv_mvnmfb21286uhtq: the Corrective Action Form.
  callClaudeToolDetailed: async () => ({
    input: { templateKey: "dpoa", employeeName: null, observation: null, actionPlan: null },
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
  await ensureTemplateLibrary("system");
});
afterEach(() => {
  vi.useRealTimers();
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

/* conv_mvnmfb21286uhtq, turn 1, exactly as typed (synthetic name). */
const EXIT_REQUEST = "Create an exit form for Test Employee at Kearney, she resigned and her last day was 10-20";
const CA_QUESTIONS = /Verbal or written\?|Is payroll deduct applicable\?|Payroll deduction amount\?/i;

describe("acceptance: an exit form request gets the exit form on Ask Bubbles' live path", () => {
  it("conv_mvnmfb21286uhtq T1: the Resignation/Exit Form, with no level or payroll question", async () => {
    const [reply] = await replay([EXIT_REQUEST]);
    expect(reply!.formProposal?.templateKey).toBe("resignation-exit");
    expect(reply!.content).not.toMatch(/Corrective Action/i);
    expect(reply!.content).not.toMatch(CA_QUESTIONS);
    expect(reply!.content).not.toContain("Create an exit form for");
    expect(reply!.formProposal?.warningLevel ?? null).toBeNull();
    expect(reply!.formProposal?.payrollDeduct ?? null).toBeNull();
  });

  it('conv_mvnmfb21286uhtq T2: "Yes" sets no payroll deduct and keeps the exit form', async () => {
    const replies = await replay([EXIT_REQUEST, "Yes"]);
    const last = replies.at(-1)!;
    expect(last.formProposal?.payrollDeduct ?? null).toBeNull();
    // The exit form's own blank "Payroll Deduction" box may be listed; no answer is read back.
    expect(last.content).not.toMatch(/\*\*Payroll deduct:\*\*/i);
    expect(last.content).not.toMatch(CA_QUESTIONS);
    expect(last.content).not.toMatch(/Corrective Action/i);
    if (last.formProposal) expect(last.formProposal.templateKey).toBe("resignation-exit");
  });

  it('the production T2 after the recorded Corrective Action reply: "Yes" is not a payroll deduct on an exit form', async () => {
    const replies = await replay([
      {
        user: EXIT_REQUEST,
        recordedReply:
          "Here is the Corrective Action Form.\n**Employee:** Test Employee\n**Store:** Kearney, NE, as you said\n**Date:** 2026-10-20\n**What happened:** Create an exit form for\n\nWhat is their job title?\nVerbal or written?\nIs payroll deduct applicable?",
      },
      "Yes",
    ]);
    const last = replies.at(-1)!;
    expect(last.formProposal?.payrollDeduct ?? null).toBeNull();
    expect(last.content).not.toMatch(/Corrective Action/i);
    expect(last.content).not.toMatch(CA_QUESTIONS);
  });

  it.each([
    "Create a resignation form for Test Employee at Kearney, her last day was 10-20",
    "Create the separation paperwork for Test Employee at Kearney, last day 10-20",
    "Create the resignation paperwork for Test Employee at Kearney, last day 10-20",
    "Create the termination paperwork for Test Employee at Kearney, last day 10-20",
    "Create a termination form for Test Employee at Kearney, her last day was 10-20",
  ])("%s: not a Corrective Action Form", async (question) => {
    const [reply] = await replay([question]);
    expect(reply!.formProposal?.templateKey ?? null).not.toBe("dpoa");
    expect(reply!.content).not.toMatch(/Here is the Corrective Action Form/i);
    expect(reply!.content).not.toMatch(CA_QUESTIONS);
  });

  it.each([
    ["Create a demotion form for Test Employee at Kearney", "demotion"],
    ["Create a position transfer form for Test Employee at Kearney", "position-transfer"],
  ])("%s: another library form outside the remap is not a Corrective Action Form", async (question, key) => {
    const [reply] = await replay([question]);
    expect(reply!.formProposal?.templateKey ?? null).not.toBe("dpoa");
    if (reply!.formProposal) expect(reply!.formProposal.templateKey).toBe(key);
    expect(reply!.content).not.toMatch(CA_QUESTIONS);
  });
});

describe("unchanged: Corrective Action, Coaching and Policy Review requests stay on the remap", () => {
  it('"create a CA for Test Employee, she resigned …" is still a Corrective Action Form', async () => {
    const [reply] = await replay([
      "create a CA for Test Employee at Kearney, she resigned and walked out mid-shift on 10-20 without telling anyone",
    ]);
    expect(reply!.formProposal?.templateKey).toBe("dpoa");
    expect(reply!.content).toMatch(/Corrective Action Form/);
  });

  it.each([
    ["create a coaching form for Test Employee at Kearney, late to her shift on 10-20", "coaching"],
    ["create a follow-up coaching form for Test Employee at Kearney", "follow-up-coaching"],
    ["Create a Policy Review for Test Employee at Kearney, cell phone on the floor 10-20", "policy-review"],
    ["CA for Test Employee at Kearney, out of dress code 10/11", "dpoa"],
    ["write up Test Employee at Kearney for a no call no show on 10-20", "dpoa"],
  ])("%s → %s", async (question, key) => {
    const [reply] = await replay([question]);
    expect(reply!.formProposal?.templateKey).toBe(key);
  });

  it("a field note after a Corrective Action stays on the Corrective Action Form", async () => {
    const replies = await replay(["CA for Test Employee at Kearney, out of dress code 10/11", "verbal, no payroll"]);
    expect(replies[1]!.formProposal?.templateKey).toBe("dpoa");
    expect(replies[1]!.formProposal?.warningLevel).toBe("verbal");
  });

  it("an exit form earlier, then a Corrective Action named by the manager, gives the Corrective Action Form", async () => {
    const replies = await replay([EXIT_REQUEST, "actually create a CA for Test Employee instead, she was out of dress code 10/11"]);
    expect(replies[1]!.formProposal?.templateKey).toBe("dpoa");
  });
});

describe("remapShouldRun reads only the manager's words", () => {
  const user = (content: string) => ({ role: "user", content });
  const assistant = (content: string) => ({ role: "assistant", content });

  it("the exit request, and the bare Yes after it, leave the remap", () => {
    expect(remapShouldRun({ question: EXIT_REQUEST, history: [], formsTurn: true })).toBe(false);
    expect(
      remapShouldRun({
        question: "Yes",
        history: [user(EXIT_REQUEST), assistant("Here is the Corrective Action Form.\nVerbal or written?")],
        formsTurn: true,
        continueTemplateKey: "dpoa",
      }),
    ).toBe(false);
  });

  it("an open exit card with no form named leaves the remap; an open Corrective Action card does not", () => {
    expect(remapShouldRun({ question: "Yes", history: [], formsTurn: true, continueTemplateKey: "resignation-exit" })).toBe(false);
    expect(remapShouldRun({ question: "Yes", history: [], formsTurn: true, continueTemplateKey: "dpoa" })).toBe(true);
  });

  it("Bubbles naming the exit form does not move a Corrective Action off the remap", () => {
    expect(
      remapShouldRun({
        question: "verbal, no payroll",
        history: [
          user("CA for Test Employee at Kearney, out of dress code 10/11"),
          assistant("If she is leaving, the Resignation/Exit Form is separate. Here is the Corrective Action Form."),
        ],
        formsTurn: true,
        continueTemplateKey: "dpoa",
      }),
    ).toBe(true);
  });

  it('"she resigned" inside a Corrective Action request stays on the remap', () => {
    expect(
      remapShouldRun({
        question: "create a CA for Test Employee at Kearney, she resigned and walked out mid-shift on 10-20 without telling anyone",
        history: [],
        formsTurn: true,
      }),
    ).toBe(true);
  });
});
