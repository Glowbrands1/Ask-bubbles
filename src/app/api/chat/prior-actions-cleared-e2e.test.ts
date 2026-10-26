import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { ChatFormProposal, ChatMessage } from "@/types";

vi.mock("@/config/company/locations", async () =>
  (await import("@/test/fixtures/reference-roster")).referenceRosterModule(),
);

/**
 * ============================================================================
 * PRIOR_ACTIONS_RETAINED_ENABLED — "NO PRIOR COACHING" CLEARS A LISTED PRIOR
 * ============================================================================
 *
 * Ported from the sibling app. Replayed through POST /api/chat on this app's
 * live form path (the full remap): a prior stated in turn 2 ("prior coaching
 * JBA Policy Manual 7-29-26") stays on the card through every slot answer,
 * and also through "no prior coaching" and "remove the prior", which should
 * clear it. On, they do; a removal asked as a question, one about somebody
 * else, and "add the prior back" do not clear it. Off, as on main (pinned).
 *
 * Faked: identity (a store manager), the database (in memory), the models,
 * analytics. The slot model copies the manager's words. Invented names.
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
  /** The extraction model keeps the conversation's employee on a turn that names nobody new for the form. */
  keepsEmployee: false,
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
  callClaudeTool: async () => null,
  callClaudeToolDetailed: async (input: { messages?: { content?: unknown }[] }) => {
    const text = JSON.stringify(input.messages ?? []);
    const last = text.split(/Manager:|User:/i).pop() ?? text;
    return {
      input: {
        templateKey: /corrective action/i.test(text) ? "dpoa" : bag.guess,
        employeeName: /mara quill/i.test(bag.keepsEmployee ? text : last) ? "Mara Quill" : null,
        observation: null,
        actionPlan: null,
      },
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

const FLAG = "PRIOR_ACTIONS_RETAINED_ENABLED";
/** This app's live form path: the full remap, with the prior-actions reader; and with the remap fixes as well. */
const PROFILES = [
  ["full remap", ["FORM_FULL_REMAP_ENABLED", "PRIOR_ACTIONS_PARSE_ENABLED"]],
  ["full remap + remap fixes", ["FORM_FULL_REMAP_ENABLED", "PRIOR_ACTIONS_PARSE_ENABLED", "REMAP_INCIDENT_FIX_ENABLED", "MANAGER_WORDS_ONLY_ENABLED"]],
] as const;
const ALL = [FLAG, "FORM_FULL_REMAP_ENABLED", "PRIOR_ACTIONS_PARSE_ENABLED", "REMAP_INCIDENT_FIX_ENABLED", "MANAGER_WORDS_ONLY_ENABLED", "INTENT_EXTRACTION_ENABLED"];
const saved = new Map<string, string | undefined>();

type Reply = { content: string; formProposal?: ChatFormProposal };

let sequence = 0;

/** One new chat, every turn through POST /api/chat, the browser's messages as history. */
async function chat(turns: readonly string[]): Promise<Reply[]> {
  sequence += 1;
  const conversationId = `conv_${Date.now().toString(36)}pc${String(sequence).padStart(3, "0")}`;
  const messages: ChatMessage[] = [];
  const replies: Reply[] = [];
  let proposal: ChatFormProposal | null = null;
  for (const [index, question] of turns.entries()) {
    const id = `m${index}`;
    const response = await chatRoute.POST(
      new Request("https://app.test/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question,
          mode: "standard",
          history: messages.map(({ id: messageId, role, content }) => ({ id: messageId, role, content })),
          questionMessageId: id,
          conversationId,
          ...(proposal ? { continueProposalTemplateKey: proposal.templateKey } : {}),
        }),
      }),
    );
    const payload = (await response.json()) as Reply & { error?: string };
    expect(response.status, JSON.stringify(payload)).toBe(200);
    messages.push(
      { id, role: "user", content: question, createdAt: "2026-10-26T03:41:30Z" } as ChatMessage,
      {
        id: `a${index}`,
        role: "assistant",
        content: payload.content,
        createdAt: "2026-10-26T03:41:40Z",
        ...(payload.formProposal ? { formProposal: payload.formProposal } : {}),
      } as ChatMessage,
    );
    if (payload.formProposal) proposal = payload.formProposal;
    replies.push(payload);
  }
  return replies;
}

const T1 = "create a verbal corrective action for mara quill for missing the 10-15 closing checklist";
const T2 = "prior coaching JBA Policy Manual 7-29-26";
const COACHING = /Coaching — JBA Policy Manual — 07\/29\/2026/i;
const priors = (reply: Reply) => reply.formProposal?.priorActions ?? null;

const CASINGS = [
  ["lowercase", (turn: string) => turn.toLowerCase()],
  ["Sentence case", (turn: string) => turn.charAt(0).toUpperCase() + turn.slice(1)],
  ["CAPS", (turn: string) => turn.toUpperCase()],
] as const;
const EVERY = PROFILES.flatMap(([profile, flags]) => CASINGS.map(([casing, cased]) => [`${profile}, ${casing}`, flags, cased] as const));

beforeEach(async () => {
  for (const key of Object.keys(store)) store[key] = [];
  bag.keepsEmployee = false;
  for (const name of ALL) saved.set(name, process.env[name]);
  for (const name of ALL) delete process.env[name];
  await ensureTemplateLibrary("system");
});
afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function useProfile(flags: readonly string[], on: boolean) {
  for (const name of flags) process.env[name] = "1";
  if (on) process.env[FLAG] = "1";
}

describe("flag on: a removal clears the listed prior", () => {
  it.each(EVERY.flatMap(([label, flags, cased]) => ["no prior coaching", "remove the prior", "no priors"].map((turn) => [`${label}: "${cased(turn)}"`, flags, cased, turn] as const)))(
    "%s clears it, and it stays cleared after another turn",
    async (_label, flags, cased, removal) => {
      useProfile(flags, true);
      const replies = await chat([T1, T2, removal, "no payroll deduct"].map(cased));
      expect(priors(replies[1]!), replies[1]!.content).toMatch(COACHING);
      expect(priors(replies[2]!), replies[2]!.content).toBeNull();
      expect(priors(replies[3]!), replies[3]!.content).toBeNull();
      expect(replies[3]!.content).not.toMatch(/07\/29\/2026/);
    },
  );

  it.each(EVERY)('"no prior written" clears only a written warning (%s)', async (_label, flags, cased) => {
    useProfile(flags, true);
    const replies = await chat([T1, T2, "no prior written", "no payroll deduct"].map(cased));
    expect(priors(replies[3]!), replies[3]!.content).toMatch(COACHING);
  });

  it.each(EVERY)("slot answers still keep it (%s)", async (_label, flags, cased) => {
    useProfile(flags, true);
    for (const third of ["no payroll deduct", "verbal", "written warning please", "yes 25 dollars"]) {
      const replies = await chat([T1, T2, third].map(cased));
      expect(priors(replies[2]!), `${third}: ${replies[2]!.content}`).toMatch(COACHING);
    }
  });
});

describe("flag on: what does not clear it (probes)", () => {
  it.each(EVERY)('a removal asked as a question: "never had a prior? no, she had a verbal 7-29-26" (%s)', async (_label, flags, cased) => {
    useProfile(flags, true);
    const replies = await chat([T1, T2, "never had a prior? no, she had a verbal 7-29-26", "no payroll deduct"].map(cased));
    for (const reply of replies.slice(2)) expect(priors(reply), reply.content).toMatch(/07\/29\/2026/);
  });

  it.each(EVERY)('"add the prior back" on its own clears nothing (%s)', async (_label, flags, cased) => {
    useProfile(flags, true);
    const replies = await chat([T1, T2, "add the prior back"].map(cased));
    expect(priors(replies[2]!), replies[2]!.content).toMatch(COACHING);
  });

  it.each(EVERY)('"add the prior back" after "remove the prior" puts it back (%s)', async (_label, flags, cased) => {
    useProfile(flags, true);
    const replies = await chat([T1, T2, "remove the prior", "add the prior back", "no payroll deduct"].map(cased));
    expect(priors(replies[2]!), replies[2]!.content).toBeNull();
    expect(priors(replies[3]!), replies[3]!.content).toMatch(COACHING);
    expect(priors(replies[4]!), replies[4]!.content).toMatch(COACHING);
  });

  it.each(EVERY)('"no prior coaching for Corvin Mallow" does not clear this employee\'s card (%s)', async (_label, flags, cased) => {
    useProfile(flags, true);
    bag.keepsEmployee = true;
    const replies = await chat([T1, T2, "no prior coaching for Corvin Mallow", "no payroll deduct"].map(cased));
    for (const reply of replies.slice(2)) {
      expect(reply.formProposal?.employeeName?.toLowerCase(), reply.content).toBe("mara quill");
      expect(priors(reply), reply.content).toMatch(COACHING);
    }
  });
});

describe("flag off: as on main (pinned)", () => {
  it.each(EVERY.flatMap(([label, flags, cased]) => ["no prior coaching", "remove the prior"].map((turn) => [`${label}: "${cased(turn)}"`, flags, cased, turn] as const)))(
    "%s leaves the prior on the card",
    async (_label, flags, cased, removal) => {
      useProfile(flags, false);
      const replies = await chat([T1, T2, removal, "no payroll deduct"].map(cased));
      for (const reply of replies.slice(1)) expect(priors(reply), reply.content).toMatch(COACHING);
    },
  );

  it.each(EVERY)("a chat with no removal reads the same with the flag on and off (%s)", async (_label, flags, cased) => {
    useProfile(flags, false);
    const off = await chat([T1, T2, "no payroll deduct"].map(cased));
    process.env[FLAG] = "1";
    const on = await chat([T1, T2, "no payroll deduct"].map(cased));
    const strip = (reply: Reply) => ({ content: reply.content, proposal: { ...reply.formProposal, proposalId: null } });
    expect(on.map(strip)).toEqual(off.map(strip));
  });
});

describe("the removal reader", () => {
  it("reads a removal for this employee, and none about somebody else or asked as a question", async () => {
    const { priorRemoval } = await import("@/lib/ai/prior-actions-cleared");
    const said = [T1, T2];
    expect(priorRemoval([...said, "no prior coaching for Corvin Mallow"], "Mara Quill")).toBeNull();
    expect(priorRemoval([...said, "NO PRIOR COACHING FOR CORVIN MALLOW"], "Mara Quill")).toBeNull();
    expect(priorRemoval([...said, "never had a prior? no, she had a verbal 7-29-26"], "Mara Quill")).toBeNull();
    expect(priorRemoval([...said, "no payroll deduct"], "Mara Quill")).toBeNull();
    // Every prior before it is cleared; what follows the removal is all that is read.
    expect(priorRemoval([...said, "no prior coaching for mara quill"], "Mara Quill")).toEqual({ after: " coaching for mara quill", kinds: [] });
    expect(priorRemoval([...said, "remove the prior", "add the prior back"], "Mara Quill")).toBeNull();
    expect(priorRemoval([...said, "no prior written"], "Mara Quill")?.kinds.map((item) => item.kind)).toEqual(["written"]);
  });
});
