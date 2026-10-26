import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { ChatFormProposal } from "@/types";

vi.mock("@/config/company/locations", async () =>
  (await import("@/test/fixtures/reference-roster")).referenceRosterModule(),
);

/**
 * ============================================================================
 * THE FORMS GUIDE THROUGH POST /api/chat (FORMS_GUIDE_ENABLED)
 * ============================================================================
 *
 * The owner: "both sunny and bubbles should also guide managers on the
 * differences of each form, like what is a CA, what is coaching and so on.
 * Read the forms and that should be the answer." With the flag on, "what is a
 * ca?" is the Corrective Action Form as this app's published template
 * describes it — never a knowledge-base miss, never the model — and "which
 * forms can i create here?" (the starter chip) is the role's exact list from
 * `config/company/access.ts`. Edit the template row and the answer changes.
 * "ca for <name>" still starts the form. With the flag off the same turns are
 * answered exactly as before. Ported from Ask Sunny.
 *
 * Faked: identity (role per test), the database (in memory, seeded by
 * `ensureTemplateLibrary`), the models, analytics. Synthetic names.
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
  /** Who is asking. */
  role: "location_manager" as string,
  chatModelCalls: 0,
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
const { isHiddenTemplate } = await import("@/config/company/forms/hidden");
  const { AuthError } = await import("@/lib/auth/types");
  return {
    authorizeRequest: async (_request: Request, permission: string) => {
      if (!hasPermission(DEFAULT_PERMISSION_MATRIX, bag.role as never, permission as never)) {
        throw new AuthError("forbidden", "Your role does not have permission to do that.");
      }
      return {
        identity: {
          subject: "qa-manager",
          email: "qa-manager@example.test",
          displayName: "QA Manager",
          role: bag.role,
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
  callClaude: async () => {
    bag.chatModelCalls += 1;
    return ANSWER;
  },
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
const { DEFAULT_PERMISSION_MATRIX, hasPermission } = await import("@/lib/permissions");
const { isHiddenTemplate } = await import("@/config/company/forms/hidden");
const chatRoute = await import("./route");

type Answer = { content: string; formProposal?: ChatFormProposal; formSelection?: unknown };

async function say(question: string): Promise<Answer> {
  const response = await chatRoute.POST(
    new Request("https://app.test/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question,
        mode: "standard",
        history: [],
        questionMessageId: "m1",
        conversationId: "conv-forms-guide",
      }),
    }),
  );
  const payload = (await response.json()) as Answer & { error?: string };
  expect(response.status, JSON.stringify(payload)).toBe(200);
  return payload;
}

const FLAG = "FORMS_GUIDE_ENABLED";
let saved: string | undefined;

beforeEach(async () => {
  for (const key of Object.keys(store)) (store as Record<string, unknown[]>)[key] = [];
  bag.role = "location_manager";
  bag.chatModelCalls = 0;
  bag.slotReading = "none";
  bag.guess = "dpoa";
  saved = process.env[FLAG];
  process.env[FLAG] = "true";
  await ensureTemplateLibrary("system");
});

afterEach(() => {
  if (saved === undefined) delete process.env[FLAG];
  else process.env[FLAG] = saved;
});

function templateRow(key: string) {
  return (store.form_templates ?? []).find((row) => row.key === key)!;
}

describe("flag on: the answer is the published template", () => {
  it.each(["what is a ca?", "What is a ca?"])("%s explains the Corrective Action Form, not the model", async (wording) => {
    const reply = await say(wording);
    expect(reply.content).toContain("**Corrective Action Form** — ");
    expect(reply.content).toContain(String(templateRow("dpoa").description));
    expect(reply.content).not.toContain(ANSWER);
    expect(bag.chatModelCalls).toBe(0);
    expect(reply.formProposal).toBeUndefined();
    expect(reply.formSelection).toBeUndefined();
  });

  it("editing the template row's description changes the answer", async () => {
    templateRow("dpoa").description = "Fixture wording from the database row.";
    const reply = await say("what is a ca?");
    expect(reply.content).toContain("**Corrective Action Form** — Fixture wording from the database row.");
  });

  it.each(["difference between coaching and ca", "Difference between coaching and ca"])(
    "%s explains both side by side",
    async (wording) => {
      const reply = await say(wording);
      expect(reply.content).toContain("**Coaching Form** — ");
      expect(reply.content).toContain("**Corrective Action Form** — ");
      expect(reply.formProposal).toBeUndefined();
    },
  );

  it.each(["which forms can i create here?", "Which forms can I create here?"])(
    "%s is the role's exact list",
    async (wording) => {
      const reply = await say(wording);
      const listed = (store.form_templates ?? []).filter(
        (row) =>
          row.active !== false &&
          !isHiddenTemplate(String(row.key)) &&
          hasPermission(DEFAULT_PERMISSION_MATRIX, "location_manager", String(row.required_permission) as never),
      );
      expect(reply.content).toContain(`As a Location Manager you can create these ${listed.length} forms in Ask Bubbles:`);
      expect(reply.content).toContain("- Corrective Action Form");
      expect(reply.content).not.toContain("- SDIT EPP");
    },
  );

  it("a Team Member is told what a CA is and that they cannot create one", async () => {
    bag.role = "employee";
    const reply = await say("what is a ca?");
    expect(reply.content).toContain("**Corrective Action Form** — ");
    expect(reply.content).toContain("Your role (Team Member) can't create this one; your Location Manager can.");
  });

  it("an Assistant Manager can create no forms", async () => {
    bag.role = "assistant_manager";
    const reply = await say("which forms can i create here?");
    expect(reply.content).toContain("Your role (Assistant Manager) can't create forms in Ask Bubbles.");
  });

  it('Could this break: "ca for Avery Holt" still starts the form, not the guide', async () => {
    const reply = await say("ca for Avery Holt");
    expect(reply.content).not.toContain("Who can create it:");
  });

  it('Could this break: "what is the ca for california sales tax" goes to the knowledge answer', async () => {
    const reply = await say("what is the ca for california sales tax");
    expect(reply.content).not.toContain("Who can create it:");
  });
});

describe("flag off: answered exactly as before", () => {
  it("what is a ca? does not use the guide", async () => {
    delete process.env[FLAG];
    const reply = await say("what is a ca?");
    expect(reply.content).not.toContain("Who can create it:");
  });
});
