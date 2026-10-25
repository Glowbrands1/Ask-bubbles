import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { ChatFormProposal, ChatMessage } from "@/types";

vi.mock("@/config/company/locations", async () =>
  (await import("@/test/fixtures/reference-roster")).referenceRosterModule(),
);

/**
 * ============================================================================
 * B13, LIVE ON PROD, 25 OCT 2026 — REMAP_INCIDENT_FIX + PRIOR_ACTIONS_PARSE ON
 * ============================================================================
 *
 * The live tester's rows that got worse with both flags on, each manager turn
 * word for word from chat_messages (synthetic employee name), through POST
 * /api/chat on this app's live form path, the full remap
 * (FORM_FULL_REMAP_ENABLED and WARNING_LEVEL_MANAGER_ONLY_ENABLED, on in
 * production). The extraction model is a stand-in that reads no summary, so
 * What happened is this app's own reading.
 *
 *   G11 conv_mvnt9m172krh73y  "jba manual 1-1-95" was 01/01/2095, and What
 *                             happened was "team member at bellevue".
 *   B4  conv_mvnt9by62zckttk  What happened was "jba manual 1-1-26 for
 *                             previous coaching"; a new register-shortage CA
 *                             in the same chat carried the first CA's prior.
 *   Q7  conv_mvnt9uu12rle7pt  What happened was the prior's "being late", not
 *                             "late to open".
 *   H7  conv_mvnt95q52gmu047  What happened was "create a coaching document
 *                             for regarding On 10-16-26 did not complete her
 *                             closing checklist", then the bare repeat request
 *                             "create a coaching document for".
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

/** The form a manager turn names, as the extraction model copies it. */
function namedForm(text: string): string | null {
  if (/policy review/i.test(text)) return "policy-review";
  if (/\bcoaching\b/i.test(text) && !/previous coaching|coached/i.test(text)) return "coaching";
  if (/\bexit\b/i.test(text)) return null;
  if (/\b(?:ca|corrective action)\b/i.test(text)) return "dpoa";
  return null;
}

vi.mock("@/lib/ai/call-claude", () => ({
  callClaude: async () => "A grounded answer.",
  callClaudeTool: async (input: { tool?: { name?: string }; messages?: { content?: unknown }[] }) => {
    if (input.tool?.name !== "record_intent_slots") return null;
    const manager = JSON.stringify(input.messages ?? []).split("Manager:").pop() ?? "";
    return {
      employee: null,
      store: null,
      title: null,
      incidentType: null,
      incidentDate: null,
      payrollAmount: null,
      warningLevel: null,
      formType: /policy review/i.test(manager) ? "Policy Review" : null,
      formTurn: true,
    };
  },
  callClaudeToolDetailed: async (input: { messages?: { content?: unknown }[] }) => {
    const text = JSON.stringify(input.messages ?? []);
    const last = text.split(/Manager:|User:/i).pop() ?? text;
    return {
      input: { templateKey: namedForm(last), employeeName: /test employee/i.test(last) ? "Test Employee" : null, observation: null, actionPlan: null, warningLevel: null },
      inputTokens: 1,
      outputTokens: 1,
    };
  },
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

const PRODUCTION = ["FORM_FULL_REMAP_ENABLED", "WARNING_LEVEL_MANAGER_ONLY_ENABLED"] as const;
const UNDER_TEST = ["REMAP_INCIDENT_FIX_ENABLED", "PRIOR_ACTIONS_PARSE_ENABLED"] as const;
const TODAY = "2026-10-25";

let sequence = 0;
function conversationId(): string {
  sequence += 1;
  return `conv_${Date.now().toString(36)}bt${String(sequence).padStart(3, "0")}`;
}

/** Each turn through POST /api/chat, the browser's whole messages as history. */
async function replay(turns: readonly string[], id = conversationId()) {
  const messages: ChatMessage[] = [];
  const replies: { content: string; formProposal?: ChatFormProposal }[] = [];
  let proposal: ChatFormProposal | null = null;
  for (const [index, user] of turns.entries()) {
    const response = await chatRoute.POST(
      new Request("https://app.test/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: user,
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
      { id: `msg_${Date.now().toString(36)}u${index}x`, role: "user", content: user, createdAt: `${TODAY}T18:00:00Z` } as ChatMessage,
      {
        id: `msg_${Date.now().toString(36)}a${index}x`,
        role: "assistant",
        content: payload.content,
        createdAt: `${TODAY}T18:00:01Z`,
        ...(payload.formProposal ? { formProposal: payload.formProposal } : {}),
      } as ChatMessage,
    );
  }
  return replies;
}

function whatHappened(reply: { content: string }): string | null {
  return /\*\*What happened:\*\*\s*([^\n]+)/.exec(reply.content)?.[1]?.trim() ?? null;
}

function priors(reply: { content: string }): string | null {
  return /\*\*Prior actions:\*\*\s*([^\n]+)/.exec(reply.content)?.[1]?.trim() ?? null;
}

beforeEach(async () => {
  for (const key of Object.keys(store)) (store as Record<string, unknown[]>)[key] = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T18:00:00Z`));
  for (const flag of [...PRODUCTION, ...UNDER_TEST]) vi.stubEnv(flag, "true");
  await ensureTemplateLibrary("system");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const G11 =
  "create a written corrective action for team member Test Employee at bellevue, ne. location. previous coaching jba manual 1-1-95, verbal ca 10-5-26. payroll deduct is applicable and $25 will be payroll deducted for late open on 10-21-26";
const B4 = [
  "create ca form for Test Employee for violating attendance policy on 10-20-26. verbal. no payroll deduct. jba manual 1-1-26 for previous coaching",
  "verbal",
  "create ca form for Test Employee for a register shortage on 10-20-26. payroll deduct applies and $3.25 will be deducted from check. previous coaching - jba policy manual 1-20-26.",
];
const Q7 = "create a CA for Test Employee at Kearney, late to open on 10-20, she was coached on 9-15 for being late";
const H7 = [
  "create a coaching document for Test Employee regarding On 10-16-26 Test Employee did not complete her closing checklist",
  "create a coaching document for Test Employee",
  "create a coaching document for Test Employee",
];

describe("B13 P0 rows, both flags on (production flags too)", () => {
  it("G11 conv_mvnt9m172krh73y: 1-1-95 is 1995, and What happened is the late open, not the person or the store", async () => {
    const [reply] = await replay([G11]);
    expect(priors(reply!)).toBe("Coaching — JBA Policy Manual — 01/01/1995; Verbal corrective action — 10/05/2026");
    // "team member at bellevue" was What happened; the payroll answer says what it is for.
    expect(whatHappened(reply!)).toBe("late open");
  });

  it("B4 conv_mvnt9by62zckttk turns 1-2: the prior is never What happened", async () => {
    const [first, second] = await replay(B4.slice(0, 2));
    for (const reply of [first!, second!]) {
      expect(whatHappened(reply)).toBe("violating attendance policy");
      expect(priors(reply)).toBe("Coaching — JBA Policy Manual — 01/01/2026");
    }
  });

  it("B4 conv_mvnt9by62zckttk turn 3: a new CA with its own incident starts with its own prior only", async () => {
    const third = (await replay(B4)).at(-1)!;
    // Production listed "01/01/2026; … 01/20/2026": the first CA's prior rode on.
    expect(whatHappened(third!)).toBe("register shortage");
    expect(priors(third!)).toBe("Coaching — JBA Policy Manual — 01/20/2026");
  });

  it("Q7 conv_mvnt9uu12rle7pt: What happened keeps the incident's own words, late to open", async () => {
    const [reply] = await replay([Q7]);
    expect(whatHappened(reply!)).toBe("late to open");
    expect(priors(reply!)).toBe("Coaching for being late — 09/15/2026");
  });

  it("H7 conv_mvnt95q52gmu047: the request words go, and a bare repeat request keeps the incident", async () => {
    const replies = await replay(H7);
    for (const reply of replies) {
      expect(whatHappened(reply)).toBe("did not complete her closing checklist");
    }
  });
});

/*
 * B16, live on prod 25 Oct 2026, with pairs 1-4 on: REMAP_INCIDENT_FIX,
 * PRIOR_ACTIONS_PARSE, CA_TEMPLATE_MAP, FORM_CHOICE_STATED, KEEP_FORM_EMPLOYEE,
 * LATE_OPEN_DATE, PLACE_SPAN_GUARD and TITLE_WHOLE_WORD.
 *
 *   conv_mvnub78w2aellap  turn 2 gave only the warning level, the prior and
 *                         the payroll answer; What happened became "Her".
 *   conv_mvnuc0z025sotrk  a numbered intake; What happened became "test
 *                         employee 2.today 3. i have observed test employee
 *                         running late to her shifts 4".
 */
const B16 = [
  "CA_TEMPLATE_MAP_ENABLED",
  "FORM_CHOICE_STATED_ENABLED",
  "KEEP_FORM_EMPLOYEE_ENABLED",
  "LATE_OPEN_DATE_ENABLED",
  "PLACE_SPAN_GUARD_ENABLED",
  "TITLE_WHOLE_WORD_ENABLED",
] as const;

describe("B16 rows, pairs 1-4 on (production flags too)", () => {
  beforeEach(() => {
    for (const flag of B16) vi.stubEnv(flag, "true");
  });

  it("conv_mvnub78w2aellap: a turn of only the warning level, the prior and the payroll answer keeps the incident", async () => {
    const replies = await replay([
      "I need a CA form for Test Employee at Kearney for being out of dress code on October 11",
      "This is a verbal warning. Her prior coaching is her policy manual ackwnelegement on 9/01. payroll deduction is not applicable.",
      "Use Kearney as the location",
    ]);
    expect(whatHappened(replies[0]!)).toBe("being out of dress code on October 11");
    for (const reply of replies.slice(1)) {
      expect(whatHappened(reply)).toBe("being out of dress code on October 11");
      // Rule (a): the manager's own word stays on the prior line.
      expect(priors(reply)).toBe("Coaching — JBA Policy Manual ackwnelegement — 09/01/2026");
    }
  });

  it("conv_mvnuc0z025sotrk: a numbered intake is read item by item", async () => {
    const [, reply] = await replay([
      "create a coaching form",
      "1. test employee 2.today 3. i have observed test employee running late to her shifts 4. kearney",
    ]);
    expect(whatHappened(reply!)).toBe("running late to her shifts");
    expect(reply!.formProposal?.employeeName ?? "").toMatch(/test employee/i);
    expect(reply!.content).toMatch(/\*\*Store:\*\* (?:NE )?Kearney/);
    expect(reply!.formProposal?.formDate ?? null).toBe(TODAY);
  });
});

/*
 * B17 (pairs 1-5 on, DRAFT_ACTIONS + CONVERSATION_DRAFT_REUSE among them),
 * conv_mvnuh50i2hanl53 turn 3: a new incident carried incident 1's "Verbal
 * Warning, as you said" and "No, as you said", and What happened read
 * "different incident: no call no show". QA: a new incident starts with no
 * warning level, payroll or priors unless typed for it.
 */
describe("B17: a different incident starts its own form", () => {
  beforeEach(() => {
    for (const flag of [...B16, "DRAFT_ACTIONS_ENABLED", "CONVERSATION_DRAFT_REUSE_ENABLED"]) vi.stubEnv(flag, "true");
  });

  it("conv_mvnuh50i2hanl53: no warning level or payroll from incident 1, and no \"different incident:\"", async () => {
    const replies = await replay([
      "create a CA for Test Employee at Kearney for being late to open on 10-20-26, verbal, no payroll",
      "add that she was also on her phone",
      "create a corrective action for Test Employee for a different incident: no call no show on 10-22-26",
    ]);
    expect(replies[0]!.content).toMatch(/Type of warning:\*\* Verbal Warning, as you said/);
    const third = replies[2]!;
    expect(whatHappened(third)).toBe("no call no show");
    expect(third.formProposal?.formDate).toBe("2026-10-22");
    expect(third.content).not.toMatch(/Type of warning:\*\*|Payroll deduct:\*\*/);
    expect(third.formProposal?.warningLevel ?? null).toBeNull();
    expect(third.formProposal?.payrollDeduct ?? null).toBeNull();
  });
});

/* QA S20, S3, S22, S23, G10, S14, B18 and two leftovers: the request, a slot answer or the plan is never What happened. */
describe("What happened is the incident only (QA, 25 Oct 2026)", () => {
  beforeEach(() => {
    for (const flag of B16) vi.stubEnv(flag, "true");
  });

  it.each([
    // S20 conv_mvnuhq2r2qzjtdg: was "create a second coaching form for for being late".
    ["create a second coaching form for Test Employee at Kearney for being late on 10-22-26, she already has a coaching form from 10-15-26", "being late"],
    // S22 conv_mvnt83f02depar5: was "citing the Standards of Conduct for missing the woven deadline".
    ["create a CA for Test Employee at Kearney citing the Standards of Conduct for missing the woven deadline on 10-15-26", "missing the woven deadline"],
    // G10 conv_mvnt901z2sicurz: was the whole request, name sentence included (synthetic name).
    ["create a coaching citing dress code violation on 10-15-26. Team Members name is Testy Testerson", "dress code violation"],
    // B18 conv_mvnuqsc52eknfah: was the action plan, and the form was dated 10-30.
    ["create a written CA for Test Employee at Kearney for missing the 10-15-26 woven deadline. action plan: complete the Woven policy module by 10-30-26 and review it with her manager", "missing the 10-15-26 woven deadline"],
    // S14 conv_mvnt7yh522460kh: was empty.
    ["create a coaching form for Test Employee at Kearney: on 10-20-26 she did not restock the bath bombs before close and left the shelf empty for the morning shift", "she did not restock the bath bombs before close and left the shelf empty for the morning shift"],
    // BH5 conv_mvikc78w58v710y (synthetic name; the closing curly quote is the manager's): was ". payroll deduct not applicable"".
    ["create a written CA for Test Employee for not attending the monthly meeting on 12-20-26. previous coaching: jba policy manual 5-8-26, verbal ca 10-2-26. payroll deduct not applicable”", "not attending the monthly meeting"],
  ])("%s", async (said, expected) => {
    const [reply] = await replay([said]);
    expect(whatHappened(reply!)).toBe(expected);
  });

  it("B18: the form is dated the incident, not the plan's due date, and the plan stays verbatim", async () => {
    vi.stubEnv("ACTION_PLAN_MANAGER_ONLY_ENABLED", "true");
    const [reply] = await replay([
      "create a written CA for Test Employee at Kearney for missing the 10-15-26 woven deadline. action plan: complete the Woven policy module by 10-30-26 and review it with her manager",
    ]);
    expect(reply!.formProposal?.formDate).toBe("2026-10-15");
    expect(reply!.content).toContain("complete the Woven policy module by 10-30-26 and review it with her manager");
  });

  it("S3 conv_mvnt7jx72gan2i2: \"use today's date\" is the date, not What happened", async () => {
    const [reply] = await replay(["create a coaching form for Test Employee, team member at Kearney, use today's date"]);
    expect(whatHappened(reply!)).toBeNull();
    expect(reply!.formProposal?.formDate).toBe(TODAY);
  });

  it("S23 conv_mvnt86tb2r30asu: \"it is for …\" and \"the policy violated is …\" are answers, not What happened", async () => {
    const replies = await replay(["create a CA", "it is for Test Employee at Kearney", "the policy violated is standards of conduct"]);
    for (const reply of replies) expect(whatHappened(reply)).toBeNull();
  });

  it("\"employee name is …\" on the turn after a missed name is never What happened", async () => {
    const replies = await replay(["create a CA for being late to open on 10-20-26", "employee name is Test Employee"]);
    expect(whatHappened(replies[1]!)).toBe("being late to open");
  });
});

/*
 * QA B9, conv_mvnt8fgs2gh96uh (both flags on): "On the first shift I verbally
 * coached her" was no prior action. It is a verbal coaching on the first of
 * the two dates, in the manager's words (rule (a)); the form is dated 10/15.
 */
describe("B9: a coaching the manager held on the first shift is a prior action", () => {
  it("conv_mvnt8fgs2gh96uh turn 1", async () => {
    const [reply] = await replay([
      "My employee Test Employee has was 10 minutes late on her last two shifts. On the first shift I verbally coached her on our policy and expectations. Then she was late again. Please create a CA form so I can document. She was late on 10/5 and 10/15",
    ]);
    expect(priors(reply!)).toBe("Verbal coaching — 10/05/2026");
    expect(reply!.formProposal?.formDate).toBe("2026-10-15");
  });

  it("a bare \"verbal\" turn is still no prior action (rule (b))", async () => {
    const replies = await replay(["create a CA for Test Employee at Kearney for being late on 10/15", "verbal"]);
    expect(priors(replies[1]!)).toBeNull();
  });
});
