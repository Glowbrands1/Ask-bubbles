import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CHAT_QUALITY_FLAG_NAMES, lateOpenDateEnabled } from "@/lib/config/chat-quality-flags";
import { describedAttendanceKeys } from "@/lib/forms/ca-policy";
import { yearlessCuedDates } from "@/lib/forms/late-open";
import { sectionHeadingsFor } from "@/lib/forms/official-policy-manual";

import { groundFormSlots, type FormRemapSlots } from "./form-full-remap";
import type { ConversationFormState } from "./form-state";
import { augmentIntakeQuestion } from "./intake-augment";
import { decideIntentTurn } from "./intent-slots";

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => ({ from: () => ({ insert: async () => ({ error: null }) }) }),
}));

/**
 * ============================================================================
 * QA, 24 OCT 2026 — A LATE OPENING, ITS DATE AND ITS PAYROLL ANSWER
 * ============================================================================
 *
 * Ported from Ask Sunny. The manager's words are QA's, with this app's store.
 * This app's live path is FORM_FULL_REMAP (`server-ask.ts`), over the
 * manager's own turns; the intent read's saved state is checked beside it.
 *
 * F5: "late to open 10-19, verbal, no payroll" is dated 19 October and is
 * the Late Opening section, not Attendance.
 * F6: "payroll deduct is not applicable." is payroll No, as an answer and
 * inside the request.
 * "change the date to 10-22" on an open card dates it 22 October.
 */

const TODAY = "2026-10-24";
const STORES = [
  { id: "loc-66", name: "Kearney, NE" },
  { id: "loc-67", name: "Bellevue, NE" },
] as const;
const TEMPLATES = [
  { key: "dpoa", name: "Corrective Action Form" },
  { key: "coaching", name: "Coaching Form" },
] as const;
const HEADINGS = ["Attendance", "Late Opening", "Standards of Conduct"];

afterEach(() => {
  vi.unstubAllEnvs();
});

function on() {
  vi.stubEnv("LATE_OPEN_DATE_ENABLED", "1");
  vi.stubEnv("FORM_FULL_REMAP_ENABLED", "1");
}

/** The intent model's copy of the manager's words: the date as typed, no policy guessed. */
function intentReading(manager: string) {
  return {
    employee: /test employee/i.test(manager) ? "Test Employee" : null,
    store: /kearney/i.test(manager) ? "Kearney" : null,
    title: null,
    incidentType: null,
    incidentDate: /\b\d{1,2}[-/]\d{1,2}(?:[-/]\d{2,4})?\b/.exec(manager)?.[0] ?? null,
    payrollAmount: null,
    warningLevel: /\bverbal\b/i.test(manager) ? "verbal" : null,
    formType: /\bca\b/i.test(manager) ? "corrective action" : null,
    formTurn: /\bca\b/i.test(manager),
  };
}

interface Played {
  readonly replies: string[];
  readonly slots: FormRemapSlots;
  readonly intent: ConversationFormState;
}

/**
 * Each manager turn as production runs it: FORM_FULL_REMAP grounds the card
 * from the manager's own words (the trace's original_query is the raw turn).
 * The intent read is replayed beside it over the same turns, for the state
 * it saves when INTENT_EXTRACTION_ENABLED is on; its clarifications are not
 * part of the remap path and are not sent here.
 */
function play(turns: readonly string[]): Played {
  const history: { role: string; content: string }[] = [];
  let intent: ConversationFormState | null = null;
  let slots: FormRemapSlots | null = null;
  const replies: string[] = [];
  for (const [at, manager] of turns.entries()) {
    intent = decideIntentTurn({
      question: manager,
      history: [...history],
      today: TODAY,
      saved: intent,
      raw: intentReading(manager),
      people: [],
      stores: STORES,
      headings: HEADINGS,
      templates: TEMPLATES,
      formInProgress: at > 0,
    }).state;
    const grounded = groundFormSlots({
      raw: { templateKey: "dpoa", employeeName: "Test Employee", observation: null, actionPlan: null },
      history: [...history],
      question: manager,
      today: TODAY,
      people: [],
      saved: slots,
    });
    slots = grounded.slots;
    replies.push(grounded.response.content);
    history.push({ role: "user", content: manager }, { role: "assistant", content: grounded.response.content });
  }
  return { replies, slots: slots!, intent: intent! };
}

const F5 = "CA for Test Employee at Kearney, late to open 10-19, verbal, no payroll";

describe("LATE_OPEN_DATE_ENABLED", () => {
  it("defaults off and is a chat-quality flag", () => {
    expect(lateOpenDateEnabled()).toBe(false);
    expect(CHAT_QUALITY_FLAG_NAMES).toContain("LATE_OPEN_DATE_ENABLED");
  });
});

describe("F5: late to open 10-19, verbal, no payroll", () => {
  it("is dated 10/19, Late Opening, verbal, payroll No", () => {
    on();
    const played = play([F5]);
    expect(played.slots.incidentDateIso).toBe("2026-10-19");
    expect(played.slots.policySection).toBe("Late Opening");
    expect(played.slots.warningLevel).toBe("verbal");
    expect(played.slots.payrollDeduct).toBe("no");
    expect(played.replies[0]).toMatch(/\*\*Policy:\*\* Late Opening/);
    expect(played.intent.formDate).toBe("2026-10-19");
    expect(played.intent.incidentType).toBe("Late Opening");
    expect(played.intent.payrollDeduct).toBe("no");
  });

  it("with the flag off, the intent read says Attendance and no date, and the card names no policy", () => {
    vi.stubEnv("FORM_FULL_REMAP_ENABLED", "1");
    const played = play([F5]);
    expect(played.intent.formDate).toBeNull();
    expect(played.intent.incidentType).toBe("Attendance");
    expect(played.slots.policySection).toBeNull();
  });

  it('"change the date to 10-22" on the open card dates it 10/22', () => {
    on();
    const played = play([F5, "change the date to 10-22"]);
    expect(played.slots.incidentDateIso).toBe("2026-10-22");
    expect(played.intent.formDate).toBe("2026-10-22");
    expect(played.slots.payrollDeduct).toBe("no");
  });

  it('"change the date to 10-22" beats a dated first turn ("10-19-26")', () => {
    on();
    const played = play([
      "CA for Test Employee at Kearney, was late to open the store 10-19-26, verbal, no payroll",
      "change the date to 10-22",
    ]);
    expect(played.slots.incidentDateIso).toBe("2026-10-22");
  });
});

/*
 * S1, from the sibling app's live conversation (24 Oct 2026), in this app's
 * words: the date in the second turn, the late opening in the third, and
 * "change the date to 10-21" in the fourth. Live there, the card stayed 10/20.
 */
describe("S1: the date changed after the account", () => {
  const S1 = [
    "I need a CA for Test Employee",
    "she works at Kearney and it happened on 10-20",
    "she opened the store 20 minutes late and did not call anyone",
    "change the date to 10-21",
  ];

  it("ends dated 10/21 on the card and in the saved state, as Late Opening", () => {
    on();
    const played = play(S1);
    expect(played.slots.incidentDateIso).toBe("2026-10-21");
    expect(played.intent.formDate).toBe("2026-10-21");
    expect(played.slots.policySection).toBe("Late Opening");
    expect(played.intent.incidentType).toBe("Late Opening");
  });

  it("after the second turn it is 10/20", () => {
    on();
    const played = play(S1.slice(0, 2));
    expect(played.slots.incidentDateIso).toBe("2026-10-20");
    expect(played.intent.formDate).toBe("2026-10-20");
  });
});

describe("the variants", () => {
  it.each([
    ["CA for Test Employee at Kearney, late opening 10-19, verbal, no payroll"],
    ["CA for Test Employee at Kearney, opened late on 10/19, verbal, no payroll"],
    ["CA for Test Employee at Kearney, was late to open the store 10-19-26, verbal, no payroll"],
  ])("%s", (manager) => {
    on();
    const played = play([manager]);
    expect(played.slots.incidentDateIso).toBe("2026-10-19");
    expect(played.slots.policySection).toBe("Late Opening");
    expect(played.slots.payrollDeduct).toBe("no");
    expect(played.intent.incidentType).toBe("Late Opening");
  });

  it('"arrived 20 minutes late for her shift on 10-19" is Attendance', () => {
    on();
    const played = play(["CA for Test Employee at Kearney, arrived 20 minutes late for her shift on 10-19, verbal"]);
    expect(played.slots.incidentDateIso).toBe("2026-10-19");
    expect(played.slots.policySection).not.toBe("Late Opening");
    expect(played.intent.incidentType).toBe("Attendance");
    expect(describedAttendanceKeys("arrived 20 minutes late for her shift on 10-19")).toEqual(["tardiness"]);
  });
});

describe("F6: payroll deduct is not applicable", () => {
  it.each([
    ["payroll deduct is not applicable."],
    ["payroll deduct n/a"],
    ["not applicable"],
    ["doesn't apply"],
  ])("answering the payroll question: %s", (reply) => {
    on();
    const played = play(["CA for Test Employee at Kearney, late to open 10-19, verbal", reply]);
    expect(played.replies[0]).toMatch(/payroll deduct/i);
    expect(played.slots.payrollDeduct).toBe("no");
    expect(played.intent.payrollDeduct).toBe("no");
  });

  it("inside the request", () => {
    on();
    const played = play(["CA for Test Employee at Kearney, late to open 10-19, verbal. payroll deduct is not applicable."]);
    expect(played.slots.payrollDeduct).toBe("no");
    expect(played.intent.payrollDeduct).toBe("no");
  });
});

describe("the readers behind it", () => {
  it("reads a yearless date after a cue, the most recent one, and never a range", () => {
    expect(yearlessCuedDates("late to open 10-19", TODAY).map((found) => found.iso)).toEqual(["2026-10-19"]);
    expect(yearlessCuedDates("late to open 12-20", TODAY).map((found) => found.iso)).toEqual(["2025-12-20"]);
    expect(yearlessCuedDates("she worked 10-12 hours", TODAY)).toEqual([]);
    expect(yearlessCuedDates("late to open 10-12 min", TODAY)).toEqual([]);
  });

  it("late to open is the late_opening box, which cites Late Opening only", () => {
    on();
    expect(describedAttendanceKeys("late to open 10-19, verbal, no payroll")).toEqual(["late_opening"]);
    expect(sectionHeadingsFor({ offenseKeys: ["tardiness"], notes: "late to open 10-19" })).toEqual([
      ["Late Opening"],
      ["Attendance"],
    ]);
  });

  it("the intake line takes the date a cue gave", () => {
    on();
    const out = augmentIntakeQuestion({
      slots: false,
      fields: true,
      question: "verbal, no payroll",
      history: [{ role: "user", content: "CA for Test Employee at Kearney, late to open 10-19" }],
      today: TODAY,
    });
    expect(out).toContain("It happened on 10/19/2026.");
  });
});

/*
 * ============================================================================
 * LATE_OPEN_PAYROLL_FROM_FORM_ENABLED (QA, 26 Oct 2026; ported from the
 * sibling app): A BARE YES OR NO IS PAYROLL DEDUCT ONLY WHERE THE FORM ASKED IT
 * ============================================================================
 *
 * With LATE_OPEN_DATE on (production), the intent read saved a bare "yes" or
 * "no" after an exit form, a resignation or a Corrective Action reply as
 * payroll deduct on the exit form. With the fix it is read from this form
 * only: the manager's own statement, or a bare reply to the payroll question
 * just asked on a Corrective Action Form. Each turn in lowercase, Sentence
 * case and CAPS; the twin pins main exactly. Test Employee is the QA
 * account's placeholder.
 */
describe("LATE_OPEN_PAYROLL_FROM_FORM_ENABLED, with LATE_OPEN_DATE_ENABLED on as in production", () => {
  type Answer = "yes" | "no" | null;
  const FORMS = [...TEMPLATES, { key: "exit", name: "Resignation/Exit Form" }] as const;
  const EXIT = "Create an exit form for Test Employee at Kearney, she resigned and her last day was 10-20";
  const RESIGNATION = "Create a resignation form for Test Employee at Kearney, her last day was 10-20";
  const COACHING = "Create a coaching form for Test Employee at Kearney about her cell phone use";
  const LATE_CA = "create a verbal ca for Test Employee at Kearney for being late to open on 10-20";
  const EXIT_CARD = "Here is the **Resignation/Exit Form** for **Test Employee**.\n**Payroll Deduction:** left blank for you.";
  const CA_REPLY = "Here is the Corrective Action Form.\nWhat is their job title?\nVerbal or written?\nIs payroll deduct applicable?";
  const COACHING_CARD = "Here is the **Coaching Form** for **Test Employee**.";
  const CA_CARD = "Here is the **Corrective Action Form** for **Test Employee**.\n\nIs payroll deduct applicable? Yes or No?";

  function two(request: string, assistant: string, reply: string, formType: string) {
    const turn = (question: string, history: { role: string; content: string }[], saved: ConversationFormState | null) =>
      decideIntentTurn({
        question,
        history,
        today: "2026-10-25",
        saved,
        raw: { employee: null, store: null, title: null, incidentType: null, incidentDate: null, payrollAmount: null, warningLevel: null, formType, formTurn: true },
        people: [],
        stores: STORES,
        headings: HEADINGS,
        templates: FORMS,
        formInProgress: history.length > 0,
      });
    const first = turn(request, [], null);
    const second = turn(reply, [{ role: "user", content: request }, { role: "assistant", content: assistant }], first.state);
    return { first: first.state, second: second.state };
  }

  /* [label, request, the card before the reply, reply, form, main, with the fix]. */
  const PINS: readonly (readonly [string, string, string, string, string, Answer, Answer])[] = [
    ["an exit form, then yes", EXIT, EXIT_CARD, "Yes", "exit", "yes", null],
    ["an exit form, then no", EXIT, EXIT_CARD, "No", "exit", "no", null],
    ["an exit form after a CA reply, then yes", EXIT, CA_REPLY, "Yes", "exit", "yes", null],
    ["an exit form after a CA reply, then no", EXIT, CA_REPLY, "No", "exit", "no", null],
    ["a resignation, then yes", RESIGNATION, EXIT_CARD, "Yes", "exit", "yes", null],
    ["a resignation, then no", RESIGNATION, EXIT_CARD, "No", "exit", "no", null],
    ["a Coaching Form, then yes", COACHING, COACHING_CARD, "Yes", "coaching", null, null],
    ["a Coaching Form, then no", COACHING, COACHING_CARD, "No", "coaching", null, null],
    ["a late-opening CA's payroll question, then yes", LATE_CA, CA_CARD, "Yes", "corrective action", "yes", "yes"],
    ["a late-opening CA's payroll question, then no", LATE_CA, CA_CARD, "No", "corrective action", "no", "no"],
  ];
  const CASES = PINS.flatMap(([label, request, card, reply, form, main, fixed]) => [
    [`${label} (lowercase)`, request.toLowerCase(), card, reply.toLowerCase(), form, main, fixed] as const,
    [`${label} (Sentence case)`, request, card, reply, form, main, fixed] as const,
    [`${label} (CAPS)`, request.toUpperCase(), card, reply.toUpperCase(), form, main, fixed] as const,
  ]);

  it.each(CASES)("fix on, %s", (_label, request, card, reply, form, _main, fixed) => {
    vi.stubEnv("LATE_OPEN_DATE_ENABLED", "1");
    vi.stubEnv("LATE_OPEN_PAYROLL_FROM_FORM_ENABLED", "1");
    expect(two(request, card, reply, form).second.payrollDeduct ?? null).toBe(fixed);
  });

  it.each(CASES)("fix off reads it as main, %s", (_label, request, card, reply, form, main) => {
    vi.stubEnv("LATE_OPEN_DATE_ENABLED", "1");
    vi.stubEnv("LATE_OPEN_PAYROLL_FROM_FORM_ENABLED", "");
    expect(two(request, card, reply, form).second.payrollDeduct ?? null).toBe(main);
  });

  it.each([
    ["lowercase", `${LATE_CA}, no payroll`.toLowerCase()],
    ["Sentence case", "Create a verbal CA for Test Employee at Kearney for being late to open on 10-20. No payroll."],
    ["CAPS", `${LATE_CA}, no payroll`.toUpperCase()],
  ])('"no payroll" stated in the CA request is saved as No, fix on or off (%s)', (_label, request) => {
    vi.stubEnv("LATE_OPEN_DATE_ENABLED", "1");
    for (const fix of ["1", ""]) {
      vi.stubEnv("LATE_OPEN_PAYROLL_FROM_FORM_ENABLED", fix);
      expect(two(request, CA_CARD, "ok", "corrective action").first.payrollDeduct, `fix "${fix}"`).toBe("no");
    }
  });
});

/*
 * ============================================================================
 * LIVE, 26 OCT 2026 (ported from the sibling app): WITH THE PRODUCTION BUNDLE,
 * A BARE REPLY OR AN AMOUNT WAS SAVED AS PAYROLL DEDUCT OFF A CORRECTIVE ACTION
 * ============================================================================
 *
 * The sibling app's live run with LATE_OPEN_PAYROLL_FROM_FORM_ENABLED on: an
 * exit form then "yes", "no" or "$25" stored payroll deduct, and a CA with "no
 * payroll deduct" flipped to Yes on a bare "yes". WARNING_LEVEL_MANAGER_ONLY's
 * own reply reader saved a bare reply on every form, taking the exit card's
 * "Payroll Deduction" box (or the read-back "Is payroll deduct applicable?
 * **No**") for the question, and an amount alone made payroll deduct Yes.
 * This app's intent read had the same three stores. Pinned with this app's
 * production env as read on Vercel (09:44Z; FORM_FULL_REMAP false), with
 * INTENT_PAYROLL_MANAGER_ONLY unset and set, in lowercase and Sentence case;
 * the twin pins main with the fix off.
 */
describe("LATE_OPEN_PAYROLL_FROM_FORM_ENABLED with this app's production env (WARNING_LEVEL_MANAGER_ONLY on)", () => {
  type Answer = "yes" | "no" | null;
  const BUBBLES_PROD = [
    "APP_PASSWORD_HELP", "DRAFT_NEVER_BLANK", "DRAFT_REUSE_SAME_CHAT_ONLY", "EXIT_INTAKE_FIX", "MANUAL_NEGATED_LIST_NOTE",
    "NAME_BEFORE_TITLE", "POLICY_SPECIFIC_TOPICS", "REOPEN_VERB_GUARD", "STATE_CODE_NOT_A_PERSON", "ACTION_PLAN_MANAGER_ONLY",
    "ACTION_PLAN_SENTENCES", "CA_TEMPLATE_MAP", "CHAT_TRACE", "CONVERSATION_DRAFT_REUSE", "CROSS_CHAT_REPLY_GUARD",
    "DRAFT_ACTIONS", "FIELD_ACCURACY", "FORM_CHOICE_STATED", "FORM_STATE", "FULL_MANUAL_CONTEXT", "GLOBAL_STORE_ASK",
    "GROUNDED_ENTITIES", "INTENT_EXTRACTION", "KEEP_FORM_EMPLOYEE", "LATE_OPEN_DATE", "NOT_A_NAME_GUARD",
    "PAYROLL_DEDUCT_AMOUNT", "PLACE_SPAN_GUARD", "PRINTED_PAGE_ONLY", "PRIOR_ACTIONS_PARSE", "PROMPT_CACHE",
    "REMAP_DRAFT_SOURCES", "REMAP_INCIDENT_FIX", "SLOT_RETENTION", "TITLE_WHOLE_WORD", "TYPED_NAME",
    "WARNING_LEVEL_MANAGER_ONLY", "WOVEN_VALIDATION",
  ].map((name) => `${name}_ENABLED`);
  const FORMS = [...TEMPLATES, { key: "exit", name: "Resignation/Exit Form" }] as const;
  const EXIT_CARD =
    "Here's what I'll fill in on the **Resignation/Exit Form** for **Test Employee**:\n\n- **Name:** Test Employee\n\n**Left blank for you to review:** Store Items Returned, Salon Key Returned, Payroll Deduction, Eligible for Rehire.";
  const ASKED = "Here is the **Corrective Action Form** for **Test Employee**.\n\nOne more question: **Is payroll deduct applicable?** Yes or No? Tell me here, or tick it on the form — I won't answer it for you.";
  const READ_BACK = "Here is the **Corrective Action Form** for **Test Employee**.\n\nIs payroll deduct applicable? **No** — tell me if that should change.";

  function two(request: string, assistant: string, reply: string, formType: string) {
    const turn = (question: string, history: { role: string; content: string }[], saved: ConversationFormState | null) =>
      decideIntentTurn({
        question,
        history,
        today: "2026-10-25",
        saved,
        raw: {
          employee: null,
          store: null,
          title: null,
          incidentType: null,
          incidentDate: null,
          payrollAmount: /\$\s*(\d+)/.exec(question)?.[1] ?? null,
          warningLevel: null,
          formType,
          formTurn: true,
        },
        people: [],
        stores: STORES,
        headings: HEADINGS,
        templates: FORMS,
        formInProgress: history.length > 0,
      });
    const first = turn(request, [], null);
    return turn(reply, [{ role: "user", content: request }, { role: "assistant", content: assistant }], first.state).state;
  }

  const EXIT = ["create an exit form for Test Employee at Kearney, she resigned, last day 10-24", "Create an exit form for Test Employee at Kearney. She resigned, last day 10-24."] as const;
  const CA = ["create a verbal ca for Test Employee at Kearney for being late to open on 10-20", "Create a verbal CA for Test Employee at Kearney for being late to open on 10-20."] as const;
  const CA_NO = ["create a verbal ca for Test Employee at Kearney for being late to open on 10-20, no payroll deduct", "Create a verbal CA for Test Employee at Kearney for being late to open on 10-20. No payroll deduct."] as const;

  /* [label, request, card before the reply, reply, form, with the fix, main (IPMO unset), main (IPMO set)]. */
  const PINS: readonly (readonly [string, readonly [string, string], string, string, string, Answer, Answer, Answer])[] = [
    ["an exit form, then yes", EXIT, EXIT_CARD, "Yes", "exit", null, "yes", "yes"],
    ["an exit form, then no", EXIT, EXIT_CARD, "No", "exit", null, "no", "no"],
    ["an exit form, then $25", EXIT, EXIT_CARD, "$25", "exit", null, "yes", null],
    ["a CA with \"no payroll deduct\", then yes", CA_NO, READ_BACK, "Yes", "corrective action", "no", "yes", "yes"],
    ["a CA's payroll question, then yes", CA, ASKED, "Yes", "corrective action", "yes", "yes", "yes"],
    ["a CA's payroll question, then no", CA, ASKED, "No", "corrective action", "no", "no", "no"],
  ];
  const CASES = PINS.flatMap(([label, [lower, sentence], card, reply, form, fixed, mainOff, mainOn]) => [
    [`${label} (lowercase)`, lower.toLowerCase(), card, reply.toLowerCase(), form, fixed, mainOff, mainOn] as const,
    [`${label} (Sentence case)`, sentence, card, reply, form, fixed, mainOff, mainOn] as const,
  ]);

  describe.each([
    ["INTENT_PAYROLL_MANAGER_ONLY unset", false],
    ["INTENT_PAYROLL_MANAGER_ONLY set", true],
  ] as const)("%s", (_label, ipmo) => {
    beforeEach(() => {
      for (const name of Object.keys(process.env).filter((key) => key.endsWith("_ENABLED"))) vi.stubEnv(name, "");
      for (const name of BUBBLES_PROD) vi.stubEnv(name, "1");
      vi.stubEnv("FORM_FULL_REMAP_ENABLED", "");
      vi.stubEnv("INTENT_PAYROLL_MANAGER_ONLY_ENABLED", ipmo ? "1" : "");
    });

    it.each(CASES)("fix on: %s", (_case, request, card, reply, form, fixed) => {
      vi.stubEnv("LATE_OPEN_PAYROLL_FROM_FORM_ENABLED", "1");
      expect(two(request, card, reply, form).payrollDeduct ?? null).toBe(fixed);
    });

    it.each(CASES)("fix off reads it as main: %s", (_case, request, card, reply, form, _fixed, mainOff, mainOn) => {
      vi.stubEnv("LATE_OPEN_PAYROLL_FROM_FORM_ENABLED", "");
      expect(two(request, card, reply, form).payrollDeduct ?? null).toBe(ipmo ? mainOn : mainOff);
    });
  });
});
