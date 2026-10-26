import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formDateIncidentOnlyEnabled } from "@/lib/config/chat-quality-flags";
import { blankYearlessStepDates } from "@/lib/forms/form-date-answer";
import { statedPriorActions } from "@/lib/forms/prior-actions";
import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { ChatFormProposal, ChatMessage } from "@/types";

vi.mock("@/config/company/locations", async () =>
  (await import("@/test/fixtures/reference-roster")).referenceRosterModule(),
);

/**
 * ============================================================================
 * QA, 25 OCT 2026 — "SHE WAS COACHED ON 9-15" IS A PRIOR ACTION, NOT THE DATE
 * ============================================================================
 *
 * Ported from the sibling app (conv_mvnoiw8n2kfbcvc there, live): "create a
 * verbal CA for Test Employee at <location> for being late to open on 10-20,
 * she was coached on 9-15 for being late, no payroll" was dated 9/15 (the
 * coaching) with no prior action. Here, in this app's words (a store), through
 * POST /api/chat on this app's live form path, the full remap
 * (FORM_FULL_REMAP_ENABLED, on in production).
 *
 * On this path the date was already 10/20, and the card's prior action was
 * the raw "coached on 9-15", with no full date and not what it was for. With
 * PRIOR_ACTIONS_PARSE_ENABLED the earlier-step reader reads a yearless "9-15",
 * and the card lists "Coaching for being late — 09/15/2026" (QA decision, 25 Oct
 * 2026: the line holds no word the manager did not say; "signed" appears only
 * when they write it, and this manager did not). The intake
 * line the intent path adds ("It happened on …") no longer takes the coaching's
 * date either. A coaching the manager says they held is read as before.
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

const bag = vi.hoisted(() => ({ modelLevel: null as "verbal" | "written" | null }));

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
      warningLevel: bag.modelLevel,
      formType: /policy review/i.test(manager) ? "Policy Review" : null,
      formTurn: true,
    };
  },
  callClaudeToolDetailed: async (input: { messages?: { content?: unknown }[] }) => {
    const text = JSON.stringify(input.messages ?? []);
    const last = text.split(/Manager:|User:/i).pop() ?? text;
    return {
      input: { templateKey: namedForm(last), employeeName: /test employee/i.test(last) ? "Test Employee" : null, observation: null, actionPlan: null, warningLevel: bag.modelLevel },
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

/* Production's form path here: the full remap, with the warning level the manager's only. */
const FLAG = "WARNING_LEVEL_MANAGER_ONLY_ENABLED";

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
      { id: `msg_${Date.now().toString(36)}u${index}x`, role: "user", content: turn.user, createdAt: "2026-10-25T18:00:00Z" } as ChatMessage,
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
  vi.setSystemTime(new Date("2026-10-25T18:00:00Z"));
  vi.stubEnv("FORM_FULL_REMAP_ENABLED", "true");
  vi.stubEnv(FLAG, "true");
  bag.modelLevel = null;
  await ensureTemplateLibrary("system");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const FLAG_UNDER_TEST = "PRIOR_ACTIONS_PARSE_ENABLED";
const TODAY = "2026-10-25";
const SAID =
  "create a verbal CA for Test Employee at Kearney for being late to open on 10-20, she was coached on 9-15 for being late, no payroll";

beforeEach(async () => {
  for (const key of Object.keys(store)) (store as Record<string, unknown[]>)[key] = [];
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T18:00:00Z`));
  vi.stubEnv("FORM_FULL_REMAP_ENABLED", "true");
  vi.stubEnv(FLAG, "true");
  bag.modelLevel = null;
  await ensureTemplateLibrary("system");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("the late opening with an earlier coaching, on the live path", () => {
  it.each([[""], ["LATE_OPEN_DATE_ENABLED"]])("is dated 10/20 and lists the 9/15 coaching with what it was for (also on: %s)", async (also) => {
    vi.stubEnv(FLAG_UNDER_TEST, "true");
    if (also) vi.stubEnv(also, "true");
    const [first] = await replay([SAID]);
    const card = first!.formProposal!;
    expect(card, first!.content).toBeTruthy();
    expect(card.formDate).toBe("2026-10-20");
    // QA 25 Oct 2026: no "signed" — the manager never wrote it (see the header).
    expect(card.priorActions).toBe("Coaching for being late — 09/15/2026");
    expect(card.warningLevel).toBe("verbal");
    expect(card.payrollDeduct).toBe("no");
  });

  it("with the flag off the date is 10/20 and the prior action is the raw \"coached on 9-15\"", async () => {
    vi.stubEnv(FLAG_UNDER_TEST, "");
    const [first] = await replay([SAID]);
    expect(first!.formProposal?.formDate).toBe("2026-10-20");
    expect(first!.formProposal?.priorActions).toBe("coached on 9-15");
  });
});

describe("the readers", () => {
  it("read the yearless coaching as an earlier step, and the late opening as the incident", async () => {
    const { fieldLines } = await import("@/lib/ai/intake-augment");
    vi.stubEnv(FLAG_UNDER_TEST, "true");
    // QA 25 Oct 2026: no "signed" — the manager never wrote it (see the header).
    expect(statedPriorActions(SAID, TODAY)).toEqual(["Coaching for being late — 09/15/2026"]);
    expect(fieldLines(SAID, TODAY)).toEqual(["It happened on 10/20/2026."]);
    expect(blankYearlessStepDates(SAID, TODAY)).toBe(SAID.replace("9-15", "    "));
    vi.stubEnv(FLAG_UNDER_TEST, "");
    expect(statedPriorActions(SAID, TODAY)).toEqual([]);
    // FORM_DATE_INCIDENT_ONLY_ENABLED (changed on purpose, live card test 26 Oct 2026):
    // the intake's line names the one incident date, never the earlier coaching's 9-15.
    expect(fieldLines(SAID, TODAY)).toEqual([`It happened on ${formDateIncidentOnlyEnabled() ? "10/20" : "9/15"}/2026.`]);
  });

  it("leave a range and a held coaching alone", async () => {
    const { fieldLines } = await import("@/lib/ai/intake-augment");
    vi.stubEnv(FLAG_UNDER_TEST, "true");
    const range = "CA for Test Employee, she was 10-15 minutes late on 10-20";
    expect(blankYearlessStepDates(range, TODAY)).toBe(range);
    expect(fieldLines(range, TODAY)).toEqual(["It happened on 10/20/2026."]);
    const held = "coaching form for Test Employee at Kearney, she was late on 10-5 and 10-15, I coached her on 10-16 about being late";
    expect(blankYearlessStepDates(held, TODAY)).toBe(held);
    expect(statedPriorActions("I coached her on 10-16 about her cell phone", TODAY)).toEqual([]);
    expect(fieldLines(held, TODAY)).toEqual(["It happened on 10/16/2026."]);
  });
});
