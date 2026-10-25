import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakeSupabase, type FakeStore } from "@/test/fake-supabase";
import { rosterResultFor } from "@/test/roster-result";
import type { AccessScope, ChatMessage } from "@/types";
import { nameConfirmationQuestion } from "@/lib/forms/employee-match";

import { groundFormSlots, remapShouldRun, type FormRemapSlots } from "./form-full-remap";
import { type ConversationFormState } from "./form-state";
import type { GroundedPerson } from "./grounded-entities";
import { decideIntentTurn } from "./intent-slots";

/**
 * ============================================================================
 * PORTED FROM ASK SUNNY — QA FULL CHAT HISTORY (25 OCT 2026), AND THIS APP'S B14
 * ============================================================================
 *
 * Ask Sunny's history cases in this app's words (store, not salon; this app's
 * job titles; invented names), and this app's own QA turns word for word
 * (conv_mvntwwn22a8fgi0, conv_mvntxr592mc1e2l, conv_mvnsowzl20ljr9m,
 * conv_mvntknq72ydpo00 — QA's "Test Employee" kept). Each runs through this
 * app's live readers: the full remap (FORM_FULL_REMAP_ENABLED, on in
 * production — `groundFormSlots` is what `remapFormTurn` returns), the intent
 * read (`decideIntentTurn`), and where the remap hands a turn on, the form
 * proposal. The words that are the bug stay as typed: "On", "When Maddie",
 * "September Promo", "empolyee", "keep", "yes".
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
  readonly turns: readonly string[];
  /** This app's reply in place of the one it gives, by turn index. */
  readonly recorded?: Readonly<Record<number, string>>;
  /** What the stand-in model copies as the employee on each turn (null: nobody). */
  readonly model?: readonly (string | null)[];
  /** The form the stand-in model picks on each turn (remap templateKey, intent formType). */
  readonly form?: readonly (string | null)[];
  /** The title the stand-in intent model types on each turn. */
  readonly title?: readonly (string | null)[];
  readonly people?: readonly GroundedPerson[];
}

interface Seen {
  readonly path: "remap" | "intent";
  readonly turn: number;
  readonly employeeName: string | null;
  readonly templateKey: string | null;
  readonly title: string | null;
  readonly payrollDeduct: string | null;
  readonly content: string;
}

function person(name: string, title: string | null = "Team Member"): GroundedPerson {
  const [firstName, lastName] = name.split(" ");
  return {
    id: name.toLowerCase().replace(/\s+/g, "-"),
    firstName: firstName!,
    lastName: lastName!,
    preferredFirstName: null,
    locationIds: ["loc-66"],
    title,
    primaryLocationName: "Kearney, NE",
  } as unknown as GroundedPerson;
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
  return out.slice(-20);
}

function throughRemap(item: Case): Seen[] {
  const seen: Seen[] = [];
  const replies: string[] = [];
  let saved: Partial<FormRemapSlots> | null = null;
  for (const [index, question] of item.turns.entries()) {
    const { slots, response } = groundFormSlots({
      raw: { templateKey: item.form?.[index] ?? null, employeeName: item.model?.[index] ?? null, observation: null, actionPlan: null },
      history: history(item, index, replies),
      question,
      today: TODAY,
      people: item.people ?? [],
      saved,
    });
    saved = slots;
    replies.push(response.content);
    seen.push({
      path: "remap",
      turn: index,
      employeeName: response.formProposal?.employeeName ?? slots.employeeName,
      templateKey: response.formProposal?.templateKey ?? slots.templateKey,
      title: slots.jobTitle,
      payrollDeduct: slots.payrollDeduct,
      content: response.content,
    });
  }
  return seen;
}

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
        employee: item.model?.[index] ?? null,
        store: null,
        title: item.title?.[index] ?? null,
        incidentType: null,
        incidentDate: null,
        payrollAmount: null,
        warningLevel: null,
        formType: item.form?.[index] ?? null,
        formTurn: true,
      },
      people: item.people ?? [],
      stores: STORES,
      headings: [],
      templates: TEMPLATES,
      formInProgress: index > 0,
    });
    saved = decision.state;
    seen.push({
      path: "intent",
      turn: index,
      employeeName: decision.state.employeeName,
      templateKey: decision.state.templateKey,
      title: decision.state.title,
      payrollDeduct: decision.state.payrollDeduct ?? null,
      content: decision.clarification ?? "",
    });
  }
  return seen;
}

/** The people a reply offers to pick from or confirm: the bold names on a "which of them" / "did you mean" line. */
function offered(content: string): string[] {
  return content
    .split("\n")
    .filter((line) => /which of them|did you mean|which person|who is this/i.test(line))
    .flatMap((line) => [...line.matchAll(/\*\*([^*]+)\*\*/g)].map((match) => match[1]!.trim().toLowerCase()));
}

function expectNever(seen: readonly Seen[], banned: readonly string[]) {
  for (const row of seen) {
    const where = `${row.path} turn ${row.turn + 1}`;
    const names = offered(row.content);
    for (const word of banned) {
      const whole = new RegExp(`(?:^|\\s)${word.toLowerCase()}(?:\\s|$)`);
      expect(whole.test(row.employeeName?.toLowerCase() ?? ""), `${where} — employee ${row.employeeName}`).toBe(false);
      expect(names.some((name) => whole.test(name)), `${where} — offered ${names.join(", ")}`).toBe(false);
    }
  }
}

const both = (item: Case) => [...throughRemap(item), ...throughIntent(item)];

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

/* ------------------------------------------------------------- names -- */

describe("ported P2: words that are not the employee (NOT_A_NAME_GUARD_ENABLED)", () => {
  beforeEach(() => {
    vi.stubEnv("NOT_A_NAME_GUARD_ENABLED", "true");
  });

  it('"<A>, <B> or On?" — "On" is never offered', () => {
    const seen = both({
      turns: [
        "create a coaching document for Dana Quill regarding On 10-16-26 the Woven policy acknowledgement report reflected that Rory Vance did not complete required policy acknowledgements during her onboarding on 9-28-26. Dana is responsible for making sure all new hires complete required policy acknowledgements during onboarding.",
        "coaching form for Dana Quill",
      ],
      model: ["Dana Quill", "Dana Quill"],
    });
    expectNever(seen, ["On"]);
    for (const row of seen) expect(row.employeeName, row.path).toBe("Dana Quill");
  });

  it.each([
    ["the model names the employee", ["Jodie Marsh", "jodie marsh"]],
    ["the model names nobody", [null, null]],
  ] as const)('"<A> or When Maddie?" — %s', (_label, names) => {
    const seen = both({
      turns: [
        "Jodie Marsh, today, - Jodi set up the soap bar display, then went into the back room and stayed there until the first guest arrived at 9:57am.\n- When we arrived at 10:15am, the lobby lights were still off.\n- When Maddie asked whether she had completed her opening checklist, Jodi said yes. The footage showed that it had not been completed.\n- She was also not in dress code and was not wearing her nametag. Written warning. previous coaching. verbal (06/25/2026) and written (07/28/2026). no payroll deducation. Team Member",
        "jodie marsh",
      ],
      model: names,
      form: ["dpoa", "dpoa"],
    });
    expectNever(seen, ["When Maddie", "Maddie", "Warning Level"]);
    // The intent read takes a name only from the model or the directory; the remap reads the manager's words too.
    const named = seen.filter((entry) => entry.turn === 1 && (entry.path === "remap" || names[1] !== null));
    for (const row of named) expect(row.employeeName?.toLowerCase(), row.path).toBe("jodie marsh");
  });

  it('"<A> or September Promo?" — QA\'s prior-coaching turn names one person (conv_mvntwwn22a8fgi0)', () => {
    const seen = both({
      turns: [
        "create a CA for Test Employee at Kearney for not following the promo setup on 10-20-26. Prior coaching: September Promo coaching 9/29/26, product coaching form 9/30/26",
      ],
      model: ["Test Employee"],
      form: ["dpoa"],
    });
    expectNever(seen, ["September Promo", "September"]);
    for (const row of seen) expect(row.employeeName, row.path).toBe("Test Employee");
  });

  it('"<A> or Shift Lead Kearney?" — the title and store typed as item 4 are not a person', () => {
    const seen = both({
      turns: [
        "Create a coaching form.",
        "1. casey wendell 2.today 3. i have observed casey running late for shifts even though she is communicating we want to avoid this from happening  4. shift lead kearney",
        "1.  Casey Wendell 2. today 3. Shift Lead Kearney",
      ],
      model: [null, "casey wendell", "Casey Wendell"],
      form: ["coaching", "coaching", "coaching"],
    });
    expectNever(seen, ["Shift Lead", "Kearney", "Shift Lead Kearney"]);
  });

  /*
   * Ask Sunny conv_mvb75wuo2nnsluv. A misspelt "employee", and a job title of
   * this business typed in front of the name (misspelt here: "Manger"), were
   * part of the name the model copied, and "empolyee <name>" was a second
   * candidate.
   */
  it.each([
    ["the model copies the name", ["Blair Sutton", "Blair Sutton", "Blair Sutton"]],
    ["the model copies the role with it", ["empolyee Blair Sutton", "Store Manger Blair Sutton", null]],
    ["the model names nobody", [null, null, null]],
  ] as const)("empolyee and the job title are not part of the name — %s", (_label, names) => {
    const seen = both({
      turns: [
        "corrective action form for empolyee Blair Sutton for opening store late",
        "can you format a corrective action form for Store Manger Blair Sutton who opened the store late today",
        "make the corrective action form draft printable as is",
      ],
      model: names,
      form: ["dpoa", "dpoa", "dpoa"],
    });
    for (const row of seen) {
      expect(offered(row.content), `${row.path} turn ${row.turn + 1}`).toEqual([]);
      // The intent read takes a name only from the model or the directory; with no model name it has none.
      if (row.path === "intent" && names.every((name) => name === null)) {
        expect(row.employeeName, `${row.path} turn ${row.turn + 1}`).toBeNull();
      } else {
        expect(row.employeeName, `${row.path} turn ${row.turn + 1}`).toBe("Blair Sutton");
      }
    }
  });

  it('"keep <name>" after "Did you mean …?" keeps the name as typed, and never names the declined person', () => {
    const seen = throughRemap({
      turns: ["can you create me a ca form for karolyn", "keep karolyn", "she was caught vaping, given verbal warning"],
      recorded: { 0: nameConfirmationQuestion("karolyn", ["Karolina Wexler"]) },
      model: ["karolyn", "keep karolyn", null],
      form: ["dpoa", "dpoa", "dpoa"],
      people: [person("Karolina Wexler")],
    });
    expectNever(seen, ["keep"]);
    for (const row of seen) {
      expect(row.employeeName?.toLowerCase(), `turn ${row.turn + 1}`).toBe("karolyn");
      expect(row.content, `turn ${row.turn + 1}`).not.toMatch(/\*\*Employee:\*\* Karolina Wexler/);
    }
  });

  it('"yes" to "Did you mean <name>?" is that person', () => {
    const seen = throughIntent({
      turns: [
        "Now that I have Casey's coaching uploaded for being late, I need a corrective Action document for Casey being late again today.",
        "yes",
      ],
      recorded: { 0: nameConfirmationQuestion("Casey", ["Casey Wendell"]) },
      model: ["Casey", null],
      form: ["dpoa", "dpoa"],
      people: [person("Casey Wendell")],
    });
    expect(seen[1]!.employeeName).toBe("Casey Wendell");
  });

  it("the steps of a training are not people (Ask Sunny G5)", () => {
    const seen = both({
      turns: [
        "Create a coaching form for an assistant manager on completing new hire training appropriately. Video, activity, roleplay, assessment.",
        "Test Employee today, she's not consistent when training new hires. It's not being completed in the correct way. For example, following the correct procedure. Video, activity/roleplay, assessment. When the training is complete, uploading the appropriate documentation to their file.",
      ],
      model: [null, "Test Employee"],
      form: ["coaching", "coaching"],
    });
    expectNever(seen, ["Video", "assessment", "activity", "roleplay"]);
    for (const row of seen.filter((entry) => entry.turn === 1)) expect(row.employeeName, row.path).toBe("Test Employee");
  });
});

/* ----------------------------------------------------------- payroll -- */

describe("PAYROLL_DEDUCTIBLE_WORD_ENABLED (ported): \"payroll is deductable\" is Yes", () => {
  const item: Case = {
    turns: ["create a corrective action form for Test Employee, she was caught vaping, verbal warning", "payroll is deductable"],
    model: ["Test Employee", null],
    form: ["dpoa", "dpoa"],
  };

  it("on", () => {
    vi.stubEnv("PAYROLL_DEDUCTIBLE_WORD_ENABLED", "true");
    const seen = throughRemap(item);
    expect(seen[1]!.payrollDeduct).toBe("yes");
    expect(seen[1]!.content).not.toMatch(/Is payroll deduct applicable\?/);
  });

  it("off: read as nothing, as in production", () => {
    const seen = throughRemap(item);
    expect(seen[1]!.payrollDeduct).toBeNull();
  });
});

/* ------------------------------------------------------------- titles -- */

describe("TITLE_WHOLE_WORD_ENABLED: titles the manager never gave", () => {
  beforeEach(() => {
    vi.stubEnv("TITLE_WHOLE_WORD_ENABLED", "true");
  });

  // Ask Sunny S28 / this app's B5: "HR" read inside "three" off a directory title.
  it("no HR title from \"three shifts\"", () => {
    const seen = both({
      turns: [
        "I have an employee Test Employee at our Kearney store who has been out of dress code three shifts. I verbally coached her on the second offense and she still is out of dress code",
        "Create a Coaching Form from this conversation.",
      ],
      model: ["Test Employee", null],
      form: [null, "coaching"],
      people: [person("Casey Corp", "HR")],
    });
    for (const row of seen) expect(row.title ?? "", `${row.path} turn ${row.turn + 1}`).not.toMatch(/\bHR\b/);
  });

  // Ask Sunny H10 in this app's words: the store typed after the title.
  it('"shift lead kearney" is the title without the store', () => {
    const seen = throughIntent({
      turns: [
        "Create a coaching form.",
        "1. test employee 2.today 3. i have observed test running late for shifts even though she is communicating we want to avoid this from happening 4. shift lead kearney",
      ],
      model: [null, "test employee"],
      form: ["coaching", "coaching"],
      title: [null, "shift lead kearney"],
    });
    expect(seen[1]!.title ?? "").not.toMatch(/kearney/i);
  });
});

/* --------------------------------------------------------- wrong form -- */

describe("FORM_CHOICE_STATED_ENABLED + CA_TEMPLATE_MAP_ENABLED (live in production since B14)", () => {
  beforeEach(() => {
    vi.stubEnv("FORM_CHOICE_STATED_ENABLED", "true");
    vi.stubEnv("CA_TEMPLATE_MAP_ENABLED", "true");
  });

  const KEARNEY_PROMO =
    "create a CA for Test Employee at Kearney for not following the promo setup on 10-20-26. Prior coaching: September Promo coaching 9/29/26, product coaching form 9/30/26";

  // B14 conv_mvntwwn22a8fgi0: "Which form should I start with — the Corrective Action Form or the Coaching Form?"
  it.each([["dpoa"], ["coaching"], [null]] as const)(
    "conv_mvntwwn22a8fgi0: the coaching in the prior-coaching list is not a second form; the CA is (model: %s)",
    (form) => {
      const seen = both({ turns: [KEARNEY_PROMO], model: ["Test Employee"], form: [form] });
      for (const row of seen) {
        expect(row.content, row.path).not.toMatch(/which form should I start with/i);
        expect(row.templateKey, row.path).toBe("dpoa");
      }
    },
  );

  // B14 conv_mvntxr592mc1e2l: a Corrective Action card whose What happened was the metric.
  it("conv_mvntxr592mc1e2l: a metric alone does not open the remap's Corrective Action card", () => {
    const question = "Test Employee at Kearney has low sales per hour this month, create a corrective action";
    expect(remapShouldRun({ question, history: [], formsTurn: true })).toBe(false);
    vi.stubEnv("CA_TEMPLATE_MAP_ENABLED", "");
    expect(remapShouldRun({ question, history: [], formsTurn: true })).toBe(true);
  });

  it("conv_mvntxr592mc1e2l: the proposal it falls to answers the metric, with no card", async () => {
    const response = await proposeFormForTurn({
      history: [],
      question: "Test Employee at Kearney has low sales per hour this month, create a corrective action",
      questionMessageId: "u0",
      actor: { role: "owner", scope: SCOPE },
      summaries: await listTemplateSummaries(),
      today: TODAY,
    });
    expect(response?.formProposal ?? null).toBeNull();
    expect(response?.content ?? "").toMatch(/won't open formal corrective action off a metric/i);
  });

  // conv_mvnsowzl20ljr9m (QA S12): a plain Coaching Form before the flag; the Follow-Up Coaching Form with it.
  it("conv_mvnsowzl20ljr9m: follow-up coaching is the Follow-Up Coaching Form", () => {
    const seen = throughRemap({
      turns: [
        "create a follow-up coaching form for Test Employee at Kearney. Follow-up observation: she now greets every guest. Progress level: improving. Specific evidence: greeted 20 of 20 guests on 10-22-26",
      ],
      model: ["Test Employee"],
      form: ["follow-up-coaching"],
    });
    expect(seen[0]!.templateKey).toBe("follow-up-coaching");
  });

  // conv_mvntknq72ydpo00 (and Ask Sunny BH4, where it became a Corrective Action card).
  it("conv_mvntknq72ydpo00: preparing for a conversation opens no form, whatever the model picks", () => {
    const seen = both({
      turns: [
        "Help me prepare for a conversation with a team member.",
        "My team member Test Employee is struggling to complete production timely and it has been reported that she complains every shift to other team members.",
      ],
      model: [null, "Test Employee"],
      form: [null, "dpoa"],
    });
    for (const row of seen) expect(row.templateKey, `${row.path} turn ${row.turn + 1}`).toBeNull();
  });
});
