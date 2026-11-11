import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { ChatFormProposal, ChatMessage } from "@/types";

vi.mock("@/config/company/locations", async () =>
  (await import("@/test/fixtures/reference-roster")).referenceRosterModule(),
);

/**
 * ============================================================================
 * THE EXIT FORM'S INTAKE READS WHAT THE MANAGER TYPED — LIVE QA, 25 OCT 2026
 * ============================================================================
 *
 * Found on this app's production (deploy cfd8d61, FORM_FULL_REMAP_ENABLED on)
 * after the exit form stopped being a Corrective Action. Each turn below is
 * the manager's exact words (the employee's name was already the synthetic
 * "Test Employee"), sent through POST /api/chat with the production flags:
 *
 *   conv_mvnt2u0o2ql6a0h  "… items returned, payroll deduction does not
 *                         apply" asked "Which of them is this Resignation/Exit
 *                         Form for — Test Employee or items returned?"
 *   conv_mvnt2ed52s35vpw  "I need to edit the reason for resignation to: going
 *                         back to school" repeated the card with "Moving out
 *                         of state."
 *   conv_mvnt2ecc2qnsv1x  "… she resigned, last day 10-24" left Last Day
 *                         Worked blank ("10-17-26", with a year, filled it)
 *   conv_mvnt2mhy2wi2b3x  "permanent address 123 Main St, Kearney, NE 68847.
 *                         She did not call in for her last two shifts." left
 *                         Permanent Address blank and No Call No Show unticked
 *
 * The fix is EXIT_INTAKE_FIX_ENABLED (default off). conv_mvnt2e7a2kkdg9x, an
 * exit form that already worked, is the same card with it on and off.
 *
 * "How Employee Resigned" stays blank for "she resigned": the words say that
 * she resigned, not how (text, call, in person), and the exit readers fill a
 * line only from words that say it.
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

vi.mock("@/lib/ai/call-claude", () => ({
  callClaude: async () => "A grounded answer.",
  callClaudeTool: async () => null,
  // The model's guess in conv_mvnmfb21286uhtq: the Corrective Action Form.
  callClaudeToolDetailed: async () => ({
    input: { templateKey: "dpoa", employeeName: null, observation: null, actionPlan: null },
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


/*
 * The production flags these turns ran under, as far as they decide this path:
 * the full remap (which the exit form leaves), the not-a-name guard, the
 * typed-name reading (the live card asked "Test Employee or items returned",
 * which only that reading gives) and field accuracy (the live edit turn was
 * answered with the exit card again; QA reads both as on in production).
 *
 * SLOT_RETENTION_ENABLED and FORM_STATE_ENABLED were rolled back, QA says, but
 * that is read from flag comments, so every case runs with each of them on
 * and off.
 */
const PRODUCTION = [
  "FORM_FULL_REMAP_ENABLED",
  "NOT_A_NAME_GUARD_ENABLED",
  "TYPED_NAME_ENABLED",
  "FIELD_ACCURACY_ENABLED",
] as const;
const ROLLED_BACK = ["SLOT_RETENTION_ENABLED", "FORM_STATE_ENABLED"] as const;
const PROFILES = [
  ["slot retention off, form state off", false, false],
  ["slot retention on, form state off", true, false],
  ["slot retention off, form state on", false, true],
  ["slot retention on, form state on", true, true],
] as const;
const FLAG = "EXIT_INTAKE_FIX_ENABLED";

beforeEach(async () => {
  for (const key of Object.keys(store)) (store as Record<string, unknown[]>)[key] = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-25T16:00:00Z"));
  for (const name of [...PRODUCTION, ...ROLLED_BACK, FLAG]) saved.set(name, process.env[name]);
  for (const name of PRODUCTION) process.env[name] = "true";
  process.env[FLAG] = "true";
  await ensureTemplateLibrary("system");
});
afterEach(() => {
  vi.useRealTimers();
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

/* The managers' turns, exactly as typed. */
const NOT_A_NAME_TURN =
  "create an exit form for Test Employee at Kearney. Gave notice 9/25/26 – fulfilled 10/9/26, resigning to pursue other career options, items returned, payroll deduction does not apply";
const REASON_REQUEST =
  "create an exit form for Test Employee at Kearney, she resigned, last day 10-24-26, reason for resignation: moving out of state";
const REASON_EDIT = "I need to edit the reason for resignation to: going back to school";
const YEARLESS = "create an exit form for Test Employee at Kearney, she resigned, last day 10-24";
const ADDRESS_NCNS =
  "create an exit form for Test Employee at Kearney, permanent address 123 Main St, Kearney, NE 68847. She did not call in for her last two shifts. Last day worked 10-20-26";
const ALREADY_WORKS = "create an exit for Test Employee at dodge last day worked 10-17-26";

/** The card's "Left blank for you to review" line. */
function blankLine(content: string): string {
  return /\*\*Left blank for you to review:\*\*([^\n]*)/.exec(content)?.[1] ?? "";
}

describe.each(PROFILES)("%s", (_profile, slotRetention, formState) => {
  beforeEach(() => {
    process.env.SLOT_RETENTION_ENABLED = slotRetention ? "true" : "false";
    process.env.FORM_STATE_ENABLED = formState ? "true" : "false";
  });

  describe("acceptance: the exit intake on Ask Bubbles' live path (EXIT_INTAKE_FIX_ENABLED on)", () => {
    it("conv_mvnt2u0o2ql6a0h: Test Employee's card, never 'items returned' offered as the employee", async () => {
      const [reply] = await replay([NOT_A_NAME_TURN]);
      expect(reply!.formProposal?.templateKey).toBe("resignation-exit");
      expect(reply!.formProposal?.employeeName).toBe("Test Employee");
      expect(reply!.formProposal?.status).toBe("ready");
      expect(reply!.content).not.toMatch(/Which of them/i);
      expect(reply!.content).not.toMatch(/\*\*items returned\*\*/i);
      expect(reply!.content).toContain("- **Name:** Test Employee");
      // What the manager typed is on the card.
      expect(reply!.content).toContain("- **Date that notice was given:** September 25, 2026");
      expect(reply!.content).toContain("- **Date that notice was fulfilled:** October 9, 2026");
      expect(reply!.content).toContain("- **Reason for Resignation:** To pursue other career options.");
      expect(reply!.content).toContain("- **Store Items Returned:** Store items were returned.");
      expect(reply!.content).toContain("- **Payroll Deduction:** Payroll deduction is not applicable.");
    });

    it("conv_mvnt2ed52s35vpw T2: an explicit edit of the reason changes the reason on the open card", async () => {
      const replies = await replay([REASON_REQUEST, REASON_EDIT]);
      expect(replies[0]!.content).toContain("- **Reason for Resignation:** Moving out of state.");
      const last = replies.at(-1)!;
      expect(last.formProposal?.templateKey).toBe("resignation-exit");
      expect(last.formProposal?.employeeName).toBe("Test Employee");
      expect(last.content).toContain("- **Reason for Resignation:** Going back to school.");
      expect(last.content).not.toContain("Moving out of state");
      // The rest of the card is kept.
      expect(last.content).toContain("- **Last Day Worked:** October 24, 2026");
    });

    it("conv_mvnt2ecc2qnsv1x: a yearless 'last day 10-24' is the most recent October 24", async () => {
      const [reply] = await replay([YEARLESS]);
      expect(reply!.formProposal?.employeeName).toBe("Test Employee");
      expect(reply!.content).toContain("- **Last Day Worked:** October 24, 2026");
      expect(blankLine(reply!.content)).not.toContain("Last Day Worked");
      // "She resigned" says that she resigned, not how: How Employee Resigned stays for the manager.
      expect(blankLine(reply!.content)).toContain("How Employee Resigned");
    });

    it("conv_mvnt2mhy2wi2b3x: the typed Permanent Address is filled and No Call No Show is ticked", async () => {
      const [reply] = await replay([ADDRESS_NCNS]);
      expect(reply!.formProposal?.employeeName).toBe("Test Employee");
      expect(reply!.content).toContain("- **Permanent Address:** 123 Main St, Kearney, NE 68847");
      expect(blankLine(reply!.content)).not.toContain("Permanent Address");
      expect(reply!.content).toContain("- **Resignation Details:** No Call No Show");
      expect(reply!.content).toContain("- **Last Day Worked:** October 20, 2026");
      expect(reply!.content).not.toMatch(/\*\*Main St\*\*/);
    });
  });

  describe("unchanged", () => {
    it("conv_mvnt2e7a2kkdg9x, an exit form that already worked, is the same card with the flag on and off", async () => {
      const [on] = await replay([ALREADY_WORKS]);
      process.env[FLAG] = "false";
      const [off] = await replay([ALREADY_WORKS]);
      expect(on!.content).toBe(off!.content);
      expect({ ...on!.formProposal, proposalId: null, sourceMessageIds: null }).toEqual({
        ...off!.formProposal,
        proposalId: null,
        sourceMessageIds: null,
      });
      expect(on!.content).toContain("- **Last Day Worked:** October 17, 2026");
    });

    it("flag off: the exit readers read as before (the live replies)", async () => {
      process.env[FLAG] = "false";
      const [asked] = await replay([NOT_A_NAME_TURN]);
      expect(asked!.content).toMatch(/Which of them is this \*\*Resignation\/Exit Form\*\* for — \*\*Test Employee\*\* or \*\*items returned\*\*\?/);
      const [yearless] = await replay([YEARLESS]);
      expect(blankLine(yearless!.content)).toContain("Last Day Worked");
      const [address] = await replay([ADDRESS_NCNS]);
      expect(blankLine(address!.content)).toContain("Permanent Address");
      expect(address!.content).not.toContain("No Call No Show");
    });

    it("a Corrective Action whose account says 'items returned … does not apply' keeps its employee", async () => {
      const [reply] = await replay([
        "create a CA for Test Employee at Kearney, she was out of dress code 10/11, items returned, payroll deduction does not apply",
      ]);
      expect(reply!.formProposal?.templateKey).toBe("dpoa");
      expect(reply!.formProposal?.employeeName ?? "").not.toMatch(/items returned/i);
    });
  });
});
