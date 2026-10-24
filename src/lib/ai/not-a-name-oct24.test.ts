import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import { rosterResultFor } from "@/test/roster-result";
import type { AccessScope, ChatMessage } from "@/types";
import { notANameGuardEnabled } from "@/lib/config/chat-quality-flags";

import { groundFormSlots, type FormRemapSlots } from "./form-full-remap";
import type { ConversationFormState } from "./form-state";
import { decideIntentTurn } from "./intent-slots";

/**
 * ============================================================================
 * PORTED FROM ASK SUNNY — QA ROUND 4, 24 OCT 2026: NON-NAMES TAKEN AS THE EMPLOYEE
 * ============================================================================
 *
 * Ask Sunny's four low-rated chats, in this app's words (store, not salon;
 * this app's stores and job titles; no Ask Sunny products):
 *
 *   "1. employee name is blank"                       → employee "Blank"
 *   a pasted, priced offer list                       → "which of them" over the offers
 *   the assistant's "require practice"                → employee "require practice"
 *   "coaching form for bellevue location soap maker, test testy"
 *                                                     → "test testy or bellevue?"
 *   "coaching form for soaps and retail"              → two products asked about as people
 *
 * Each runs through this app's live readers: the full remap
 * (FORM_FULL_REMAP_ENABLED, on in production — `groundFormSlots` is what
 * `remapFormTurn` returns), the intent read (INTENT_EXTRACTION_ENABLED,
 * `decideIntentTurn`), and the proposal the remap falls back to. Each runs
 * with TYPED_NAME_ENABLED off and on. The remap and intent models are
 * stand-ins that copy what a model copied in Ask Sunny's production traces:
 * the placeholder, the offer, the assistant's phrase, the city.
 */

const store: FakeStore = {
  form_instances: [],
  form_instance_values: [],
  form_instance_events: [],
  form_template_versions: [],
  form_templates: [],
  form_template_current: [],
  form_template_assets: [],
};

vi.mock("@/lib/supabase/server", () => ({ getSupabaseAdmin: () => fakeSupabase(store) }));
vi.mock("@/lib/forms/employee-roster", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/forms/employee-roster")>();
  return {
    ...actual,
    loadScopedRoster: async (scope: AccessScope | null) => actual.scopeRoster([] as never, scope),
    loadScopedRosterResult: async (scope: AccessScope | null) => rosterResultFor(actual.scopeRoster, [] as never, scope),
  };
});

process.env.NEXT_PUBLIC_DEMO_MODE = "false";
const { ensureTemplateLibrary, listTemplateSummaries } = await import("@/lib/forms/repository");
const { proposeFormForTurn } = await import("./form-proposal");

const TODAY = "2026-10-24";
const SCOPE: AccessScope = { level: "global", primaryAreaId: null, alsoCoversAreaIds: [] };
const PROFILE = ["FORM_FULL_REMAP_ENABLED", "INTENT_EXTRACTION_ENABLED"] as const;

const STORES = [
  { id: "loc-66", name: "Kearney, NE" },
  { id: "loc-67", name: "Bellevue, NE" },
] as const;
const TEMPLATES = [
  { key: "dpoa", name: "Corrective Action Form" },
  { key: "coaching", name: "Coaching Form" },
  { key: "follow-up-coaching", name: "Follow-Up Coaching Form" },
  { key: "policy-review", name: "Policy Review" },
] as const;

interface Case {
  readonly id: string;
  readonly turns: readonly string[];
  /** This app's reply in place of the one it gives, by turn index (the advice answer). */
  readonly recorded?: Readonly<Record<number, string>>;
  /** What the stand-in model copies as the employee on each turn (null: nobody). */
  readonly model: readonly (string | null)[];
  readonly banned: readonly string[];
  /** The typed name that must still be found, and from which turn on. */
  readonly person?: { readonly from: number; readonly name: RegExp };
}

const OFFERS = `Timeline: October 1 – October 31
Offers:
• $5 Mini Bars
• Eight Mini Bars for $35
• Holiday Gift Box: KIT Winter Bundle for $79.99 ($64.98 Savings + $6 Bonus)
➢ BOT Winter Body Wash
➢ BOT Winter Hand Cream
➢ BOT Winter Face Serum
➢ Five Makery Passes`;

const PREP_REPLY = `Happy to help. To make it specific, tell me who it's with and what you've observed — but here's the prep structure to work from in the meantime.

**What to actually say** — state the observed behavior, explain why it matters, demonstrate the correct behavior or verbiage, require practice, set a follow-up expectation, and capture the employee's acknowledgement.

As a general approach, hold it privately, early in the shift when there's still time to practice and watch it play out, and keep it to one focus so the person leaves knowing exactly what to do with the next guest.`;

const CASES: readonly Case[] = [
  {
    id: "blank + offer list (conv_mvmvo5wf2p0o2b7)",
    turns: [
      "help me create a coaching form",
      "1.  Can I keep this field blank to use this coaching form with multiple staff?\n2. October 1st\n3. it's for october promotions, can i upload the pdf to read off of?\n4. soap maker",
      "1. employee name is blank\n2. knowledge on october promotions",
      Array.from({ length: 7 }, () => OFFERS).join("\n"),
      "for test employe.  all of it if possible",
      "oh lets create a follow-up coaching form instead then",
    ],
    model: [null, null, "blank", "Mini Bars", "test employe", "test employe"],
    banned: ["blank", "Mini Bars", "Winter", "Gift Box", "Makery Passes", "Timeline", "If Possible"],
    person: { from: 4, name: /^test employe$/i },
  },
  {
    id: "the assistant's require practice (conv_mvmvmo6w2bvg7ub)",
    turns: [
      "Help me prepare for a coaching conversation.",
      "I have an employee that is not verifying documents are signed",
      "The Cash Count Sheet and Opening Checklist, Waiver Agreements",
      "Can you create a coaching form and a policy review? I'd like to see both",
      "create a coaching form for Jordan Testperson",
    ],
    recorded: { 0: PREP_REPLY },
    model: [null, "require practice", "require practice", "require practice", "Jordan Testperson"],
    banned: ["require", "practice", "Cash Count", "Opening Checklist", "Waiver"],
    person: { from: 4, name: /^Jordan Testperson$/ },
  },
  {
    id: "the city before 'location' (conv_mvmvxluj2j5fqmw)",
    turns: [
      "create coaching form for employee test testy who is a soap maker at kearney. on 9-29-26 test was out of dress code",
      "employee name is test testy",
      "create a coaching form for bellevue location soap maker, test testy, who was talking on her cell phone for 25 minutes on 9-29-26 when guests were waiting to check out",
      "store location is bellevue, ne",
      "Create a Coaching Form from this conversation.",
    ],
    model: ["test testy", "test testy", "bellevue", "bellevue", "test testy"],
    banned: ["bellevue", "kearney"],
    person: { from: 0, name: /^test testy$/i },
  },
  {
    id: "two products after 'coaching form for' (conv_mvmw5z9x2txk4it)",
    turns: [
      "Can you create a coaching form for soaps and retail",
      "Can you make a weekly coaching for how to sell soaps",
      "create a coaching form for Jordan Testperson",
    ],
    model: ["soaps", "soaps", "Jordan Testperson"],
    banned: ["soap", "retail", "Here"],
    person: { from: 2, name: /^Jordan Testperson$/ },
  },
];

interface Seen {
  readonly path: string;
  readonly turn: number;
  readonly employeeName: string | null;
  readonly asked: string;
}

/** The lines that ask the manager to pick or confirm a person. */
function personQuestions(content: string): string {
  return content
    .split("\n")
    .filter((line) => /which of them|did you mean|which person|who is this/i.test(line))
    .join("\n");
}

function history(item: Case, upTo: number, replies: readonly string[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (let index = 0; index < upTo; index += 1) {
    out.push({ id: `u${index}`, role: "user", content: item.turns[index]!, createdAt: `${TODAY}T18:00:00Z` } as ChatMessage);
    out.push({
      id: `a${index}`,
      role: "assistant",
      content: item.recorded?.[index] ?? replies[index] ?? "",
      createdAt: `${TODAY}T18:00:01Z`,
    } as ChatMessage);
  }
  return out;
}

/** The full remap, turn by turn, keeping the slots it kept. */
function throughRemap(item: Case): Seen[] {
  const seen: Seen[] = [];
  const replies: string[] = [];
  let saved: Partial<FormRemapSlots> | null = null;
  for (const [index, question] of item.turns.entries()) {
    const { slots, response } = groundFormSlots({
      raw: { templateKey: null, employeeName: item.model[index] ?? null, observation: null, actionPlan: null },
      history: history(item, index, replies),
      question,
      today: TODAY,
      people: [],
      saved,
    });
    saved = slots;
    replies.push(response.content);
    seen.push({ path: "remap", turn: index, employeeName: response.formProposal?.employeeName ?? slots.employeeName, asked: personQuestions(response.content) });
  }
  return seen;
}

/** The intent read, turn by turn, keeping the state it kept. */
function throughIntent(item: Case): Seen[] {
  const seen: Seen[] = [];
  let saved: ConversationFormState | null = null;
  for (const [index, question] of item.turns.entries()) {
    const decision = decideIntentTurn({
      question,
      history: history(item, index, []).map((turn) => ({ role: turn.role, content: turn.content })),
      today: TODAY,
      saved,
      raw: {
        employee: item.model[index] ?? null,
        store: null,
        title: null,
        incidentType: null,
        incidentDate: null,
        payrollAmount: null,
        warningLevel: null,
        formType: null,
        formTurn: index > 0,
      },
      people: [],
      stores: STORES,
      headings: [],
      templates: TEMPLATES,
      formInProgress: index > 0,
    });
    saved = decision.state;
    seen.push({ path: "intent", turn: index, employeeName: decision.state.employeeName, asked: personQuestions(decision.clarification ?? "") });
  }
  return seen;
}

/** The proposal the remap falls back to. */
async function throughProposal(item: Case): Promise<Seen[]> {
  const seen: Seen[] = [];
  const replies: string[] = [];
  let open: string | undefined;
  for (const [index, question] of item.turns.entries()) {
    const response = await proposeFormForTurn({
      history: history(item, index, replies),
      question,
      questionMessageId: `u${index}`,
      actor: { role: "owner", scope: SCOPE },
      summaries: await listTemplateSummaries(),
      today: TODAY,
      ...(open ? { continueTemplateKey: open } : {}),
    });
    if (response?.formProposal) open = response.formProposal.templateKey;
    replies.push(response?.content ?? "");
    seen.push({ path: "proposal", turn: index, employeeName: response?.formProposal?.employeeName ?? null, asked: personQuestions(response?.content ?? "") });
  }
  return seen;
}

function check(item: Case, seen: readonly Seen[]) {
  for (const row of seen) {
    const where = `${row.path} turn ${row.turn + 1}: ${item.turns[row.turn]!.slice(0, 50)}`;
    for (const word of item.banned) {
      expect(row.employeeName?.toLowerCase() ?? "", `${where} — employee`).not.toContain(word.toLowerCase());
      expect(row.asked.toLowerCase(), `${where} — asked`).not.toContain(word.toLowerCase());
    }
  }
}

function checkPerson(item: Case, seen: readonly Seen[]) {
  if (!item.person) return;
  for (const row of seen.filter((entry) => entry.turn >= item.person!.from)) {
    expect(row.employeeName ?? "", `${row.path} turn ${row.turn + 1}`).toMatch(item.person.name);
  }
}

beforeEach(async () => {
  for (const key of Object.keys(store) as (keyof FakeStore)[]) store[key] = [];
  for (const flag of PROFILE) vi.stubEnv(flag, "true");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T18:00:00Z`));
  await ensureTemplateLibrary("system");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("NOT_A_NAME_GUARD_ENABLED", () => {
  it("defaults off", () => {
    vi.unstubAllEnvs();
    expect(notANameGuardEnabled()).toBe(false);
  });
});

describe.each([
  ["TYPED_NAME_ENABLED off", ""],
  ["TYPED_NAME_ENABLED on", "true"],
])("ported QA round 4, guard on, %s", (_label, typed) => {
  beforeEach(() => {
    vi.stubEnv("NOT_A_NAME_GUARD_ENABLED", "true");
    vi.stubEnv("TYPED_NAME_ENABLED", typed);
  });

  it.each(CASES.map((item) => [item.id, item] as const))("%s: the remap never takes a non-name, and keeps the typed name", (_id, item) => {
    const seen = throughRemap(item);
    check(item, seen);
    checkPerson(item, seen);
  });

  it.each(CASES.map((item) => [item.id, item] as const))("%s: the intent read never takes a non-name, and keeps the typed name", (_id, item) => {
    const seen = throughIntent(item);
    check(item, seen);
    checkPerson(item, seen);
  });

  it.each(CASES.map((item) => [item.id, item] as const))("%s: the proposal never offers a non-name", async (_id, item) => {
    check(item, await throughProposal(item));
  });
});
