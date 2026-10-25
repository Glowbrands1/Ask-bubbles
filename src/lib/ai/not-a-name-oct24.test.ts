import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import { rosterResultFor } from "@/test/roster-result";
import type { AccessScope, ChatMessage } from "@/types";
import { notANameGuardEnabled } from "@/lib/config/chat-quality-flags";

import { groundFormSlots, type FormRemapSlots } from "./form-full-remap";
import { EMPTY_CONVERSATION_FORM_STATE, type ConversationFormState } from "./form-state";
import type { GroundedPerson } from "./grounded-entities";
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
  { key: "resignation-exit", name: "Resignation/Exit Form" },
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
  /** The directory, when the case needs one. */
  readonly people?: readonly GroundedPerson[];
  /** The typed name is not on that directory. */
  readonly offDirectory?: boolean;
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
  // The route keeps the last 20 turns (`LIMITS.historyTurns`).
  return out.slice(-20);
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
      people: item.people ?? [],
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
      people: item.people ?? [],
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

/**
 * ============================================================================
 * EVERY NAME GUARD ON AT ONCE — THE EARLIER NAME FIXES STILL HOLD (25 OCT 2026)
 * ============================================================================
 *
 * FORM_FULL_REMAP and INTENT_EXTRACTION (this app's live path) plus
 * NOT_A_NAME_GUARD, MANAGER_WORDS_ONLY, WARNING_LEVEL_MANAGER_ONLY and
 * CROSS_CHAT_REPLY_GUARD, with TYPED_NAME_ENABLED off and on.
 * MANAGER_WORDS_ONLY, WARNING_LEVEL_MANAGER_ONLY and CROSS_CHAT_REPLY_GUARD
 * are not in this app yet; the variables are set so this test covers them
 * the day they land, and are inert until then. The cross-chat rule may gate
 * memory recall only: a name the manager typed is never dropped from the form.
 *
 * Synthetic names only. Jordan Hale is on the directory; "jordan ha" is a
 * partial surname and stays as typed; Avery Testperson is off the directory.
 */
const HALE: GroundedPerson = {
  id: "e-jordan-hale",
  firstName: "Jordan",
  lastName: "Hale",
  locationIds: ["loc-67"],
  positionName: "Soap Maker",
  title: "Soap Maker",
  primaryLocationName: "Bellevue, NE",
};

const ALL_ON = [
  "NOT_A_NAME_GUARD_ENABLED",
  "MANAGER_WORDS_ONLY_ENABLED",
  "WARNING_LEVEL_MANAGER_ONLY_ENABLED",
  "CROSS_CHAT_REPLY_GUARD_ENABLED",
] as const;

const TYPED_NAMES: readonly Case[] = [
  {
    id: "a lowercase full name",
    turns: ["create a coaching form for jordan hale, she was late on 10/20"],
    model: ["jordan hale"],
    banned: [],
    person: { from: 0, name: /^jordan hale$/i },
    people: [HALE],
  },
  {
    id: "a lowercase first name and partial surname",
    turns: ["create a coaching form for jordan ha, she was late on 10/20"],
    model: ["jordan ha"],
    banned: [],
    person: { from: 0, name: /^jordan ha$/i },
    people: [HALE],
    offDirectory: true,
  },
  {
    id: "a partial surname as the bare reply",
    turns: ["create a coaching form", "jordan ha"],
    model: [null, "jordan ha"],
    banned: [],
    person: { from: 1, name: /^jordan ha$/i },
    people: [HALE],
    offDirectory: true,
  },
  {
    id: "a full name as the bare reply",
    turns: ["create a coaching form", "jordan hale"],
    model: [null, "jordan hale"],
    banned: [],
    person: { from: 1, name: /^jordan hale$/i },
    people: [HALE],
  },
  {
    id: "ALL CAPS on the directory",
    turns: ["COACHING FORM JORDAN HALE LATE 3 TIMES"],
    model: ["JORDAN HALE"],
    banned: [],
    person: { from: 0, name: /^jordan hale$/i },
    people: [HALE],
  },
  {
    id: "ALL CAPS off the directory",
    turns: ["COACHING FORM AVERY TESTPERSON LATE 3 TIMES"],
    model: ["AVERY TESTPERSON"],
    banned: [],
    person: { from: 0, name: /^avery testperson$/i },
    people: [HALE],
    offDirectory: true,
  },
  {
    id: "a possessive",
    turns: ["Jordan Hale's coaching form, she was late on 10/20"],
    model: ["Jordan Hale"],
    banned: [],
    person: { from: 0, name: /^jordan hale$/i },
    people: [HALE],
  },
];

function expectNoNameQuestion(seen: readonly Seen[]) {
  for (const row of seen) expect(row.asked, `${row.path} turn ${row.turn + 1}`).not.toMatch(/did you mean|which of them|which person/i);
}

describe.each([
  ["TYPED_NAME_ENABLED off", ""],
  ["TYPED_NAME_ENABLED on", "true"],
])("every name guard on, %s: typed names still reach the form", (_label, typed) => {
  beforeEach(() => {
    for (const flag of ALL_ON) vi.stubEnv(flag, "true");
    vi.stubEnv("TYPED_NAME_ENABLED", typed);
  });

  it.each(TYPED_NAMES.map((item) => [item.id, item] as const))("%s: the remap", (_id, item) => {
    const seen = throughRemap(item);
    checkPerson(item, seen);
    expectNoNameQuestion(seen);
  });

  it.each(TYPED_NAMES.map((item) => [item.id, item] as const))("%s: the intent read", (_id, item) => {
    const seen = throughIntent(item);
    // With a directory, this app's intent read keeps only a directory person
    // and leaves an off-directory name to the remap's card — guards on or
    // off. The guards must not drop the directory person.
    if (!item.offDirectory) checkPerson(item, seen);
    expectNoNameQuestion(seen);
  });

  it.each(TYPED_NAMES.map((item) => [item.id, item] as const))("%s: the proposal", async (_id, item) => {
    const seen = await throughProposal(item);
    checkPerson(item, seen);
    expectNoNameQuestion(seen);
  });
});

/**
 * ============================================================================
 * MIRROR OF ASK SUNNY QA L23 (25 OCT 2026) — A MANUAL HEADING ON AN EXIT FORM
 * ============================================================================
 *
 * In Ask Sunny a policy answer cited a manual heading that reads like a
 * name, and the exit form that followed was drafted for that heading on
 * every turn, even after the manager typed the employee. Here the answer
 * cites "Core Values" (a JBA Policy Manual heading this app cites), the
 * stand-in models copy it the way the model copied the heading there, and
 * the manager's turns are the same in this app's words.
 */
const MIRROR_TURNS = [
  "what does policy say about pets in the store",
  "assist with creating an exit form",
  "test employee, soap maker at bellevue",
  "last day worked was 9-20-26. management called her with no response on 9-27-26",
  "its a no call no show",
  "create exit form",
  "Create a form from this conversation.",
  "create exit: Test Employee, Soap Maker, Bellevue, NE\nLast day worked 9/20/26\nNo call/no show; management attempted phone contact 9/27/26, no response",
  "Create a form from this conversation.",
  "Create a form from this conversation.",
];

const MIRROR_PETS_REPLY = `Pets are out; service animals are in.

- Employees are asked not to bring pets into the workplace ("Animals in the Workplace", JBA Policy Manual p.30).
- Treat every guest and team member with respect while you handle it ("Core Values", JBA Policy Manual p.4).

If a team member is unsure how to handle a service animal at the counter, route it to HR rather than improvising.`;

const MIRROR: Case = {
  id: "a manual heading in the reply before an exit request",
  turns: MIRROR_TURNS,
  recorded: { 0: MIRROR_PETS_REPLY },
  model: [null, "Core Values", "test employee", "Core Values", "Core Values", "Core Values", "Core Values", "Test Employee", "Core Values", "Core Values"],
  banned: ["Core Values"],
  person: { from: 2, name: /^test employee$/i },
};

describe.each([
  ["TYPED_NAME_ENABLED off", ""],
  ["TYPED_NAME_ENABLED on", "true"],
])("Ask Sunny L23 mirror, guard on, %s", (_label, typed) => {
  beforeEach(() => {
    vi.stubEnv("NOT_A_NAME_GUARD_ENABLED", "true");
    vi.stubEnv("TYPED_NAME_ENABLED", typed);
  });

  it("the remap never takes the heading, and the typed employee holds from the turn it is typed", () => {
    const seen = throughRemap(MIRROR);
    check(MIRROR, seen);
    checkPerson(MIRROR, seen);
  });

  it("the intent read never takes the heading, and the typed employee holds from the turn it is typed", () => {
    const seen = throughIntent(MIRROR);
    check(MIRROR, seen);
    checkPerson(MIRROR, seen);
  });

  it("the proposal never names the heading", async () => {
    check(MIRROR, await throughProposal(MIRROR));
  });

  it("a remap slot the manager never typed is dropped, and the typed one replaces it", () => {
    const { slots } = groundFormSlots({
      raw: { templateKey: null, employeeName: "test employee", observation: null, actionPlan: null },
      history: [
        { role: "user", content: "assist with creating an exit form" },
        { role: "assistant", content: "Here is what I'll fill in on the Resignation/Exit Form for Pat Example." },
      ],
      question: "test employee, soap maker at bellevue",
      today: TODAY,
      people: [],
      saved: { employeeName: "Pat Example" },
    });
    expect(slots.employeeName?.toLowerCase()).toBe("test employee");
    const kept = groundFormSlots({
      raw: { templateKey: null, employeeName: null, observation: null, actionPlan: null },
      history: [
        { role: "user", content: "who fills in the exit paperwork?" },
        { role: "assistant", content: "The store manager does. I can start the Resignation/Exit Form for Pat Example when you're ready." },
        { role: "user", content: "assist with creating an exit form" },
      ],
      question: "create exit form",
      today: TODAY,
      people: [],
      saved: { employeeName: "Pat Example" },
    });
    expect(kept.slots.employeeName).toBeNull();
  });

  it("a saved intent employee the manager never typed is dropped, and the typed one replaces it", () => {
    const decision = decideIntentTurn({
      question: "test employee, soap maker at bellevue",
      history: [
        { role: "user", content: "assist with creating an exit form" },
        { role: "assistant", content: "Here is what I'll fill in on the Resignation/Exit Form for Pat Example." },
      ],
      today: TODAY,
      saved: { ...EMPTY_CONVERSATION_FORM_STATE, employeeName: "Pat Example", templateKey: "resignation-exit" },
      raw: { employee: "test employee", store: null, title: null, incidentType: null, incidentDate: null, payrollAmount: null, warningLevel: null, formType: null, formTurn: true },
      people: [],
      stores: STORES,
      headings: [],
      templates: TEMPLATES,
      formInProgress: true,
    });
    expect(decision.state.employeeName?.toLowerCase()).toBe("test employee");
    expect(decision.question).not.toContain("Pat Example");
  });
});

/**
 * History is capped at 20 turns. A name the manager typed in the first turn
 * of a long form chat falls out of the window; the remap's own replies keep
 * printing it as the card's subject, which is not evidence it came from a
 * reply, so it stays.
 */
const LONG_CHAT: Case = {
  id: "a name typed before the history window",
  turns: [
    "create a coaching form for Avery Testperson",
    "she was late on 10/20",
    "it was the third time this month",
    "she was 25 minutes late",
    "the coaching covers attendance",
    "I explained the attendance policy",
    "she said traffic was bad",
    "we agreed she will leave earlier",
    "follow up in two weeks",
    "job title is soap maker",
    "it happened at bellevue",
    "add that she was apologetic",
    "Create a form from this conversation.",
  ],
  model: ["Avery Testperson"],
  banned: [],
  person: { from: 0, name: /^avery testperson$/i },
};

describe.each([
  ["TYPED_NAME_ENABLED off", ""],
  ["TYPED_NAME_ENABLED on", "true"],
])("a saved name typed before the window, guard on, %s", (_label, typed) => {
  beforeEach(() => {
    vi.stubEnv("NOT_A_NAME_GUARD_ENABLED", "true");
    vi.stubEnv("TYPED_NAME_ENABLED", typed);
  });

  it("the remap keeps it", () => {
    checkPerson(LONG_CHAT, throughRemap(LONG_CHAT));
  });

  it("the intent read keeps it", () => {
    checkPerson(LONG_CHAT, throughIntent(LONG_CHAT));
  });
});
