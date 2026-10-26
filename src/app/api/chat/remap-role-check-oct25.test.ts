import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { ChatFormProposal } from "@/types";

vi.mock("@/config/company/locations", async () =>
  (await import("@/test/fixtures/reference-roster")).referenceRosterModule(),
);

/**
 * ============================================================================
 * THE REMAP CARD RESPECTS THE ROLE MATRIX — QA, 25 OCT 2026
 * ============================================================================
 *
 * Ported from the sibling app. With FORM_FULL_REMAP_ENABLED on,
 * `answerQuestion` returned the remap's card before the proposal path ran, and
 * the remap never read the actor's role. An employee or an assistant manager
 * asking for "a coaching form for …" was shown a Coaching Form card; Create
 * was then refused with a 403.
 *
 * REMAP_ROLE_CHECK_ENABLED on: such a turn shows no card and gets the proposal
 * path's own refusal. A location manager gets today's remap card. Off, today's
 * behaviour is pinned: the card is shown even to an employee. Each turn goes
 * through POST /api/chat. Invented names.
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

const bag = vi.hoisted(() => ({ role: "location_manager" as string, name: "" }));

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
      if (!hasPermission(DEFAULT_PERMISSION_MATRIX, bag.role as never, permission as never)) {
        throw new AuthError("forbidden", "Your role does not have permission to do that.");
      }
      return {
        identity: {
          subject: `qa-${bag.role}`,
          email: `qa-${bag.role}@example.test`,
          displayName: "QA Person",
          role: bag.role,
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
  // The remap's read. It names no form, so the Coaching Form is chosen from the manager's own words, in any case.
  callClaudeToolDetailed: async () => ({
    input: { templateKey: null, employeeName: bag.name, observation: "Late to her shift three times.", actionPlan: null },
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

/*
 * The request as briefed, then the same request in a manager's real register:
 * all lowercase with no punctuation; sentence case with the name typed
 * lowercase and Capitalized; ALL UPPERCASE; and terse. The name comes back
 * from the extraction exactly as typed. No reader may depend on case.
 */
const VARIANTS = [
  ["coaching form for Tessaly Brookhart, late 3 times", "Tessaly Brookhart"],
  ["coaching form for rowan pell late 3 times", "rowan pell"],
  ["Coaching form for rowan pell, late 3 times.", "rowan pell"],
  ["Coaching form for Rowan Pell, late 3 times.", "Rowan Pell"],
  ["COACHING FORM FOR ROWAN PELL, LATE 3 TIMES", "ROWAN PELL"],
  ["just do a coaching form for rowan pell shes late again", "rowan pell"],
] as const;
const REFUSAL = "Your role cannot create a **Coaching Form**, so I will not propose one.";

const saved = new Map<string, string | undefined>();
function setFlag(name: string, value: string | undefined) {
  if (!saved.has(name)) saved.set(name, process.env[name]);
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

let sequence = 0;

async function ask(role: string, question: string, name: string): Promise<{ content: string; formProposal?: ChatFormProposal }> {
  bag.role = role;
  bag.name = name;
  sequence += 1;
  const response = await chatRoute.POST(
    new Request("https://app.test/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question,
        mode: "standard",
        history: [],
        questionMessageId: `msg_role${sequence}u0x`,
        conversationId: `conv_remaprole${String(sequence).padStart(3, "0")}`,
      }),
    }),
  );
  const payload = (await response.json()) as { content: string; formProposal?: ChatFormProposal; error?: string };
  expect(response.status, JSON.stringify(payload)).toBe(200);
  return payload;
}

beforeEach(async () => {
  for (const key of Object.keys(store)) (store as unknown as Record<string, unknown[]>)[key] = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-25T16:00:00Z"));
  setFlag("FORM_FULL_REMAP_ENABLED", "true");
  setFlag("REMAP_ROLE_CHECK_ENABLED", undefined);
  await ensureTemplateLibrary("system");
}, 60_000);
afterEach(() => {
  vi.useRealTimers();
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  saved.clear();
});

describe.each(VARIANTS)("%s", (question, name) => {
  describe("REMAP_ROLE_CHECK_ENABLED on", () => {
    beforeEach(() => {
      setFlag("REMAP_ROLE_CHECK_ENABLED", "true");
    });

    it.each(["employee", "assistant_manager"])("%s: no card, and the proposal path's refusal", async (role) => {
      const reply = await ask(role, question, name);
      expect(reply.formProposal ?? null).toBeNull();
      expect(reply.content).toContain(REFUSAL);
    });

    it("location_manager: today's remap card", async () => {
      const reply = await ask("location_manager", question, name);
      expect(reply.formProposal?.templateKey).toBe("coaching");
      expect(reply.formProposal?.employeeName?.toLowerCase()).toBe(name.toLowerCase());
      expect(reply.content).not.toContain("Your role cannot create");
    });
  });

  describe("REMAP_ROLE_CHECK_ENABLED off (today's behaviour, pinned)", () => {
    it.each(["employee", "assistant_manager", "location_manager"])("%s: the remap card is shown", async (role) => {
      const reply = await ask(role, question, name);
      expect(reply.formProposal?.templateKey).toBe("coaching");
      expect(reply.formProposal?.employeeName?.toLowerCase()).toBe(name.toLowerCase());
      expect(reply.content).not.toContain("Your role cannot create");
    });
  });
});
