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

/* ========================================================================= */
/* Registers: the same manager words typed all lowercase or in sentence case */
/* ========================================================================= */

/**
 * Every B13 row above, typed (1) all lowercase and (2) in sentence case with
 * the names typed lowercase or Capitalized. Names and keywords read the same
 * either way, so every outcome is the one the production wording gets.
 */
type Register = readonly [label: string, type: (text: string) => string];

const NAMES = ["test employee", "bellevue", "kearney"];

function sentenceCase(text: string, capitalizeNames: boolean): string {
  let out = text.toLowerCase();
  if (capitalizeNames) {
    for (const name of NAMES) {
      out = out.replace(new RegExp(`\\b${name}\\b`, "g"), name.replace(/\b[a-z]/g, (letter) => letter.toUpperCase()));
    }
  }
  return out.replace(/(^|[.!?]\s+)([a-z])/g, (_match, lead: string, letter: string) => `${lead}${letter.toUpperCase()}`);
}

const REGISTERS: readonly Register[] = [
  ["all lowercase", (text) => text.toLowerCase()],
  ["sentence case, names lowercase", (text) => sentenceCase(text, false)],
  ["sentence case, names Capitalized", (text) => sentenceCase(text, true)],
];

describe("B13 P0 rows in every register, both flags on (production flags too)", () => {
  it.each(REGISTERS)("%s: G11, 1-1-95 is 1995 and What happened is the late open", async (_label, type) => {
    const [reply] = await replay([type(G11)]);
    expect(priors(reply!)).toBe("Coaching — JBA Policy Manual — 01/01/1995; Verbal corrective action — 10/05/2026");
    expect(whatHappened(reply!)).toBe("late open");
  });

  it.each(REGISTERS)("%s: B4 turn 1, the prior is never What happened", async (_label, type) => {
    const [first] = await replay(B4.slice(0, 1).map(type));
    expect(whatHappened(first!)).toBe("violating attendance policy");
    expect(priors(first!)).toBe("Coaching — JBA Policy Manual — 01/01/2026");
    expect(first!.formProposal?.employeeName?.toLowerCase()).toBe("test employee");
  });

  it.each(REGISTERS.filter(([label]) => label.endsWith("names Capitalized")))(
    "%s: B4 turn 2 (\"verbal\"), the prior is never What happened",
    async (_label, type) => {
      const [, second] = await replay(B4.slice(0, 2).map(type));
      expect(whatHappened(second!)).toBe("violating attendance policy");
      expect(priors(second!)).toBe("Coaching — JBA Policy Manual — 01/01/2026");
    },
  );

  /*
   * PINNED, NOT THE WANTED OUTCOME (registers, 26 Oct 2026). With the name
   * typed lowercase, the bare "verbal" turn re-reads the employee from the
   * whole chat, and the remap's name reader (`personPhrase` /
   * `statedPerson` in form-full-remap.ts, "for" + a Capitalized name) does
   * not see "for test employee": it falls back to "test", so only "test" is
   * taken out of What happened. That reader is outside this PR's flags and
   * KEEP_FORM_EMPLOYEE_ENABLED does not change it, so it is pinned here as it
   * is; the wanted outcome is the Capitalized row above. The prior stays out
   * of What happened either way, which is what B4 is about.
   */
  it.each(REGISTERS.filter(([label]) => !label.endsWith("names Capitalized")))(
    "%s: B4 turn 2 (\"verbal\") — PINNED: a lowercase name is cut to its first word",
    async (_label, type) => {
      const [, second] = await replay(B4.slice(0, 2).map(type));
      expect(whatHappened(second!)).toBe("employee for violating attendance policy");
      expect(second!.formProposal?.employeeName).toBe("test");
      expect(priors(second!)).toBe("Coaching — JBA Policy Manual — 01/01/2026");
    },
  );

  it.each(REGISTERS)("%s: B4 turn 3, a new CA starts with its own prior only", async (_label, type) => {
    const third = (await replay(B4.map(type))).at(-1)!;
    expect(whatHappened(third!)).toBe("register shortage");
    expect(priors(third!)).toBe("Coaching — JBA Policy Manual — 01/20/2026");
  });

  it.each(REGISTERS)("%s: Q7, What happened is late to open", async (_label, type) => {
    const [reply] = await replay([type(Q7)]);
    expect(whatHappened(reply!)).toBe("late to open");
    expect(priors(reply!)).toBe("Coaching for being late — 09/15/2026");
  });

  it.each(REGISTERS)("%s: H7, the request words go and a bare repeat keeps the incident", async (_label, type) => {
    const replies = await replay(H7.map(type));
    for (const reply of replies) {
      expect(whatHappened(reply)).toBe("did not complete her closing checklist");
    }
  });
});
