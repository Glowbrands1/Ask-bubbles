import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { keepFormEmployeeEnabled, titleWholeWordEnabled } from "@/lib/config/chat-quality-flags";
import { decideIntentTurn } from "@/lib/ai/intent-slots";
import { titleInWords } from "@/lib/ai/title-in-words";
import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { ChatFormProposal, ChatMessage } from "@/types";

vi.mock("@/config/company/locations", async () =>
  (await import("@/test/fixtures/reference-roster")).referenceRosterModule(),
);

/**
 * ============================================================================
 * QA ROUND 10, 25 OCT 2026 — A NAME AND A TITLE THE MANAGER NEVER GAVE
 * ============================================================================
 *
 * The sibling app's QA round 10 found two cards with a value the manager never
 * gave it: after "create the ca" the employee became the new hire the account
 * described ("onboarding with new hire Test Newhire"), and "she signed one
 * box with a arrown throught the rest" put the directory title "HR" on a
 * Coaching Form ("throught" contains "hr").
 *
 * The same cases, with this app's words (store, general manager), through
 * POST /api/chat on this app's live form path: the full remap
 * (FORM_FULL_REMAP_ENABLED, on in production). The browser's messages go in
 * whole, as in production. The people are QA test names.
 *
 * KEEP_FORM_EMPLOYEE_ENABLED: the remap's own name reading took the last
 * name any manager turn contained, so "new hire Test Newhire" replaced the
 * saved employee and a bare "test" replaced "test employee".
 * TITLE_WHOLE_WORD_ENABLED guards the same substring title match in this
 * app's intent reading (off in production): the live remap reads titles from
 * the manager's words only and already passes.
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

const bag = vi.hoisted(() => ({ modelLevel: null as "verbal" | "written" | null, names: [] as string[], title: null as string | null }));

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
  if (/coaching/i.test(text)) return "coaching";
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
      employee: bag.names.find((name) => manager.toLowerCase().includes(name.toLowerCase())) ?? null,
      store: null,
      title: bag.title,
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
      input: {
        templateKey: namedForm(last),
        // What the extraction model copies: the employee when the latest manager turn names them.
        employeeName: bag.names.find((name) => last.toLowerCase().includes(name.toLowerCase())) ?? null,
        jobTitle: bag.title, observation: null, actionPlan: null, warningLevel: bag.modelLevel },
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

/*
 * Production's form path here: the full remap. Intent extraction is off in
 * production (chat_traces 24 Oct 2026: remap slots, no prefixed questions);
 * its reading is covered by `lib/ai/warning-level-invented-oct24.test.ts`.
 */
const FLAGS = ["FORM_FULL_REMAP_ENABLED"] as const;
const FLAG = "WARNING_LEVEL_MANAGER_ONLY_ENABLED";
const EXTRA_FLAGS = ["KEEP_FORM_EMPLOYEE_ENABLED", "TITLE_WHOLE_WORD_ENABLED"] as const;
const EXTRA: string[] = [...EXTRA_FLAGS];
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
    // Production writes each turn's remap slots to chat_traces, and the next
    // turn reads them back as the saved slots; this harness's trace writer
    // does not reach the fake store, so the row is written here.
    if (payload.formProposal) {
      store.chat_traces.push({
        user_id: "qa-manager",
        conversation_id: id,
        created_at: `2026-10-25T08:00:${String(index).padStart(2, "0")}Z`,
        slots: { templateKey: payload.formProposal.templateKey, employeeName: payload.formProposal.employeeName },
      });
    }
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
  vi.setSystemTime(new Date("2026-10-25T08:00:00Z"));
  for (const name of [...FLAGS, FLAG, ...EXTRA]) saved.set(name, process.env[name]);
  for (const name of FLAGS) process.env[name] = "true";
  process.env[FLAG] = "true";
  for (const name of EXTRA) process.env[name] = "true";
  bag.modelLevel = null;
  bag.names = [];
  bag.title = null;
  await ensureTemplateLibrary("system");
});
afterEach(() => {
  vi.useRealTimers();
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

/** The sibling app's conv_mvnjix4r2wm7u7r, with this app's job title. */
const R02 = [
  "create a CA for general manager, test employee for violating the standards of conduct",
  "Test Employee, General Manager",
  "change observation of offense to: Test completed onboarding with new hire Test Newhire on 9-28-26. As of 10-16-26 Test Newhire had not acknowledged onboarding policies in Woven that should have been completed during onboarding.",
  "create the ca",
  "create ca for test employee, general manager. the offense is: change observation of offense to: Test completed onboarding with new hire Test Newhire on 9-28-26. As of 10-16-26 Test Newhire had not acknowledged onboarding policies in Woven that should have been completed during onboarding. the policy violated is standards of conduct.",
  "test",
];

/** The sibling app's conv_mvnjo8k22hy75ii, with this app's store and its own restroom supplies. */
const L17 = [
  "Please make me a coaching form for test employee at the kearney location Test did not complete closing duties. Trash was not taken out of the bathrooms, there was no\ntoilet paper in the women's bathroom, and there were no paper towels at the sinks also all the cleaning duties were signed off in the binder and not alll were completed and the way she signed off on the checklist was incorrect she signed one box with a arrown throught the rest each box needs an initial",
  "Can you make coaching work sheets for the team ? on closing duties at night ?",
];

describe("round 10 flags", () => {
  it("default off", () => {
    for (const name of EXTRA_FLAGS) delete process.env[name];
    expect(keepFormEmployeeEnabled()).toBe(false);
    expect(titleWholeWordEnabled()).toBe(false);
  });
});

describe("QA round 10 on Ask Bubbles' live path (full remap)", () => {
  it('R02: "create the ca" keeps test employee; the new hire is never the employee', { timeout: 60_000 }, async () => {
    bag.names = ["test employee"];
    const replies = await replay(R02);
    for (const [index, reply] of replies.entries()) {
      const where = `turn ${index + 1}: ${R02[index]!.slice(0, 40)}`;
      if (reply.formProposal) {
        expect(reply.formProposal.employeeName?.toLowerCase() ?? "", `${where} — card`).toBe("test employee");
      }
      expect(reply.content, `${where} — reply`).not.toMatch(/Test Newhire\b(?![^\n]*(?:onboarding|acknowledged))/);
      expect(reply.content, `${where} — reply`).not.toMatch(/\*\*(?:Employee:\*\*\s*)?Test Newhire\b/);
    }
    expect(replies[3]!.formProposal?.employeeName?.toLowerCase()).toBe("test employee");
  });

  it('L17: "throught the rest" is not a job title; the card carries none', { timeout: 60_000 }, async () => {
    bag.names = ["test employee"];
    const replies = await replay(L17);
    for (const [index, reply] of replies.entries()) {
      const where = `turn ${index + 1}`;
      expect(reply.formProposal?.employeeRole ?? null, `${where} — card`).toBeNull();
      expect(reply.content, `${where} — reply`).not.toMatch(/\*\*Job title:\*\*/);
    }
  });
});

/** This app's directory titles (production, 25 Oct 2026); the people are synthetic. */
const PEOPLE = [
  ["p1", "Dana", "Rowtest", "Team Member Part Time"],
  ["p2", "Casey", "Linetest", "General Manager"],
  ["p3", "Riley", "Northtest", "Assistant General Manager"],
  ["p4", "Morgan", "Deskline", "Human Resources Generalist"],
  ["p5", "Avery", "Fieldtest", "Owner"],
  ["p6", "Quinn", "Ledgertest", "Operator"],
  ["p7", "Sky", "Opsline", "Corporate"],
].map(([id, firstName, lastName, title]) => ({
  id: id!,
  firstName: firstName!,
  lastName: lastName!,
  locationIds: ["loc-0309"],
  title: title!,
  primaryLocationName: "NE Kearney",
}));

function intentTitle(raw: unknown): string | null {
  return decideIntentTurn({
    question: L17[0]!,
    history: [],
    today: "2026-10-25",
    saved: null,
    raw,
    people: PEOPLE,
    stores: [{ id: "loc-0309", name: "NE Kearney" }],
    headings: ["Standards of Conduct"],
    templates: [{ key: "coaching", name: "Coaching Form" }],
    formInProgress: false,
  }).state.title;
}

describe("the same title mechanism on this app's intent reading", () => {
  it("L17's words carry no directory title", () => {
    expect(intentTitle({ employee: "test employee", title: null })).toBeNull();
  });

  it("a directory title the slot model typed that the manager never wrote is not kept", () => {
    expect(intentTitle({ employee: "test employee", title: "Owner" })).toBeNull();
  });

  it("a directory title is a whole word, and an initialism only as typed", () => {
    expect(titleInWords("Owner", "the owners asked")).toBe(false);
    expect(titleInWords("Operator", "she was a cooperator")).toBe(false);
    expect(titleInWords("General Manager", "create a CA for general manager, test employee")).toBe(true);
    expect(titleInWords("HR", "she was 1 hr late")).toBe(false);
  });
});
