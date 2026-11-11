import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { continuationFor } from "@/lib/forms/proposal-continuation";
import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import type { ChatFormProposal, ChatMessage } from "@/types";

/**
 * ============================================================================
 * HISTORY REPLAY, 25 OCT 2026 — EDITS APPENDED, A POLICY SWAP INVERTED, AND
 * PRIOR DATES ON THE FORM (ported from the sibling app's replay)
 * ============================================================================
 *
 * The same acceptance cases as the sibling app's `edits-dates-replay-e2e`,
 * in this app's words (store for salon), every turn through POST /api/chat on
 * this app's live form path: the full remap (FORM_FULL_REMAP_ENABLED, on in
 * production). Names are synthetic. This app's own replays:
 *
 *   conv_mvnsowzl20ljr9m   "change the date to 10-23-26" became What happened
 *                          ("change the date to 3-26").
 *   conv_mvnsqglc2v7zuyk   "previous coaching jba manual 11-1-25" dated the
 *                          form 2025-11-01.
 *   B15 conv_mvnu46n823v1unt  "she opened the store late today": no Date.
 *   B17 conv_mvnuh50i2hanl53  "add that she was also on her phone" was dropped.
 *
 * And the sibling app's S12 (grammar), S22 (replace What happened), (d)
 * ("INSTEAD of"), Q7 and H8 (prior dates), S21 (a finalized form).
 *
 * FORM_EDIT_DATE_RULES_ENABLED (default off) is the fix. Each case runs with
 * it on; the flag-off run pins what production does today.
 */

const store: FakeStore & Record<string, Record<string, unknown>[]> = {
  form_instances: [],
  form_instance_values: [],
  form_instance_events: [],
  form_template_versions: [],
  form_templates: [],
  form_template_current: [],
  form_template_assets: [],
  chat_traces: [],
  chat_form_state: [],
} as unknown as FakeStore & Record<string, Record<string, unknown>[]>;

const state = vi.hoisted(() => ({
  /** The extraction model's reading for the turn. Production's readings were not recorded. */
  remap: {} as Record<string, unknown>,
  draft: {} as { values?: Record<string, unknown>; checked?: Record<string, unknown> },
  revision: {} as { values?: Record<string, unknown>; checked?: Record<string, unknown>; clear?: string[] },
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
      if (!hasPermission(DEFAULT_PERMISSION_MATRIX, "district_manager" as never, permission as never)) {
        throw new AuthError("forbidden", "Your role does not have permission to do that.");
      }
      return {
        identity: {
          subject: "qa-manager",
          email: "qa-manager@example.test",
          displayName: "QA Manager",
          role: "district_manager",
          scope: { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] },
          verified: true,
        },
        permission,
        provider: "supabase",
      };
    },
  };
});
vi.mock("@/lib/analytics/record", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics/record")>()),
  openTurn: async () => "turn-qa",
  closeTurn: async () => {},
  recordActivity: async () => {},
  recordActivityAsync: () => {},
}));

/** The form the latest manager turn names, as the extraction model copies it. */
function namedForm(text: string): string | null {
  if (/follow-?up coaching/i.test(text)) return "follow-up-coaching";
  if (/coaching/i.test(text)) return "coaching";
  if (/\b(?:ca|corrective action)\b/i.test(text)) return "dpoa";
  return null;
}

vi.mock("@/lib/ai/call-claude", () => ({
  callClaude: async () => "A grounded answer.",
  callClaudeTool: async () => null,
  callClaudeToolDetailed: async (input: { messages?: { content?: unknown }[] }) => {
    const text = JSON.stringify(input.messages ?? []);
    const last = text.split(/Manager:|User:/i).pop() ?? text;
    return {
      input: { templateKey: namedForm(last), employeeName: null, observation: null, actionPlan: null, ...state.remap },
      inputTokens: 1,
      outputTokens: 1,
    };
  },
}));
vi.mock("@/lib/ai/anthropic", () => ({
  getAnthropicClient: () => ({
    messages: {
      create: async (request: { tool_choice?: { name?: string } }) => {
        const revising = request.tool_choice?.name === "revise_form_fields";
        return {
          stop_reason: "tool_use",
          content: [
            { type: "tool_use", name: revising ? "revise_form_fields" : "write_form_fields", input: revising ? state.revision : state.draft },
          ],
        };
      },
    },
  }),
}));
vi.mock("@/lib/knowledge/providers/supabase", async () => {
  const { manualChunkFromRow } = await import("@/lib/knowledge/full-manual-load");
  const rows = (await import("@/test/fixtures/jba-manual-production-151.json")).default;
  return {
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
      async fetchNamedHandbook() {
        return { ok: false, reason: "not used" };
      }
      async fetchOfficialPolicyManual() {
        return {
          ok: true as const,
          documentId: "doc-jba",
          documentTitle: "2025 JBA Policy Manual - Edited 5-2025",
          documentCategory: "policies_compliance",
          matchedBy: "fallback" as const,
          ownerConfirmed: true,
          chunks: (rows.chunks as Parameters<typeof manualChunkFromRow>[0][]).map(manualChunkFromRow),
        };
      }
    },
  };
});
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
vi.mock("@/lib/forms/prior-forms", () => ({
  priorFormsReadingForChat: async () => ({ attach: [], possible: [], identity: "none" }),
}));

process.env.NEXT_PUBLIC_DEMO_MODE = "false";
vi.setConfig({ hookTimeout: 30_000, testTimeout: 60_000 });

const { ensureTemplateLibrary } = await import("@/lib/forms/repository");
const { createInlineForm } = await import("@/features/chat/create-inline-form");
const chatRoute = await import("./route");
const instancesRoute = await import("../forms/instances/route");
const instanceRoute = await import("../forms/instances/[id]/route");
const draftRoute = await import("../forms/instances/[id]/draft/route");

/** Production's form path (the full remap), with the flags the coordinator's live cases name. */
const PROD_FLAGS = [
  "FORM_FULL_REMAP_ENABLED",
  "KEEP_FORM_EMPLOYEE_ENABLED",
  "LATE_OPEN_DATE_ENABLED",
  "DRAFT_ACTIONS_ENABLED",
  "CONVERSATION_DRAFT_REUSE_ENABLED",
] as const;
const FLAG = "FORM_EDIT_DATE_RULES_ENABLED";
/** Merged-bundle flags, default off, that cover parts of QA's B-list outside this flag. */
const BUNDLE_FLAGS = ["REMAP_INCIDENT_FIX_ENABLED", "PRIOR_ACTIONS_PARSE_ENABLED", "PAYROLL_DEDUCT_AMOUNT_ENABLED"] as const;
const TODAY = "2026-10-25";
const saved = new Map<string, string | undefined>();

const LATE_OPENING_MODEL = {
  values: {
    observation:
      "Observed:\nTest was scheduled to open at 8:30am on October 17, 2026 and did not arrive until 11:06, so the store opened late.\n\nExpectation:\nAn employee assigned to open is expected to open on time.\n\nGoing Forward:\nTest should arrive in time to open.",
  },
  checked: { offense_type: ["tardiness"] },
};

function joinOverview() {
  for (const row of store.form_instances ?? []) {
    const template = store.form_templates!.find((entry) => entry.id === row.template_id);
    const version = store.form_template_versions.find((entry) => entry.id === row.template_version_id);
    Object.assign(row, {
      form_date: row.form_date ?? TODAY,
      template_key: template?.key,
      template_name: template?.name,
      layout_family: template?.layout_family,
      template_version: version?.version,
    });
  }
}

class JoiningRows extends Array<Record<string, unknown>> {
  override push(...rows: Record<string, unknown>[]) {
    const count = super.push(...rows);
    joinOverview();
    return count;
  }
}

beforeEach(async () => {
  for (const key of Object.keys(store)) (store as Record<string, unknown[]>)[key] = [];
  store.form_instances = new JoiningRows() as never;
  for (const name of [...PROD_FLAGS, FLAG, "INTENT_EXTRACTION_ENABLED", ...BUNDLE_FLAGS]) saved.set(name, process.env[name]);
  for (const name of PROD_FLAGS) process.env[name] = "true";
  delete process.env.INTENT_EXTRACTION_ENABLED;
  process.env[FLAG] = "true";
  state.remap = {};
  state.draft = LATE_OPENING_MODEL;
  state.revision = { values: {} };
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T15:00:00Z`));
  await ensureTemplateLibrary("system");
});

afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  vi.useRealTimers();
});

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const request = new Request(`https://app.test${url}`, init);
  const draft = /^\/api\/forms\/instances\/([^/]+)\/draft$/.exec(url);
  const response = draft
    ? await draftRoute.POST(request, { params: Promise.resolve({ id: draft[1]! }) })
    : url === "/api/forms/instances"
      ? await instancesRoute.POST(request)
      : null;
  if (!response) throw new Error(`no route for ${url}`);
  joinOverview();
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body;
}

function toUuid(id: string): string {
  if (/^[0-9a-f-]{36}$/.test(id)) return id;
  const uuid = randomUUID();
  for (const table of ["form_instances", "form_instance_values", "form_instance_events"] as const) {
    for (const row of store[table]) {
      if (row.id === id) row.id = uuid;
      if (row.instance_id === id) row.instance_id = uuid;
      if (row.revises_instance_id === id) row.revises_instance_id = uuid;
    }
  }
  return uuid;
}

type Answer = {
  content: string;
  formProposal?: ChatFormProposal;
  formOpened?: { instanceId: string; templateName: string; revisesInstanceId: string | null };
};

let threads = 0;

class Thread {
  readonly messages: ChatMessage[] = [];
  readonly conversationId = `conv_${Date.now().toString(36)}${(threads += 1).toString(36).padStart(4, "0")}`;
  instanceId: string | null = null;
  private sequence = 0;

  /** `recorded`: production's reply for this turn, kept in history in place of this harness's. */
  async say(question: string, remap: Record<string, unknown> = {}, recorded?: string): Promise<Answer> {
    state.remap = remap;
    const history = this.messages.map(({ id, role, content, formProposal }) => ({ id, role, content, ...(formProposal ? { formProposal } : {}) }));
    const continuation = this.instanceId ? null : continuationFor(this.messages);
    const id = `m${(this.sequence += 1)}`;
    const response = await chatRoute.POST(
      new Request("https://app.test/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question,
          mode: "standard",
          history,
          questionMessageId: id,
          conversationId: this.conversationId,
          ...(continuation ? { continueProposalTemplateKey: continuation.templateKey } : {}),
          ...(this.instanceId ? { activeFormInstanceId: this.instanceId } : {}),
        }),
      }),
    );
    const payload = (await response.json()) as Answer & { error?: string };
    expect(response.status, JSON.stringify(payload)).toBe(200);
    /* Production reads the last turn's remap slots back from chat_traces; the harness writes that row. */
    if (payload.formProposal) {
      store.chat_traces.push({
        user_id: "qa-manager",
        conversation_id: this.conversationId,
        created_at: `${TODAY}T15:00:${String(this.sequence).padStart(2, "0")}Z`,
        slots: { templateKey: payload.formProposal.templateKey, employeeName: payload.formProposal.employeeName },
      });
    }
    this.messages.push(
      { id, role: "user", content: question, createdAt: `${TODAY}T15:00:00Z` } as ChatMessage,
      {
        id: `a${this.sequence}`,
        role: "assistant",
        content: recorded ?? payload.content,
        createdAt: `${TODAY}T15:00:01Z`,
        ...(payload.formProposal ? { formProposal: payload.formProposal } : {}),
      } as ChatMessage,
    );
    if (payload.formOpened) {
      payload.formOpened.instanceId = toUuid(payload.formOpened.instanceId);
      this.instanceId = payload.formOpened.instanceId;
    }
    return payload;
  }

  get proposal(): ChatFormProposal | null {
    for (let index = this.messages.length - 1; index >= 0; index -= 1) {
      const proposal = this.messages[index]!.formProposal;
      if (proposal) return proposal;
    }
    return null;
  }

  async create() {
    expect(this.proposal, "no card to create from").not.toBeNull();
    const result = await createInlineForm({ proposal: this.proposal!, messages: this.messages, call, onCreated: () => {} });
    this.instanceId = toUuid(result.reference.instanceId);
    return this.instanceId;
  }
}

async function finalize(id: string) {
  const response = await instanceRoute.POST(
    new Request(`https://app.test/api/forms/instances/${id}`, {
      method: "POST",
      body: JSON.stringify({ action: "finalize", followUpDate: null, acknowledgeUnverifiedPolicy: true }),
    }),
    { params: Promise.resolve({ id }) },
  );
  joinOverview();
  expect(response.status, JSON.stringify(await response.clone().json())).toBe(200);
}

function line(content: string, label: string): string | null {
  const found = content.split("\n").find((entry) => entry.trim().startsWith(`**${label}:**`));
  return found ? found.trim().slice(`**${label}:**`.length).trim() : null;
}

const happened = (answer: Answer) => line(answer.content, "What happened") ?? "";
const row = (id: string) => (store.form_instances ?? []).find((entry) => entry.id === id) ?? null;
const EMPLOYEE = { employeeName: "Test Employee" };

/* ========================================================================= */

describe("edits: an explicit add appends, a replace replaces, anything else leaves What happened", () => {
  const REQUEST = "create a CA for Test Employee at Kearney for being late to open on 10-20-26, verbal, no payroll";

  it("B17 conv_mvnuh50i2hanl53: \"add that she was also on her phone\" is added in her words and the reply says so", async () => {
    const thread = new Thread();
    const first = await thread.say(REQUEST, EMPLOYEE);
    expect(happened(first)).toBeTruthy();
    const added = await thread.say("add that she was also on her phone", EMPLOYEE);
    expect(added.formProposal?.templateKey).toBe("dpoa");
    expect(happened(added)).toContain(happened(first).replace(/[.]$/, ""));
    expect(happened(added)).toContain("she was also on her phone");
    expect(added.content).toMatch(/Added to \*\*What happened\*\*, in your words: "she was also on her phone"/);
  });

  it("S22: \"change observation of offense to: …\" makes What happened exactly the manager's text", async () => {
    const LITERAL =
      "Test completed onboarding with new hire Test Newhire on 9-28-26. As of 10-16-26 Test Newhire had not acknowledged onboarding policies in Woven that should have been completed during onboarding.";
    const thread = new Thread();
    await thread.say("create a CA for general manager, test employee for violating the standards of conduct", { employeeName: "test employee" });
    await thread.say("Test Employee, General Manager", EMPLOYEE);
    const changed = await thread.say(`change observation of offense to: ${LITERAL}`, EMPLOYEE);
    expect(happened(changed)).toBe(LITERAL);
    expect(changed.content).not.toMatch(/change observation of offense/i);
  });

  it("S12: a grammar request is answered, and What happened is untouched", async () => {
    const thread = new Thread();
    const first = await thread.say(REQUEST, EMPLOYEE);
    const asked = await thread.say("can you clean up my grammar and capitalizing on proper nouns?", EMPLOYEE);
    expect(happened(asked)).toBe(happened(first));
    expect(asked.content).toMatch(/grammar/i);
    expect(asked.content).toMatch(/won't add or change any facts/);
  });

  it("conv_mvnsowzl20ljr9m: \"change the date to 10-23-26\" sets the Date and is never What happened", async () => {
    const thread = new Thread();
    await thread.say(
      "create a follow-up coaching form for Test Employee at Kearney. Follow-up observation: she now greets every guest. Progress level: improving. Specific evidence: greeted 20 of 20 guests on 10-22-26",
      EMPLOYEE,
    );
    const changed = await thread.say("change the date to 10-23-26", EMPLOYEE);
    expect(line(changed.content, "Date")).toBe("2026-10-23");
    expect(happened(changed)).not.toMatch(/change the date/i);
  });
});

describe("(d) \"X INSTEAD of Y\" means X", () => {
  it.each([["the remap as live"], ["with REMAP_INCIDENT_FIX_ENABLED (the bundle's section reader)"]])("%s: the policy is Late Opening, never Attendance", async (run) => {
    if (run.startsWith("with")) process.env.REMAP_INCIDENT_FIX_ENABLED = "true";
    const thread = new Thread();
    await thread.say("create corrective action for for Test Employee for Late Opening from the policy manual. It is a verbal warning", EMPLOYEE);
    await thread.say("can you add late opening policy to the direct policy section of this from", EMPLOYEE);
    const swapped = await thread.say("can you reference the late opening policy INSTEAD of the attendance policy", EMPLOYEE);
    expect(line(swapped.content, "Policy")).toMatch(/^Late Opening\b/);
    expect(swapped.content).not.toMatch(/Attendance/);
    expect(happened(swapped)).not.toMatch(/instead of|can you add|can you reference/i);
  });
});

describe("dates: a prior action's date is never the form's Date; \"today\" is today", () => {
  it("conv_mvnsqglc2v7zuyk: \"jba manual 11-1-25\" (the prior coaching) does not date the form", async () => {
    const thread = new Thread();
    await thread.say(
      "do verbal for team member Test Employee at empire, sd. payroll deduct does not apply. previous coaching jba manual 11-1-26. on 10-22-26 Test was not scheduled to work and came into the store to show her team her new puppy. Test was in the store 45 min",
      EMPLOYEE,
    );
    await thread.say("jba manual 11-1-25", {});
    await thread.say("cite pets in workplace", {});
    await thread.say("cite animals in the workplace policy", {});
    const answer = await thread.say("store location is empire, sd. create corrective action", EMPLOYEE);
    expect(answer.formProposal?.templateKey).toBe("dpoa");
    expect(line(answer.content, "Date")).toBe("2026-10-22");
  });

  it("Q7: \"late to open on 10-20, she was coached on 9-15\" is dated 10-20", async () => {
    const thread = new Thread();
    const answer = await thread.say("create a CA for Test Employee at Kearney, late to open on 10-20, she was coached on 9-15 for being late", EMPLOYEE);
    expect(line(answer.content, "Date")).toBe("2026-10-20");
  });

  it("H8: \"today\" with prior verbal and written dates is dated today", async () => {
    const thread = new Thread();
    await thread.say("I need a corrective action for f", {});
    const answer = await thread.say(
      "Test Employee, today, - Test set up the soap bar display, then went into the back room and stayed there until the first guest arrived at 7:57am. - When we arrived at 8:15am, the lobby lights were still off. - She was also not in dress code and was not wearing her nametag. Written warning. previous coaching. verbal (06/25/2026) and written (07/28/2026). no payroll deducation.",
      EMPLOYEE,
    );
    expect(line(answer.content, "Date")).toBe(TODAY);
  });

  it("B15 conv_mvnu46n823v1unt: \"she opened the store late today\" is dated today", async () => {
    const thread = new Thread();
    const answer = await thread.say("create a CA for Test Employee at Kearney, she opened the store late today", EMPLOYEE);
    expect(answer.formProposal?.formDate).toBe(TODAY);
    expect(line(answer.content, "Date")).toBe(TODAY);
  });
});

describe("S21: \"change the date\" on a FINALIZED form opens a revision", () => {
  it("opens a new draft of the finalized form, dated 2026-10-20", async () => {
    const earlier = new Thread();
    await earlier.say("create a corrective action form for Test Employee for opening the store late on 10-17-26. payroll deduct no", EMPLOYEE);
    const original = await earlier.create();
    await finalize(original);

    const thread = new Thread();
    await thread.say("create ca for Test Employee", EMPLOYEE);
    const edited = await thread.say("can you edit the form I already finalized for Test Employee? change the date to 10-20-26", EMPLOYEE);
    expect(edited.formProposal).toBeUndefined();
    expect(edited.formOpened?.revisesInstanceId).toBe(original);
    const revision = row(edited.formOpened!.instanceId);
    expect(revision?.status).toBe("draft");
    expect(revision?.form_date).toBe("2026-10-20");
    expect(row(original)?.status).toBe("finalized");
  });

  it("with nothing finalized on file it says so", async () => {
    const thread = new Thread();
    await thread.say("create ca for Test Employee", EMPLOYEE);
    const edited = await thread.say("can you edit the form I already finalized for Test Employee? change the date to 10-20-26", EMPLOYEE);
    expect(edited.content).toMatch(/couldn't find/i);
    expect(happened(edited)).not.toMatch(/can you edit/i);
  });
});

describe("flag off: production today", () => {
  it("B15 has no Date", async () => {
    delete process.env[FLAG];
    const thread = new Thread();
    const answer = await thread.say("create a CA for Test Employee at Kearney, she opened the store late today", EMPLOYEE);
    expect(answer.formProposal?.formDate ?? null).toBeNull();
  });
});


/*
 * ============================================================================
 * QA'S B-LIST, THE EXACT TURNS (names replaced with "Test Employee")
 * ============================================================================
 *
 *   B1  conv_mvifqra017j15ld8  late opening on 10-1-26; the manual
 *                              acknowledgement 1-1-26 was offered as the date.
 *   B2  conv_mvi7bwpw5f1mw4j   standards of conduct on 10-20-26, the 10-15-26
 *                              deadline in the account.
 *   B4  conv_mvi98yvkfuehzye   attendance on 10-20-26, "verbal", then a NEW
 *                              register-shortage form with $3.25.
 *   B8  conv_mvl9l6fkymv3c7p   late for shift on 10-20-26, prior coaching 1-1-25.
 *   G11 conv_mvlb6ils11qqyexg  (5 stars, must keep working) late open 10-21-26,
 *                              prior steps 1-1-95 and 10-5-26, $25.
 *
 * Production's form path: the full remap was on in every chat_traces row to
 * 15:55 UTC, 25 Oct 2026 (remap slots); QA reports it now off, and intent
 * extraction has never been on here (no state-prefixed query since 20 Oct). So
 * each case runs on the remap, on the proposal flow with both off, and on the
 * intent path. The date assertions are this flag's; the rest (policy page,
 * prior-action lines, the amount line) are pinned with the merged-bundle flags
 * that carry them.
 */

const B1 = "create verbal ca for Test Employee for opening store late on 10-1-26. previous coaching is jba policy manual 1-1-26. payroll deduct DOES apply and state $25 will be payroll deducted";
const B2 = "create corrective action for Test Employee for violating standards of conduct policy on 10-20-26. Test Employee failed to acknowledge policies in woven by the 10-15-26 deadline.";
const B4 = [
  "create ca form for Test Employee for violating attendance policy on 10-20-26. verbal. no payroll deduct. jba manual 1-1-26 for previous coaching",
  "verbal",
  "create ca form for Test Employee for a register shortage on 10-20-26. payroll deduct applies and $3.25 will be deducted from check. previous coaching - jba policy manual 1-20-26.",
] as const;
/* Production's replies to B4 t0 and t2 (22 Oct 2026), the name replaced. */
const B4_REPLIES = [
  "I'll draft a **Corrective Action Form** for **Test Employee** from what you've described, and check the applicable company policy before anything policy-related goes on it.\n\n**Store:** Omaha, NE (West Dodge Rd), from Woven (where Test Employee is assigned) — tell me if that should change\n\n**Policy:** Attendance, as you said. I'll quote that section from the current policy manual on the draft.\n\nIs this new corrective action a **Verbal Warning** or a **Written Warning**? Tell me here, or tick it on the form — I won't choose it for you.\n\nIs payroll deduct applicable? **No** — tell me if that should change.\n\nYou mentioned more than one date (**1/1**, **10/20**). Which date goes on the form? Say \"most recent\" (10/20), pick one, or say \"today\" for the day you create it. Every date stays in the description of what happened — this only sets the form's Date, and until you choose it is dated today.\n\n**Position:** Team Member Part Time, from Woven — tell me if that has changed and I'll flag it for review.\n\nCreate the draft here when you're ready, and edit it below — nothing is saved to anyone's file until you do.",
  "I'll draft a **Corrective Action Form** for **Test Employee** from what you've described, and check the applicable company policy before anything policy-related goes on it.\n\n**Type of warning:** Verbal Warning, as you said — tell me if that should change · **Store:** Omaha, NE (West Dodge Rd), from Woven (where Test Employee is assigned) — tell me if that should change\n\n**Policy:** Attendance, as you said. I'll quote that section from the current policy manual on the draft.\n\nIs payroll deduct applicable? **No** — tell me if that should change.\n\n**Position:** Team Member Part Time, from Woven — tell me if that has changed and I'll flag it for review.\n\nCreate the draft here when you're ready, and edit it below — nothing is saved to anyone's file until you do.",
] as const;
const B8 = "write a verbal CA for Team Member, Test Employee at Dodge, NE. On 10-20-26 Test Employee was late for shift and did not call supervisor as outlined in attendance policy. payroll deduct is not applicable. previous coaching is JBA Manual 1-1-25";
const G11 = "create a written corrective action for team member Test Employee at bellevue, ne. location. previous coaching jba manual 1-1-95, verbal ca 10-5-26. payroll deduct is applicable and $25 will be payroll deducted for late open on 10-21-26";

/** No prior step's date is the card's Date or offered as one. */
function noPriorDate(answer: Answer, prior: readonly string[]) {
  expect(answer.content).not.toMatch(/more than one date|Which date should go on the form/i);
  for (const iso of prior) {
    expect(answer.formProposal?.formDate ?? null).not.toBe(iso);
    const [year, month, day] = iso.split("-");
    expect(line(answer.content, "Date") ?? "").not.toContain(`${year}-${month}-${day}`);
  }
}

const PATHS = [
  ["the full remap (production to 15:55 UTC, 25 Oct)", () => {}],
  ["the proposal flow (remap off, as QA reports now)", () => {
    delete process.env.FORM_FULL_REMAP_ENABLED;
  }],
  ["the intent path (remap off, intent extraction on)", () => {
    delete process.env.FORM_FULL_REMAP_ENABLED;
    process.env.INTENT_EXTRACTION_ENABLED = "true";
  }],
] as const;

describe.each(PATHS)("QA B-list on %s: a prior step's date is never the form's", (_path, setPath) => {
  it("B1: dated 2026-10-01, never the 1-1-26 acknowledgement", async () => {
    setPath();
    const answer = await new Thread().say(B1, EMPLOYEE);
    expect(answer.formProposal?.formDate).toBe("2026-10-01");
    noPriorDate(answer, ["2026-01-01"]);
  });

  it("B2: dated 2026-10-20, with no invented date", async () => {
    setPath();
    const answer = await new Thread().say(B2, EMPLOYEE);
    expect(answer.formProposal?.formDate).toBe("2026-10-20");
    expect(answer.content).not.toMatch(/9[/-]30|09-30/);
    /* Nothing the manager did not type is an Action Plan on the card. */
    expect(line(answer.content, "Action plan")).toBeNull();
  });

  it("B4: the offense date is the only date; the register shortage is a new form with $3.25", async () => {
    setPath();
    const thread = new Thread();
    const first = await thread.say(B4[0], EMPLOYEE, B4_REPLIES[0]);
    expect(first.formProposal?.formDate).toBe("2026-10-20");
    noPriorDate(first, ["2026-01-01"]);
    const second = await thread.say(B4[1], EMPLOYEE, B4_REPLIES[1]);
    noPriorDate(second, ["2026-01-01"]);
    const third = await thread.say(B4[2], EMPLOYEE);
    noPriorDate(third, ["2026-01-20", "2026-01-01"]);
    if (third.formProposal) expect(third.formProposal.formDate).toBe("2026-10-20");
    /* The amount line on the proposal flow is PAYROLL_DEDUCT_AMOUNT_ENABLED's; the remap prints it. */
    if (process.env.FORM_FULL_REMAP_ENABLED) expect(line(third.content, "Payroll deduction amount")).toBe("$3.25");
  });

  it("B8: dated 2026-10-20, never the 1-1-25 coaching", async () => {
    setPath();
    const answer = await new Thread().say(B8, EMPLOYEE);
    expect(answer.formProposal?.formDate).toBe("2026-10-20");
    noPriorDate(answer, ["2025-01-01"]);
  });

  it("G11: dated 2026-10-21, never a prior step's date", async () => {
    setPath();
    const answer = await new Thread().say(G11, EMPLOYEE);
    /*
     * The intent path answers "Which warning level did you mean?" here (the
     * prior "verbal ca 10-5-26" beside "written"): warning-level reading, not
     * this flag's; the other paths carry a card.
     */
    if (!process.env.INTENT_EXTRACTION_ENABLED) expect(answer.formProposal?.formDate).toBe("2026-10-21");
    noPriorDate(answer, ["2095-01-01", "2026-10-05"]);
  });
});

describe("QA B-list on the full remap with the merged-bundle flags that carry the rest", () => {
  beforeEach(() => {
    for (const name of BUNDLE_FLAGS) process.env[name] = "true";
  });

  it("B1: Late Opening p.15 and the $25 line", async () => {
    const answer = await new Thread().say(B1, EMPLOYEE);
    expect(line(answer.content, "Date")).toBe("2026-10-01");
    expect(line(answer.content, "Policy")).toMatch(/^Late Opening Policy, JBA Policy Manual p\.15/);
    expect(line(answer.content, "Payroll deduction amount")).toBe("$25");
  });

  it("B4 t4: a new register-shortage form, $3.25, not Attendance", async () => {
    const thread = new Thread();
    await thread.say(B4[0], EMPLOYEE, B4_REPLIES[0]);
    await thread.say(B4[1], EMPLOYEE, B4_REPLIES[1]);
    const third = await thread.say(B4[2], EMPLOYEE);
    expect(happened(third)).toMatch(/register shortage/);
    expect(line(third.content, "Payroll deduction amount")).toBe("$3.25");
    expect(line(third.content, "Policy")).not.toMatch(/Attendance/);
  });

  it("B8: a filled verbal CA, Attendance, and the prior coaching line", async () => {
    const answer = await new Thread().say(B8, EMPLOYEE);
    expect(line(answer.content, "Type of warning")).toMatch(/^Verbal Warning/);
    expect(line(answer.content, "Policy")).toMatch(/^Attendance Policy/);
    expect(line(answer.content, "Prior actions")).toMatch(/01\/01\/2025/);
  });

  it("G11: every prior step and the $25 are kept", async () => {
    const answer = await new Thread().say(G11, EMPLOYEE);
    // Expectation changed on purpose (merge of main into PR 134): with
    // PRIOR_ACTIONS_PARSE_ENABLED a two-digit year is never in the future, so
    // "jba manual 1-1-95" is 01/01/1995, not 01/01/2095 (QA B13 P0 G11,
    // conv_mvnt9m172krh73y; see b13-remap-p0-oct25.test.ts). Both steps are still required.
    expect(line(answer.content, "Prior actions")).toMatch(/01\/01\/1995.*10\/05\/2026/);
    expect(line(answer.content, "Payroll deduction amount")).toBe("$25");
    expect(line(answer.content, "Date")).toBe("2026-10-21");
  });
});
