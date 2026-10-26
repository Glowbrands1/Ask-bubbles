import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import { humanPhrases } from "@/lib/ai/human-replies";
import type { ChatFormProposal, ChatMessage } from "@/types";

vi.mock("@/config/company/locations", async () =>
  (await import("@/test/fixtures/reference-roster")).referenceRosterModule(),
);

/**
 * ============================================================================
 * HUMAN REPLIES — A FORM CHAT SAYS ITS OPENER ONCE (PORTED FROM ASK SUNNY)
 * ============================================================================
 *
 * The owner, 26 Oct 2026: "humanize it". Ask Sunny's tester read the same
 * opener after every manager message of a form chat; this app builds the same
 * openers, on the full remap ("Here is the Corrective Action Form.") and on
 * the proposal path ("I'll draft a Corrective Action Form for … from what
 * you've described, …").
 *
 * With HUMAN_REPLIES_ENABLED the first card turn is as built; each later turn
 * for the same form and employee says what changed in one line ("Got it — the
 * date's 10/14."), leaves out what the manager already read and keeps every
 * question. The card is the same with the flag on or off.
 *
 * Every turn goes through POST /api/chat, in all lowercase and in sentence
 * case. The extraction model returns what the manager has said so far.
 * Faked: identity, the database (in memory), the models, analytics.
 * Synthetic names.
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
  /** What the full remap's extraction model reads from the conversation so far. */
  extract: {} as Record<string, unknown>,
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
      formType: null,
      formTurn: false,
      policyHeading: null,
    };
  },
  callClaudeToolDetailed: async () => ({
    input: bag.extract,
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


const FLAG = "HUMAN_REPLIES_ENABLED";
const PROFILES: readonly (readonly [string, readonly string[]])[] = [
  ["the full remap (production)", ["FORM_FULL_REMAP_ENABLED"]],
  ["the proposal path", []],
];
const ALL_FLAGS = ["FORM_FULL_REMAP_ENABLED", FLAG];
const saved = new Map<string, string | undefined>();

let sequence = 0;
function conversationId(): string {
  sequence += 1;
  return `conv_${Date.now().toString(36)}hr${String(sequence).padStart(3, "0")}`;
}

type Reply = { content: string; formProposal?: ChatFormProposal };

/** One manager turn, and what the extraction model reads once it is said. */
interface Step {
  readonly user: string;
  readonly reads: Record<string, unknown>;
}

/** Each turn through POST /api/chat, the browser's whole messages as history. */
async function replay(steps: readonly Step[]): Promise<Reply[]> {
  const id = conversationId();
  const messages: ChatMessage[] = [];
  const replies: Reply[] = [];
  let proposal: ChatFormProposal | null = null;
  for (const [index, step] of steps.entries()) {
    bag.extract = step.reads;
    const response = await chatRoute.POST(
      new Request("https://app.test/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: step.user,
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
    messages.push(
      { id: `msg_${Date.now().toString(36)}u${index}x`, role: "user", content: step.user, createdAt: "2026-10-26T12:24:00Z" } as ChatMessage,
      {
        id: `msg_${Date.now().toString(36)}a${index}x`,
        role: "assistant",
        content: payload.content,
        createdAt: "2026-10-26T12:24:01Z",
        ...(payload.formProposal ? { formProposal: payload.formProposal } : {}),
      } as ChatMessage,
    );
  }
  return replies;
}

beforeEach(async () => {
  for (const key of Object.keys(store)) (store as Record<string, unknown[]>)[key] = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-26T12:30:00Z"));
  for (const name of ALL_FLAGS) saved.set(name, process.env[name]);
  bag.extract = {};
  await ensureTemplateLibrary("system");
});
afterEach(() => {
  vi.useRealTimers();
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function useProfile(flags: readonly string[], fix: boolean) {
  for (const name of ALL_FLAGS) delete process.env[name];
  for (const name of flags) process.env[name] = "true";
  if (fix) process.env[FLAG] = "true";
}

const BASE = {
  templateKey: "dpoa",
  employeeName: "Avery Testperson",
  observation: "Opened the store late.",
  actionPlan: null,
  warningLevel: "verbal",
};
const CA_CHAT: readonly Step[] = [
  { user: "create verbal CA for Avery Testperson, late opening the store today", reads: BASE },
  { user: "no deduct", reads: { ...BASE, payrollDeduct: "no" } },
  { user: "date is 10/14", reads: { ...BASE, payrollDeduct: "no", incidentDateIso: "2026-10-14" } },
  { user: "change it to written", reads: { ...BASE, payrollDeduct: "no", incidentDateIso: "2026-10-14", warningLevel: "written" } },
];

function typed(steps: readonly Step[]): [string, readonly Step[]][] {
  const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
  return [
    ["lowercase", steps.map((step) => ({ ...step, user: step.user.toLowerCase() }))],
    ["sentence case", steps.map((step) => ({ ...step, user: sentence(step.user) }))],
  ];
}

/** Main's openers, and what the manager reads instead. */
const OPENERS: [string, string][] = [
  ["Here is the Corrective Action Form.", "Here's the Corrective Action Form."],
  ["I'll draft a **Corrective Action Form** for", "Here's the **Corrective Action Form** for"],
];
const LONG_NOTICE = "nothing is saved to anyone's file until you do.";
const SHORT_NOTICE = "Nothing's saved until you tap **Create draft**.";

/** The card without its random id: the same with the flag on or off. */
function card(proposal: ChatFormProposal | undefined) {
  return proposal ? { ...proposal, proposalId: "" } : proposal;
}

function count(text: string, part: string): number {
  return text.split(part).length - 1;
}

describe.each(PROFILES)("(1) the opener is said once (%s)", (_label, flags) => {
  describe.each(typed(CA_CHAT))("Corrective Action, %s", (_case, steps) => {
    it("turn 1 is as built; each later turn says what changed; the card is the same", async () => {
      useProfile(flags, false);
      const before = await replay(steps);
      useProfile(flags, true);
      const after = await replay(steps);

      const pair = OPENERS.find(([main]) => before[0]!.content.startsWith(main));
      expect(pair, before[0]!.content).toBeDefined();
      const [opener, human] = pair!;
      // Before: the opener on every turn.
      for (const reply of before) expect(reply.content.startsWith(opener), reply.content).toBe(true);

      // After: turn 1 is main's in the phrase table's words, and its opener is said once in the chat.
      expect(after[0]!.content).toBe(humanPhrases(before[0]!.content));
      const chat = after.map((reply) => reply.content).join("\n\n");
      expect(count(chat, opener)).toBe(0);
      expect(count(chat, human)).toBe(1);
      expect(count(chat, LONG_NOTICE)).toBe(0);
      // Never "JB & Associates" in this app.
      expect(chat).not.toContain("JB & Associates");
      expect(after[1]!.content.split("\n")[0]).toBe("Got it — no payroll deduct.");
      expect(after[2]!.content.split("\n")[0]).toBe("Got it — the date's 10/14.");
      expect(after[3]!.content.split("\n")[0]).toBe("Got it — it's a written warning.");
      for (const reply of after.slice(1)) {
        // (2) Answered, so not asked again.
        expect(reply.content).not.toContain("I won't answer it for you");
        expect(reply.content).not.toMatch(/^Is payroll deduct applicable\?$/m);
        if (after[0]!.content.includes(SHORT_NOTICE)) expect(reply.content).toContain(SHORT_NOTICE);
      }

      // The card itself does not change.
      after.forEach((reply, index) => expect(card(reply.formProposal)).toEqual(card(before[index]!.formProposal)));
    });
  });
});
