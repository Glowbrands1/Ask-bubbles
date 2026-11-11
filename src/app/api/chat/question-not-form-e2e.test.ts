import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { ChatFormProposal, ChatMessage } from "@/types";

vi.mock("@/config/company/locations", async () =>
  (await import("@/test/fixtures/reference-roster")).referenceRosterModule(),
);

/**
 * ============================================================================
 * P0 — A QUESTION IS ANSWERED, NEVER ROUTED INTO A FORM (LIVE, 25 OCT 2026)
 * ============================================================================
 *
 * Production, FORM_FULL_REMAP_ENABLED on. The managers' exact words, each with
 * the turns before it in that conversation (the replies in history are this
 * app's own production replies, shortened):
 *
 *   conv_mvnsvw4t2a3btpw  "create a verbal CA for Test Employee at Grand
 *                         Island for a late opening on 10-20-26", then
 *                         "what policy does that fall under?" → written into
 *                         What happened, never answered.
 *   conv_mvnsuu4u2c7lqcz  four policy questions, then turn 5 "employee has
 *                         been late twice. should i do a coaching or
 *                         corrective action" → an empty Corrective Action
 *                         card whose What happened was turn 4 ("whats policy
 *                         about brining pets into store").
 *
 * The sibling app's live failures on the same family, in this app's words
 * (store, not salon): after an answer that offered "a coaching form or a
 * policy review", "smoking policy", "difference between ca and coaching
 * form", "hey what policies can you write someone up for …" and "footwear for
 * employees" became form turns there.
 *
 * Each question gets the answer: no card, no "Who is this for?", and the open
 * card is not rewritten. A create request (also one phrased as a question), a
 * statement field edit, the exit-form request and "create a coaching document
 * for … regarding …" still make or edit their card. Run on the full remap
 * (production) and with intent extraction on as well. The extraction model's
 * guess is the Corrective Action Form, as in conv_mvnsuu4u2c7lqcz. Synthetic
 * names. Behind QUESTION_NOT_FORM_ENABLED (default off): the exact turns run
 * with it on; with it off, the last block shows the routing is what it was.
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
  /** The extraction model's guess of the form. */
  guess: "dpoa" as string,
  /** What the slot reader (intent extraction) reads: nothing, or the live Corrective Action reading. */
  slotReading: "none" as "none" | "ca",
}));

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
          scope: { level: "location", primaryAreaId: "loc-0307", alsoCoversAreaIds: [] },
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

const ANSWER = "A grounded answer from the policy manual.";

vi.mock("@/lib/ai/call-claude", () => ({
  callClaude: async () => ANSWER,
  callClaudeTool: async (input: { tool?: { name?: string } }) => {
    if (input.tool?.name !== "record_intent_slots") return null;
    return {
      employee: null,
      salon: null,
      store: null,
      title: null,
      incidentType: null,
      incidentDate: null,
      payrollAmount: null,
      warningLevel: null,
      formType: bag.slotReading === "ca" ? "Corrective Action Form" : null,
      formTurn: bag.slotReading === "ca",
      policyHeading: null,
    };
  },
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
    async fetchRoleGrounding(role: { id: string }) {
      return {
        ok: true,
        grounding: {
          role: { id: role.id },
          documentId: "doc-progression",
          documentTitle: "PERFORMANCE MANAGEMENT FRAMEWORK KB TEXT",
          matchedBy: "tag",
          rows: [
            {
              chunk_id: "pmf-0",
              document_id: "doc-progression",
              document_title: "PERFORMANCE MANAGEMENT FRAMEWORK KB TEXT",
              category: "leadership_coaching",
              locator: "SECTION 2",
              page: null,
              section: null,
              content: "Solve the issue at the lowest appropriate level.",
              similarity: 0,
            },
          ],
          presentGroups: ["escalation_ladder"],
        },
      };
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

vi.setConfig({ hookTimeout: 30_000, testTimeout: 30_000 });

const { ensureTemplateLibrary } = await import("@/lib/forms/repository");
const chatRoute = await import("./route");

/* Production's form path here: the full remap. */
const PRODUCTION = ["FORM_FULL_REMAP_ENABLED"] as const;
const PROFILES: readonly (readonly [string, readonly string[]])[] = [
  ["the full remap (production)", PRODUCTION],
  ["the full remap and intent extraction", [...PRODUCTION, "INTENT_EXTRACTION_ENABLED"]],
];
/** This fix's flag, default off. The exact-turn cases run with it on. */
const FLAG = "QUESTION_NOT_FORM_ENABLED";
const ALL_FLAGS = [...PRODUCTION, "INTENT_EXTRACTION_ENABLED", FLAG];
const saved = new Map<string, string | undefined>();

let sequence = 0;
function conversationId(): string {
  sequence += 1;
  return `conv_${Date.now().toString(36)}qn${String(sequence).padStart(3, "0")}`;
}

interface Turn {
  readonly user: string;
  /** This app's production reply with the same words, put into history in place of this harness's. */
  readonly recordedReply?: string;
}

type Reply = { content: string; formProposal?: ChatFormProposal };

/** Each turn through POST /api/chat, the browser's whole messages as history. */
async function replay(turns: readonly (Turn | string)[], id = conversationId()) {
  const messages: ChatMessage[] = [];
  const replies: Reply[] = [];
  const cards: (ChatFormProposal | null)[] = [];
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
    const payload = (await response.json()) as Reply & { error?: string };
    expect(response.status, JSON.stringify(payload)).toBe(200);
    replies.push(payload);
    if (payload.formProposal) proposal = payload.formProposal;
    cards.push(proposal);
    messages.push(
      { id: `msg_${Date.now().toString(36)}u${index}x`, role: "user", content: turn.user, createdAt: "2026-10-25T12:24:00Z" } as ChatMessage,
      {
        id: `msg_${Date.now().toString(36)}a${index}x`,
        role: "assistant",
        content: turn.recordedReply ?? payload.content,
        createdAt: "2026-10-25T12:24:01Z",
        ...(payload.formProposal ? { formProposal: payload.formProposal } : {}),
      } as ChatMessage,
    );
  }
  return { replies, cards };
}

const A_CARD = /Here is the (?:Coaching|Corrective Action|Follow-Up Coaching) Form|Here is the Policy Review/i;
const WHO_FOR = /Who is this (?:\*\*[^*]+\*\* )?for\?/;
const MENU = /Which form did you mean\?|Which form should I start with\?/;

/** Answered: the model's answer, no card, no menu, no form prompt. */
function expectAnswered(reply: Reply) {
  expect(reply.content).not.toMatch(A_CARD);
  expect(reply.content).not.toMatch(WHO_FOR);
  expect(reply.content).not.toMatch(MENU);
  expect(reply.content.startsWith(ANSWER), reply.content).toBe(true);
  expect(reply.formProposal).toBeUndefined();
}

/* This app's production replies in conv_mvnsuu4u2c7lqcz, shortened. */
const WAIVER_REPLY =
  "The manual states that every client must complete and sign a consent form, along with the skin typing chart, with no exceptions [p.49]. That would also tie into the broader Standards of Conduct language.";
const BEREAVEMENT_REPLY =
  "Bereavement Leave (applies company-wide, all brands):\n\n- If an immediate family member dies, the employee should notify their Supervisor and payroll immediately [p.46].\n- The Company provides up to 3 consecutive paid days of Bereavement Leave [p.46].";
const SMOKE_REPLY =
  "The manual doesn't have a section specifically called \"smoke breaks,\" but here's what it says under Smoking/Vaping:\n\n- Smoking or use of vapor products is not permitted in any Company location [p.12].";
const PETS_REPLY =
  "Animals in the Workplace (applies to all brands):\n\n- Pets are not allowed in the workplace [p.30].\n- The exception is a service animal [p.30].";
/* An answer that offers forms by name, as the sibling app's answers did. */
const OFFER_REPLY =
  "Here's what the manual covers on attendance [p.14]. If you're dealing with a specific employee on this, tell me what's happened — and if you want it documented, ask me to create a coaching form or corrective action form for them by name.";

beforeEach(async () => {
  for (const key of Object.keys(store)) (store as Record<string, unknown[]>)[key] = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-25T12:30:00Z"));
  for (const name of ALL_FLAGS) saved.set(name, process.env[name]);
  bag.guess = "dpoa";
  bag.slotReading = "none";
  await ensureTemplateLibrary("system");
});
afterEach(() => {
  vi.useRealTimers();
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function useProfile(flags: readonly string[], fix = true) {
  for (const name of ALL_FLAGS) delete process.env[name];
  for (const name of flags) process.env[name] = "true";
  if (fix) process.env[FLAG] = "true";
}

describe.each(PROFILES)("P0: a question is answered (%s)", (_label, flags) => {
  beforeEach(() => useProfile(flags));

  it('conv_mvnsvw4t2a3btpw: "what policy does that fall under?" is answered; the card is not rewritten', async () => {
    const { replies, cards } = await replay([
      "create a verbal CA for Test Employee at Grand Island for a late opening on 10-20-26",
      "what policy does that fall under?",
    ]);
    expect(replies[0]!.formProposal?.templateKey).toBe("dpoa");
    expectAnswered(replies[1]!);
    expect(JSON.stringify(cards[1])).toBe(JSON.stringify(cards[0]));
    expect(JSON.stringify(cards[1])).not.toMatch(/what policy does that fall under/i);
  });

  it.each([["none"], ["ca"]] as const)(
    "conv_mvnsuu4u2c7lqcz turn 5: should i do a coaching or corrective action (slot reading %s)",
    async (reading) => {
      bag.slotReading = reading;
      const { replies } = await replay([
        { user: "what policy is violated when employee fails to have client sign waiver", recordedReply: WAIVER_REPLY },
        { user: "what's policy on bereavement", recordedReply: BEREAVEMENT_REPLY },
        { user: "whats policy about smoke breaks", recordedReply: SMOKE_REPLY },
        { user: "whats policy about brining pets into store", recordedReply: PETS_REPLY },
        "employee has been late twice. should i do a coaching or corrective action",
      ]);
      expectAnswered(replies[4]!);
      expect(JSON.stringify(replies[4])).not.toMatch(/brining pets/i);
    },
  );

  it("an earlier turn never fills What happened for the next card", async () => {
    const { replies } = await replay([
      { user: "whats policy about brining pets into store", recordedReply: PETS_REPLY },
      "employee has been late twice. should i do a coaching or corrective action",
      "create a CA for Test Employee at Grand Island for being late twice",
    ]);
    expectAnswered(replies[1]!);
    expect(replies[2]!.formProposal?.templateKey).toBe("dpoa");
    expect(JSON.stringify(replies[2])).not.toMatch(/brining pets|should i do a coaching/i);
  });

  it.each([["none"], ["ca"]] as const)(
    "the sibling app's family, after an answer offering forms (slot reading %s)",
    async (reading) => {
      bag.slotReading = reading;
      for (const question of [
        "smoking policy",
        "difference between ca and coaching form",
        "hey what policies can you write someone up for not signing a memebership up on a credit card",
        "footwear for employees",
        "how many hours is a part-time employee?",
      ]) {
        const { replies } = await replay([{ user: "What does our policy say about attendance?", recordedReply: OFFER_REPLY }, question]);
        expectAnswered(replies[1]!);
      }
    },
  );
});

/*
 * Production's profile only: with intent extraction also on, this app's slot
 * reader answers a create request with "I still need …" before and after this
 * change, which is that path's own open issue, not this guard's.
 */
describe("requests still make or edit their card (the full remap, production)", () => {
  beforeEach(() => useProfile(PRODUCTION));

  it("an explicit create request", async () => {
    const { replies } = await replay([
      { user: "What does our policy say about attendance?", recordedReply: OFFER_REPLY },
      "create a CA for Test Employee at Grand Island for opening the store late on 10-20-26",
    ]);
    expect(replies[1]!.formProposal?.templateKey).toBe("dpoa");
  });

  it("a create request phrased as a question", async () => {
    const { replies } = await replay([
      { user: "What does our policy say about attendance?", recordedReply: OFFER_REPLY },
      "can you create a CA for Test Employee at Grand Island for opening the store late on 10-20-26?",
    ]);
    expect(replies[1]!.formProposal?.templateKey).toBe("dpoa");
  });

  it("create a coaching document for … regarding …", async () => {
    bag.guess = "coaching";
    const { replies } = await replay(["create a coaching document for Test Employee at Grand Island regarding not completing closing duties"]);
    expect(replies[0]!.formProposal?.templateKey).toBe("coaching");
  });

  it("the exit-form request", async () => {
    const { replies } = await replay(["Create an exit form for Test Employee at Grand Island, she resigned and her last day was 10-20"]);
    expect(replies[0]!.formProposal?.templateKey).toBe("resignation-exit");
  });

  it("a statement field edit on the open card", async () => {
    const { replies } = await replay([
      "create a verbal CA for Test Employee at Grand Island for a late opening on 10-20-26",
      "change the date to 10-22",
    ]);
    expect(replies[0]!.formProposal?.templateKey).toBe("dpoa");
    expect(replies[1]!.content.startsWith(ANSWER)).toBe(false);
    // Still the card's turn, handled exactly as on main (whether the remap moves the date is its own reader's job).
    expect(replies[1]!.formProposal?.templateKey).toBe("dpoa");
  });
});

/*
 * QUESTION_NOT_FORM_ENABLED OFF: the routing is what production has today, so
 * the live failures still reproduce. When this block starts failing with the
 * flag off, the old routing changed.
 */
describe("QUESTION_NOT_FORM_ENABLED off: every turn is routed as before (the full remap)", () => {
  beforeEach(() => useProfile(PRODUCTION, false));

  it("conv_mvnsvw4t2a3btpw: the question is still written into the card", async () => {
    const { replies } = await replay([
      "create a verbal CA for Test Employee at Grand Island for a late opening on 10-20-26",
      "what policy does that fall under?",
    ]);
    expect(replies[1]!.content).toMatch(A_CARD);
  });

  it("conv_mvnsuu4u2c7lqcz turn 5: still a Corrective Action card", async () => {
    const { replies } = await replay([
      { user: "whats policy about brining pets into store", recordedReply: PETS_REPLY },
      "employee has been late twice. should i do a coaching or corrective action",
    ]);
    expect(replies[1]!.content).toMatch(A_CARD);
  });

  it("requests make their card exactly as with the flag on", async () => {
    const { replies } = await replay([
      "can you create a CA for Test Employee at Grand Island for opening the store late on 10-20-26?",
    ]);
    expect(replies[0]!.formProposal?.templateKey).toBe("dpoa");
  });
});
