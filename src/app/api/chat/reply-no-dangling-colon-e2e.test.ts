import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";

vi.mock("@/config/company/locations", async () =>
  (await import("@/test/fixtures/reference-roster")).referenceRosterModule(),
);

/**
 * ============================================================================
 * A CHAT REPLY NEVER ENDS ON A LEAD-IN COLON WITH NOTHING AFTER IT — 26 OCT 2026
 * ============================================================================
 *
 * QA live finding on Ask Bubbles (4/4 chats, conv_mvop6trc2lbk8yz and
 * conv_mvop7h1s28j9ega). The manager typed
 *
 *   "ca for test employee at kearney, late today, previous coaching verbal 6/25"
 *
 * No card opened, and the reply ended on "Based on what you've described, I
 * can prepare:" with nothing after the colon. Which card that turn should
 * open is another change; this file pins the reply text only.
 *
 * Through POST /api/chat with the answering model mocked to return QA's
 * reply. No published form is offered in these chats, so no card comes with
 * the turn, as on QA's chats; the card case below seeds the library so the
 * server's own form picker follows the colon. "test employee" is an invented
 * name.
 *
 * REPLY_NO_DANGLING_COLON_ENABLED on: the dangling lead-in is gone and every
 * other word is kept. A list after the colon, "at 10:30", a colon mid-text, a
 * reply that is only the lead-in, a reply with a card and code fences are
 * left alone. Off: the reply is exactly main's.
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

const bag = vi.hoisted(() => ({ reply: "" }));

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
  callClaude: async () => bag.reply,
  callClaudeTool: async () => null,
  callClaudeToolDetailed: async () => ({
    input: { templateKey: null, employeeName: null, observation: null, actionPlan: null, warningLevel: null },
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
const { withoutDanglingColon } = await import("@/lib/ai/reply-dangling-colon");
const chatRoute = await import("./route");

const FLAG = "REPLY_NO_DANGLING_COLON_ENABLED";
let saved: string | undefined;

/** QA's exact wording, and the same in sentence case. */
const QA_WORDING = "ca for test employee at kearney, late today, previous coaching verbal 6/25";
const SENTENCE_CASE = "Ca for test employee at Kearney, late today, previous coaching verbal 6/25";
const WORDINGS = [
  ["QA's exact wording", QA_WORDING],
  ["sentence case", SENTENCE_CASE],
] as const;

const LEAD_IN = "Based on what you've described, I can prepare:";

const BODY =
  "Thanks for the details. Test Employee was late today at the Kearney store, and there is a previous verbal " +
  "coaching on 6/25, so the next step is a Corrective Action.";
const MARKDOWN_BODY =
  "**Late arrival — Test Employee, Kearney store**\n\n" +
  "Being late today follows a verbal coaching on 6/25, so this is the next step under the attendance policy.";

/** QA's reply as the model wrote it, and what is left with the flag on. */
const QA_REPLIES = [
  ["plain text", `${BODY}\n\n${LEAD_IN}`, BODY],
  ["markdown, bold lead-in", `${MARKDOWN_BODY}\n\n**${LEAD_IN}**`, MARKDOWN_BODY],
  ["markdown, lead-in on its own line with trailing spaces", `${MARKDOWN_BODY}\n${LEAD_IN}  \n\n`, MARKDOWN_BODY],
  [
    "the lead-in as the last sentence of the line",
    `Late today after a verbal coaching on 6/25 is the next step for Test Employee. ${LEAD_IN}`,
    "Late today after a verbal coaching on 6/25 is the next step for Test Employee.",
  ],
  [
    "the lead-in as the last sentence of a bold line",
    `**Late today after a verbal coaching on 6/25 is the next step. ${LEAD_IN}**`,
    "**Late today after a verbal coaching on 6/25 is the next step.**",
  ],
] as const;

/** Replies that must come back exactly as the model wrote them, flag on or off. */
const NEVER_BREAK = [
  [
    "a list after the colon",
    `${LEAD_IN}\n\n- A Corrective Action Form for Test Employee\n- A Coaching Form for the Kearney store`,
  ],
  ["a time at the end", "Please meet with Test Employee at the Kearney store before the shift at 10:30"],
  [
    "a colon mid-text",
    "Note: being late today follows the verbal coaching on 6/25. Bubbles can prepare the Corrective Action Form when you are ready.",
  ],
  ["a reply that is only the lead-in", LEAD_IN],
  ["a reply that is only the bold lead-in", `**${LEAD_IN}**`],
  ["a closed code fence", `${LEAD_IN}\n\n\`\`\`\nCorrective Action Form:\n\`\`\``],
  ["an open code fence", `Here is the template text.\n\n\`\`\`\n${LEAD_IN}`],
  ["a run of labels to fill in", "To prepare it I need:\nEmployee name:\nIncident date:"],
  ["a list item that ends on a colon", "Before the meeting:\n- Bring the 6/25 verbal coaching:"],
] as const;

let sequence = 0;
function conversationId(): string {
  sequence += 1;
  return `conv_${Date.now().toString(36)}dc${String(sequence).padStart(3, "0")}`;
}

interface Reply {
  content: string;
  formSelection?: unknown;
  formProposal?: unknown;
  formProposals?: unknown;
  error?: string;
}

/** One manager turn through POST /api/chat, the model answering `reply`. */
async function ask(question: string, reply: string): Promise<Reply> {
  bag.reply = reply;
  const response = await chatRoute.POST(
    new Request("https://app.test/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question,
        mode: "standard",
        history: [],
        questionMessageId: `msg_${Date.now().toString(36)}u${sequence}x`,
        conversationId: conversationId(),
      }),
    }),
  );
  const payload = (await response.json()) as Reply;
  expect(response.status, JSON.stringify(payload)).toBe(200);
  return payload;
}

/** No dangling lead-in: the last non-empty line, without markdown, does not end on ":". */
function endsOnColon(content: string): boolean {
  const lines = content.split("\n").filter((line) => line.trim() !== "");
  return (lines.at(-1) ?? "").replace(/[\s*_`~]+$/, "").endsWith(":");
}

beforeEach(() => {
  for (const key of Object.keys(store)) (store as Record<string, unknown[]>)[key] = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-26T15:10:00Z"));
  saved = process.env[FLAG];
  delete process.env[FLAG];
  bag.reply = "";
});
afterEach(() => {
  vi.useRealTimers();
  if (saved === undefined) delete process.env[FLAG];
  else process.env[FLAG] = saved;
});

describe("REPLY_NO_DANGLING_COLON_ENABLED on: QA's chat never ends on the lead-in", { timeout: 60_000 }, () => {
  beforeEach(() => {
    process.env[FLAG] = "true";
  });

  describe.each(WORDINGS)("%s", (_name, question) => {
    it.each(QA_REPLIES)("%s: the dangling line is gone and the rest is kept", async (_shape, modelReply, kept) => {
      const reply = await ask(question, modelReply);
      expect(reply.formSelection ?? reply.formProposal ?? null).toBeNull();
      expect(reply.content).toBe(kept);
      expect(reply.content).not.toContain(LEAD_IN);
      expect(endsOnColon(reply.content)).toBe(false);
    });

    it.each(NEVER_BREAK)("never breaks %s", async (_shape, modelReply) => {
      const reply = await ask(question, modelReply);
      expect(reply.content).toBe(modelReply);
    });
  });

  it("a reply that carries a card is left alone: the form picker follows the colon", async () => {
    await ensureTemplateLibrary("system");
    const on = await ask(QA_WORDING, `${BODY}`);
    expect(on.formSelection).toBeTruthy();
    expect(on.content).toBe(`${BODY}\n\n${LEAD_IN}`);
    delete process.env[FLAG];
    const off = await ask(QA_WORDING, `${BODY}`);
    expect(on).toEqual(off);
  });
});

describe("REPLY_NO_DANGLING_COLON_ENABLED off: the reply is main's", { timeout: 60_000 }, () => {
  describe.each(WORDINGS)("%s", (_name, question) => {
    it.each([...QA_REPLIES.map(([shape, modelReply]) => [shape, modelReply] as const), ...NEVER_BREAK])(
      "%s comes back exactly as the model wrote it",
      async (_shape, modelReply) => {
        const reply = await ask(question, modelReply);
        // The answer path already trims the reply's trailing whitespace on main.
        expect(reply.content).toBe(modelReply.trimEnd());
      },
    );
  });

  it("QA's reply still ends on the lead-in, as on the live chats", async () => {
    const reply = await ask(QA_WORDING, `${BODY}\n\n${LEAD_IN}`);
    expect(endsOnColon(reply.content)).toBe(true);
  });
});

describe("withoutDanglingColon, the hook the chat route calls", () => {
  const dangling = { content: `${BODY}\n\n${LEAD_IN}`, citations: [] };

  it("off: the same object", () => {
    expect(withoutDanglingColon(dangling)).toBe(dangling);
  });

  it.each([
    ["formProposal", { formProposal: { templateKey: "dpoa" } }],
    ["formProposals", { formProposals: [{ templateKey: "dpoa" }, { templateKey: "coaching" }] }],
    ["formSelection", { formSelection: { primary: { templateKey: "dpoa" }, additional: [] } }],
    ["formUpdate", { formUpdate: { instanceId: "inst-1", updated: ["issue"] } }],
    ["formOpened", { formOpened: { instanceId: "inst-1" } }],
  ] as const)("on: a reply with a card (%s) is the same object", (_name, card) => {
    process.env[FLAG] = "true";
    const reply = { ...dangling, ...card };
    expect(withoutDanglingColon(reply)).toBe(reply);
  });

  it("on: a reply without a card loses only its lead-in and keeps its other fields", () => {
    process.env[FLAG] = "true";
    const reply = { ...dangling, coverage: "grounded" as const, formProposals: [] };
    expect(withoutDanglingColon(reply)).toEqual({ ...reply, content: BODY });
  });

  it("on: never returns an empty reply", () => {
    process.env[FLAG] = "true";
    for (const content of [LEAD_IN, `**${LEAD_IN}**`, `  ${LEAD_IN}  \n\n`, "", "   "]) {
      expect(withoutDanglingColon({ content }).content).toBe(content);
    }
  });
});
