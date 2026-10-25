import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { ChatFormProposal, ChatMessage } from "@/types";

/**
 * ============================================================================
 * CHAT-HISTORY REPLAY, PRODUCTION 25 OCT 2026 — THE STORE THE MANAGER TYPED
 * ============================================================================
 *
 * Every turn through POST /api/chat on this app's form path (the full remap,
 * FORM_FULL_REMAP_ENABLED on), with this app's own store list. The managers'
 * words are copied exactly; the names were already synthetic.
 *
 *   conv_mvnsstvq2cywp78 (G12) and conv_mvnu3j932gpohx4 (B15)
 *     T1 "do verbal corrective action for Test Employee, team member at
 *        Dodge, NE. location. previous coaching jba manual 9-9-26. …"
 *        B15's reply: "I can't write this up as a corrective action document
 *        here — that's a formal HR record, and I can't produce a facsimile
 *        of one or its contents." The request never reached the form path:
 *        "previous coaching" made the turn a question about forms on file.
 *     T2 "change store location to bellevue, ne" — "Got it — the store for
 *        this is Bellevue, NE, Store 67".
 *     T3 'create a Corrective Action Form for Test Employee"' — the card said
 *        "Store: Omaha, NE (West Dodge Rd)" and, in B15, "What happened: \"".
 *
 *   conv_mve3dllz2vq5db8 (BH2, an all-locations account)
 *     "the location is NE Grand Island", then "Create a Coaching Form from
 *     this conversation." — every card said "Your account covers every
 *     location, so this form won't name one."
 *
 *   conv_mvnssmd12m61nhu
 *     "create an exit for Test Employee at dodge last day worked 10-17-26"
 *     came back as the Corrective Action Form.
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

const account = vi.hoisted(() => ({
  role: "admin",
  scope: { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] } as {
    level: string;
    primaryAreaId: string | null;
    alsoCoversAreaIds: string[];
  },
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
      if (!hasPermission(DEFAULT_PERMISSION_MATRIX, account.role as never, permission as never)) {
        throw new AuthError("forbidden", "Your role does not have permission to do that.");
      }
      return {
        identity: {
          subject: "qa-manager",
          email: "qa-manager@example.test",
          displayName: "QA Manager",
          role: account.role,
          scope: account.scope,
          verified: true,
        },
        permission,
        provider: "supabase",
      };
    },
  };
});
vi.mock("@/lib/analytics/record", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics/record")>()),
  openTurn: async () => "turn-qa",
  closeTurn: async () => {},
  recordActivity: async () => {},
  recordActivityAsync: () => {},
}));

vi.mock("@/lib/ai/call-claude", () => ({
  callClaude: async () => "A grounded answer.",
  callClaudeTool: async () => null,
  // The extraction model's read: the form the manager named, no other field.
  callClaudeToolDetailed: async (input: { user?: string }) => ({
    input: {
      templateKey: /coaching form/i.test(input.user ?? "") ? "coaching" : "dpoa",
      employeeName: null,
      observation: null,
      actionPlan: null,
    },
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
    async fetchNamedHandbook() {
      return { ok: false, reason: "none" };
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
const ENV = [
  "PLACE_SPAN_GUARD_ENABLED",
  "REMAP_INCIDENT_FIX_ENABLED",
  "PRIOR_ACTIONS_PARSE_ENABLED",
  "FORM_REQUEST_OVER_ON_FILE_ENABLED",
  "NEWEST_PLACE_TURN_ENABLED",
  "TYPED_NAME_ENABLED",
] as const;
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
  for (const name of ENV) {
    saved.set(name, process.env[name]);
    delete process.env[name];
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
const G12_T1 =
  "do verbal corrective action for Test Employee, team member at Dodge, NE. location. previous coaching jba manual 9-9-26. payroll deduct applies. on 10-22-26 the register was short 8.65 which will be payroll deducted from Test Employee check";
const G12_T2 = "change store location to bellevue, ne";
/* The stray closing quote is the manager's. */
const G12_T3 = 'create a Corrective Action Form for Test Employee"';
/* B15's production replies to T1 and T2, word for word up to the point that matters. */
const B15_T1_REPLY =
  "I can't write this up as a corrective action document here — that's a formal HR record, and I can't produce a facsimile of one or its contents. What I can do is help you get the real form started.\n\nA few things first, though:\n\n- **Store**: You said \"Dodge, NE\" — the verified store for this question is Omaha, NE (West Dodge Rd), Store 264. If that's not the one you mean, tell me which store.\n\nIf you want to proceed, just say: **\"create a Corrective Action form for Test Employee\"** and the draft card will come up for you to fill in with the store, date, amount, and prior coaching details.";
const B15_T2_REPLY =
  "Got it — the store for this is Bellevue, NE, Store 67 (per the verified store list), not Dodge/Omaha.\n\nWhen you're ready, say **\"create a Corrective Action form for Test Employee\"** and the draft card will open for you to enter these details.";

const PUNCTUATION_ONLY = /^[^\p{L}\p{N}]*$/u;

function on(...names: string[]) {
  for (const name of names) process.env[name] = "true";
}

describe("B15 T1: a Corrective Action request that mentions previous coaching is a form request", () => {
  it("conv_mvnu3j932gpohx4 T1 opens the Corrective Action Form, never the facsimile refusal", async () => {
    on("FORM_REQUEST_OVER_ON_FILE_ENABLED");
    const [reply] = await replay([G12_T1]);
    expect(reply!.content).not.toMatch(/facsimile|can't write this up/i);
    expect(reply!.formProposal?.templateKey).toBe("dpoa");
  });

  it("flag off: the turn is read as a question about forms on file (the production behaviour)", async () => {
    const [reply] = await replay([G12_T1]);
    expect(reply!.formProposal ?? null).toBeNull();
  });
});

describe("G12 / B15 T3: the store the manager changed to is the card's store", () => {
  it("conv_mvnu3j932gpohx4: Bellevue, NE after the production replies (PLACE_SPAN_GUARD_ENABLED)", async () => {
    on("PLACE_SPAN_GUARD_ENABLED", "REMAP_INCIDENT_FIX_ENABLED", "PRIOR_ACTIONS_PARSE_ENABLED");
    const replies = await replay([
      { user: G12_T1, recordedReply: B15_T1_REPLY },
      { user: G12_T2, recordedReply: B15_T2_REPLY },
      G12_T3,
    ]);
    const card = replies.at(-1)!;
    expect(card.formProposal?.templateKey).toBe("dpoa");
    expect(card.formProposal?.locationName).toBe("Bellevue, NE");
    expect(card.content).toContain("**Store:** Bellevue, NE");
    expect(card.content).not.toContain("West Dodge");
  });

  it("conv_mvnsstvq2cywp78: the same with every turn through this app", async () => {
    on("PLACE_SPAN_GUARD_ENABLED", "REMAP_INCIDENT_FIX_ENABLED", "PRIOR_ACTIONS_PARSE_ENABLED", "FORM_REQUEST_OVER_ON_FILE_ENABLED");
    const replies = await replay([G12_T1, G12_T2, G12_T3]);
    const card = replies.at(-1)!;
    expect(card.formProposal?.locationName).toBe("Bellevue, NE");
    expect(card.content).not.toContain("West Dodge");
  });

  it("PLACE_SPAN_GUARD_ENABLED off: the earlier store wins (the production card)", async () => {
    on("REMAP_INCIDENT_FIX_ENABLED", "PRIOR_ACTIONS_PARSE_ENABLED");
    const replies = await replay([
      { user: G12_T1, recordedReply: B15_T1_REPLY },
      { user: G12_T2, recordedReply: B15_T2_REPLY },
      G12_T3,
    ]);
    expect(replies.at(-1)!.formProposal?.locationName).toBe("Omaha, NE (West Dodge Rd)");
  });
});

describe('B15 T3: a stray quote is never What happened', () => {
  it.each([
    ["the production flags", ["REMAP_INCIDENT_FIX_ENABLED", "PRIOR_ACTIONS_PARSE_ENABLED"]],
    ["with the place guard", ["REMAP_INCIDENT_FIX_ENABLED", "PRIOR_ACTIONS_PARSE_ENABLED", "PLACE_SPAN_GUARD_ENABLED"]],
  ])('conv_mvnu3j932gpohx4 (%s): What happened is the register shortage, not \'"\'', async (_name, flags) => {
    on(...flags);
    const replies = await replay([
      { user: G12_T1, recordedReply: B15_T1_REPLY },
      { user: G12_T2, recordedReply: B15_T2_REPLY },
      G12_T3,
    ]);
    const card = replies.at(-1)!;
    const happened = /\*\*What happened:\*\* ([^\n]*)/.exec(card.content)?.[1] ?? null;
    expect(card.content).not.toMatch(/\*\*What happened:\*\* "\s*(?:\n|$)/);
    if (happened !== null) expect(happened).not.toMatch(PUNCTUATION_ONLY);
    expect(happened ?? "").toMatch(/register was short 8\.65/);
  });
});

describe("BH2: an all-locations account's typed store is the card's store", () => {
  const BH2 = [
    "What does our policy say about attendance?",
    "create a coaching form that is for Buffy Test over tardiness",
    "the location is NE Grand Island",
    "Create a Coaching Form from this conversation.",
  ];

  it("conv_mve3dllz2vq5db8: the coaching card names Grand Island, NE", async () => {
    const replies = await replay(BH2);
    const card = replies.at(-1)!;
    expect(card.formProposal?.templateKey).toBe("coaching");
    expect(card.formProposal?.locationName).toBe("Grand Island, NE");
    expect(card.content).not.toMatch(/covers every (?:store|location)/i);
  });

  it("the turn that names the store already puts it on the card", async () => {
    const replies = await replay(BH2.slice(0, 3));
    expect(replies.at(-1)!.formProposal?.locationName).toBe("Grand Island, NE");
  });
});

describe('conv_mvnssmd12m61nhu: "create an exit" is the Resignation/Exit Form', () => {
  beforeEach(() => {
    account.role = "location_manager";
    account.scope = { level: "location", primaryAreaId: "loc-264", alsoCoversAreaIds: [] };
  });
  afterEach(() => {
    account.role = "admin";
    account.scope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
  });

  it.each([
    "create an exit for Test Employee at dodge last day worked 10-17-26",
    "create an exit for Test Employee",
  ])("%s", async (question) => {
    const [reply] = await replay([question]);
    expect(reply!.formProposal?.templateKey ?? null).not.toBe("dpoa");
    expect(reply!.content).not.toMatch(/Corrective Action Form|Verbal or written\?|Is payroll deduct applicable\?/);
    if (reply!.formProposal) expect(reply!.formProposal.templateKey).toBe("resignation-exit");
    expect(remapShouldRun({ question, history: [], formsTurn: true })).toBe(false);
  });
});

describe("FORM_REQUEST_OVER_ON_FILE_ENABLED reads only a level request as a new form", () => {
  it("is registered and defaults off", async () => {
    const { CHAT_QUALITY_FLAG_NAMES, formRequestOverOnFileEnabled } = await import("@/lib/config/chat-quality-flags");
    expect(CHAT_QUALITY_FLAG_NAMES).toContain("FORM_REQUEST_OVER_ON_FILE_ENABLED");
    expect(formRequestOverOnFileEnabled()).toBe(false);
  });

  it("questions about forms on file stay questions with the flag on", async () => {
    on("FORM_REQUEST_OVER_ON_FILE_ENABLED");
    const { asksOnlyAboutFormsOnFile } = await import("@/lib/forms/chat-form-records");
    expect(asksOnlyAboutFormsOnFile(G12_T1)).toBe(false);
    expect(asksOnlyAboutFormsOnFile("does Test Employee have a previous CA form?")).toBe(true);
    expect(asksOnlyAboutFormsOnFile("was she given a verbal before? any previous coaching on file?")).toBe(true);
    expect(asksOnlyAboutFormsOnFile("how many previous coachings does Test Employee have")).toBe(true);
  });
});

describe("the intent reading (INTENT_EXTRACTION_ENABLED, off in production): the newest store wins, flag on or off", () => {
  const STORES = [
    { id: "loc-264", name: "Omaha, NE (West Dodge Rd)" },
    { id: "loc-67", name: "Bellevue, NE" },
    { id: "loc-236", name: "Grand Island, NE" },
  ];
  const TEMPLATES = [{ key: "dpoa", name: "Corrective Action Form" }];

  async function intentStore(turns: readonly string[]) {
    const { decideIntentTurn } = await import("@/lib/ai/intent-slots");
    let saved = null as Parameters<typeof decideIntentTurn>[0]["saved"];
    let id: string | null = null;
    for (const [index, question] of turns.entries()) {
      const decision = decideIntentTurn({
        question,
        history: turns.slice(0, index).map((content) => ({ role: "user", content })),
        today: "2026-10-25",
        saved,
        raw: null,
        people: [],
        stores: STORES,
        headings: [],
        templates: TEMPLATES,
        formInProgress: index > 0,
      });
      saved = decision.state;
      id = decision.state.locationId ?? null;
    }
    return id;
  }

  it("conv_mvnu3j932gpohx4 T1–T3 with NEWEST_PLACE_TURN_ENABLED: Bellevue, NE", async () => {
    on("NEWEST_PLACE_TURN_ENABLED");
    expect(await intentStore([G12_T1, G12_T2, G12_T3])).toBe("loc-67");
  });

  it("flag off: Bellevue, NE too (this reading already matches the newest store in the text)", async () => {
    expect(await intentStore([G12_T1, G12_T2, G12_T3])).toBe("loc-67");
  });
});

describe("conv_mvnsqglc2v7zuyk: prior coaching the manager typed is never a form on file", () => {
  const T1 =
    "do verbal for team member Test Employee at empire, sd. payroll deduct does not apply. previous coaching jba manual 11-1-26. on 10-22-26 Test was not scheduled to work and came into the store to show her team her new puppy. Test was in the store 45 min";
  const T2 = "jba manual 11-1-25";

  it("on the form path the prior action holds only the manager's words, and no reply says \"on file\"", async () => {
    on("FORM_REQUEST_OVER_ON_FILE_ENABLED", "TYPED_NAME_ENABLED", "REMAP_INCIDENT_FIX_ENABLED", "PRIOR_ACTIONS_PARSE_ENABLED");
    const replies = await replay([T1, T2]);
    expect(replies[0]!.formProposal?.templateKey).toBe("dpoa");
    const card = replies.at(-1)!;
    expect(card.content).toContain("**Prior actions:** Coaching — JBA Policy Manual — 11/01/2025");
    for (const reply of replies) expect(reply.content).not.toMatch(/\bon file\b/i);
  });

  it("without TYPED_NAME_ENABLED, \"do verbal for …\" (no article) is still not read as a form request", async () => {
    on("FORM_REQUEST_OVER_ON_FILE_ENABLED");
    const [reply] = await replay([T1]);
    expect(reply!.formProposal ?? null).toBeNull();
  });
});
