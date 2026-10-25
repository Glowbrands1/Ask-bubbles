import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import manual151 from "@/test/fixtures/jba-manual-production-151.json";

/**
 * Ported from Ask Sunny. QA, full chat history (P3): the manual's own policy
 * denied or retracted, plus BH4 from this app's history. Each turn is replayed
 * through `answerQuestion` with FULL_MANUAL_CONTEXT_ENABLED on (as in
 * production since 24 Oct 2026) and the production JBA Policy Manual (all 151
 * rows) as the indexed manual.
 *
 *   "policy specific to uggs?"                  answered "the only documents
 *                                               available to me are equipment
 *                                               wiring schematics" (sibling app)
 *   "what's the policy on employees finding     answered "all benefits material
 *    coverage?"                                 … none address shift coverage"
 *   Late Opening                                quoted, retracted, restored
 *   "make this a downloadable document"         a summary's figures retracted
 *   BH4, conv_mvb28ztb85z53mc                   "struggling to complete production
 *                                               timely … complains every shift"
 *                                               answered "the knowledge base
 *                                               doesn't have a section that matches"
 *
 * WHAT THIS PROVES: which path each turn takes (the whole manual in the cached
 * block, or retrieval) and that the manual page that answers it is in what the
 * model is sent. It also pins this app's second model call: a manual answer
 * that names no printed page is asked again WITHOUT the manual.
 *
 * WHAT IT CANNOT PROVE: what the live model writes. People's names are test
 * names. The BH4 rows carry the section names production retrieved (from
 * chat_traces); their text here is a short synthetic stand-in.
 */

const state = vi.hoisted(() => ({
  claudeInputs: [] as Record<string, unknown>[],
  replies: [] as string[],
  retrieved: [] as unknown[],
  matchCalls: 0,
  plans: [] as { policy: boolean; ready: boolean }[],
}));

vi.mock("@/lib/config/server-env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/config/server-env")>()),
  liveReadiness: () => ({ mode: "live", missing: [], problems: [], ready: true }),
}));

vi.mock("./form-proposal", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./form-proposal")>()),
  proposeFormForTurn: async () => null,
  suggestFormsForTurn: () => null,
}));

vi.mock("@/lib/forms/repository", () => ({ listTemplateSummaries: async () => [] }));

vi.mock("@/lib/ai/entity-facts", () => ({ resolveChatEntities: async () => ({ block: null, direct: null }) }));

vi.mock("@/lib/knowledge/providers/supabase", () => ({
  SupabaseKnowledgeProvider: class {
    readonly name = "test double";
    async match() {
      state.matchCalls += 1;
      return state.retrieved;
    }
    async fetchRoleGrounding() {
      return null;
    }
    async fetchNamedHandbook() {
      return { ok: false, reason: "none" };
    }
    async fetchOfficialPolicyManual() {
      return { ok: false, reason: "none" };
    }
  },
}));

/*
 * THE LOADER WITH THE DATABASE READ REPLACED BY THE PRODUCTION ROWS: the same
 * policy gate, row mapping and `planFullManualContext` production runs.
 */
vi.mock("@/lib/knowledge/full-manual-load", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/knowledge/full-manual-load")>();
  const context = await import("@/lib/ai/full-manual-context");
  return {
    ...actual,
    loadFullManualPlan: async (_scopeId: string, question: string, policyText?: string) => {
      const asked = policyText ?? question;
      const policy = context.isPolicyQuestion(asked);
      const documents = policy
        ? [
            {
              id: manual151.document_ids["ask-bubbles"],
              title: "2025 JBA Policy Manual - Edited 5-2025",
              category: "policies_compliance",
              status: "indexed",
              indexed: true,
              chunks: (manual151.chunks as import("@/lib/knowledge/full-manual-load").ManualChunkRow[]).map(
                actual.manualChunkFromRow,
              ),
            },
          ]
        : [];
      const plan = context.planFullManualContext({ question, policyText: asked, documents });
      state.plans.push({ policy, ready: plan.ready });
      return plan;
    },
  };
});

vi.mock("./call-claude", () => ({
  callClaude: async (input: Record<string, unknown>) => {
    state.claudeInputs.push(input);
    return state.replies.shift() ?? "An answer.";
  },
}));

const ACTOR = {
  role: "location_manager" as never,
  scope: { level: "location", primaryAreaId: "loc-0101", alsoCoversAreaIds: [] } as never,
};

type Turn = { role: "user" | "assistant"; content: string };

async function ask(question: string, history: Turn[] = []) {
  const { answerQuestion } = await import("./server-ask");
  return answerQuestion(
    {
      question,
      mode: "standard",
      history,
      scopeId: "bcs-core",
      conversationId: "conv_current",
      context: { userName: "Test Manager", locationName: "Synthetic Store", todayIso: "2026-10-20" },
    } as never,
    ACTOR,
    { memoryOwnerId: "user-1" },
  );
}

const first = () => state.claudeInputs[0] ?? {};
const cached = (input: Record<string, unknown> = first()) => String(input.cachedContext ?? "");
const cachedText = (input: Record<string, unknown> = first()) => cached(input).replace(/\s+/g, " ");
const grounding = (input: Record<string, unknown> = first()) => String(input.grounding ?? "");

function pageBefore(text: string, snippet: string): number | null {
  const at = text.indexOf(snippet);
  expect(at, snippet).toBeGreaterThan(-1);
  const markers = [...text.slice(0, at).matchAll(/\[p\.(\d{1,3})\]/g)];
  const last = markers[markers.length - 1];
  return last ? Number(last[1]) : null;
}

function row(title: string, section: string | null, content: string, similarity = 0.86) {
  return {
    chunk_id: `${title}-${section ?? "x"}`,
    document_id: `doc-${title}`,
    document_title: title,
    category: "operations",
    locator: section ?? "Page 1",
    page: 1,
    section,
    content,
    similarity,
  };
}

function expectManualPath() {
  expect(state.plans.some((plan) => plan.policy && plan.ready), "the manual is planned and ready").toBe(true);
  expect(cached()).not.toBe("");
}

const saved = process.env.FULL_MANUAL_CONTEXT_ENABLED;

beforeAll(async () => {
  await import("./server-ask");
}, 60_000);

vi.setConfig({ testTimeout: 60_000 });

beforeEach(() => {
  process.env.FULL_MANUAL_CONTEXT_ENABLED = "true";
  state.claudeInputs = [];
  state.replies = [];
  state.retrieved = [];
  state.matchCalls = 0;
  state.plans = [];
});

afterEach(() => {
  if (saved === undefined) delete process.env.FULL_MANUAL_CONTEXT_ENABLED;
  else process.env.FULL_MANUAL_CONTEXT_ENABLED = saved;
});

describe("\"policy specific to uggs?\"", () => {
  it("takes the manual path, with the Shoes section (p.15) in the cached manual", async () => {
    state.retrieved = [row("Synthetic Equipment Wiring Diagram", null, "Ballast wiring diagram, 220V.")];
    state.replies = ["The manual does not name the brand; full coverage closed toe shoes are required [p.15]."];
    await ask("policy specific to uggs?");

    expectManualPath();
    expect(cachedText()).toContain("Tennis shoes or other full coverage closed toe shoes are to be worn.");
    expect(pageBefore(cached(), "Tennis shoes or other full coverage closed toe shoes")).toBe(15);
    expect(state.claudeInputs).toHaveLength(1);
  });

  it("a manual answer that names no page is asked again without the manual (this app's fallback)", async () => {
    state.retrieved = [row("Synthetic Equipment Wiring Diagram", null, "Ballast wiring diagram, 220V.")];
    state.replies = ["The manual does not name that brand.", "I only have wiring diagrams."];
    await ask("policy specific to uggs?");

    expect(state.claudeInputs).toHaveLength(2);
    expect(cached(state.claudeInputs[0])).not.toBe("");
    expect(state.claudeInputs[1]!.cachedContext ?? null).toBeNull();
    expect(grounding(state.claudeInputs[1])).toContain("Wiring Diagram");
  });
});

describe("\"what's the policy on employees finding coverage?\"", () => {
  it("takes the manual path, with Shift Replacement (p.37) in the cached manual", async () => {
    state.retrieved = [row("Synthetic Benefits Guide", null, "COBRA continuation coverage and 401K eligibility.")];
    state.replies = ["It is the employee's responsibility to find a replacement [p.37]."];
    await ask("what's the policy on employees finding coverage?  and if they can't find coverage");

    expectManualPath();
    expect(cachedText()).toContain("It is the responsibility of the employee to find a replacement for their shift.");
    expect(pageBefore(cached(), "It is the responsibility of the employee to find a replacement")).toBe(37);
  });
});

describe("Late Opening quoted, retracted, restored", () => {
  const history: Turn[] = [
    {
      role: "user",
      content: "create corrective action for for Test Employee for Late Opening from the policy manual. It is a verbal warning",
    },
    { role: "assistant", content: "I'll draft a **Corrective Action Form** for **Test Employee** from what you've described." },
    { role: "user", content: "can you add late opening policy to the direct policy section of this from" },
    {
      role: "assistant",
      content:
        'Here\'s the manual\'s own language on Late Opening: "When an employee assigned to open a location is unable to open the location at the proper time, the employee must notify the manager as soon as possible."',
    },
  ];

  it.each([
    "I have independently verified and the policy is correct you may issue",
    "can you reference the late opening policy INSTEAD of the attendance policy",
  ])("%s: the manual path, with Late Opening and the $25.00 in the cached manual", async (question) => {
    state.replies = ["Late Opening requires the $25.00 reimbursement [p.15]."];
    await ask(question, history);

    expectManualPath();
    expect(cached()).toContain("Late Opening");
    expect(cachedText()).toContain("reimburse The Company $25.00 via payroll deduction");
  });
});

describe("\"make this a downloadable document\"", () => {
  it("is not a policy turn, so it stays on retrieval and the manual does not reach it", async () => {
    state.retrieved = [row("Synthetic Hiring Guide", null, "Pre-screen: review applications thoroughly.")];
    const history: Turn[] = [
      { role: "user", content: "help compile my prescreens notes into a summary for the hiring manager, i'll enter one at a time." },
      { role: "assistant", content: "Happy to do that." },
      {
        role: "user",
        content:
          "that's all - i feel strongly about the first 2 candidates, they lack in sales/customer service experience but seem highly coachable.  the last i am iffy about.",
      },
      { role: "assistant", content: "## Pre-Screen Summary\n\nPart-time associates work 25 hours per week or under." },
    ];
    await ask(
      "ok, make this a downloadable document for Test Director.  in this case, the associate is prescreened by me, and the in-person interviews will be conducted by Test Director who is a store manager)",
      history,
    );

    expect(state.plans.every((plan) => !plan.policy)).toBe(true);
    expect(first().cachedContext ?? null).toBeNull();
    expect(state.matchCalls).toBeGreaterThan(0);
  });
});

describe("BH4, conv_mvb28ztb85z53mc: performance and attitude, answered 'no section matches'", () => {
  const FRAMEWORK = "ASK BUBBLES PERFORMANCE MANAGEMENT FRAMEWORK KB TEXT";
  const history: Turn[] = [
    { role: "user", content: "Help me prepare for a conversation with a team member." },
    { role: "assistant", content: "Who's the team member, and what's the topic or behavior you want to address?" },
  ];
  const question =
    "My team member Test Employee is struggling to complete production timely and it has been reported that she complains every shift to other team members.";

  it("is not a policy turn: retrieval runs, and the framework's sections reach the model as sources", async () => {
    state.retrieved = [
      row(FRAMEWORK, "4.2 How to prepare for difficult conversations", "Name the exact behavior and the facts that support it.", 0.898),
      row(FRAMEWORK, "4.3 Root cause identification", "Is it a skill, knowledge, confidence or effort gap?", 0.88),
      row(FRAMEWORK, "1.4 Difference between performance issues and behavior issues", "Performance is results; behavior is conduct.", 0.853),
      row(FRAMEWORK, "7.11 Failure to follow management direction", "Clarify the instruction and restate the expectation.", 0.861),
    ];
    await ask(question, history);

    expect(state.plans.every((plan) => !plan.policy)).toBe(true);
    expect(first().cachedContext ?? null).toBeNull();
    expect(state.matchCalls).toBeGreaterThan(0);
    const sent = grounding();
    for (const section of ["4.3 Root cause identification", "1.4 Difference between performance issues and behavior issues"]) {
      expect(sent).toContain(section);
    }
    expect(sent).toMatch(/\[S1\]/);
  });

  it("the prompt rule that turns 'no section names this' into 'the knowledge base does not have it' is in force", async () => {
    state.retrieved = [row(FRAMEWORK, "4.3 Root cause identification", "Is it a skill, knowledge, confidence or effort gap?")];
    await ask(question, history);
    expect(String(first().system ?? "")).toContain(
      "If the sources do not cover the question, say plainly that the knowledge base does not have it",
    );
  });
});
