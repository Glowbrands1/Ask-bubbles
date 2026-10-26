import { afterEach, describe, expect, it, vi } from "vitest";

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
    // Pinned to flag-off (unset); the env may set it (production has it on). Restored by unstubAllEnvs.
    vi.stubEnv("LATE_OPEN_DATE_ENABLED", "");
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
    // Pinned to flag-off; the env may set it. Restored by unstubAllEnvs.
    vi.stubEnv("LATE_OPEN_DATE_ENABLED", "");
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
 * LATE_OPEN_DATE_FIX_ENABLED (QA, 25-26 Oct 2026; ported from the sibling app)
 * ============================================================================
 *
 * The sibling app's QA wording, with this app's store. With LATE_OPEN_DATE on
 * (production), the intent read dated "coaching form for …, she was late on
 * 10-5 and 10-15, I coached her on 10-16" 10/5: the "on" in "late on 10-5"
 * made it the one date the turn stated, ahead of the coaching the manager
 * held. With the fix, on a Coaching Form, the held coaching dates it, and two
 * held coachings are asked about; every other stated date is read as before
 * (QA-6, 26 Oct 2026: a fix must never drop one). The full remap's card, this
 * app's live form path, already dated it 10/16 and is unchanged. "Test
 * Employee" is the QA account's placeholder; Rowan Pell is invented.
 */
describe("LATE_OPEN_DATE_FIX_ENABLED, with LATE_OPEN_DATE_ENABLED on as in production", () => {
  const YEAR_TODAY = "2026-10-25";

  function read(words: string, kind: "ca" | "coaching", history: { role: string; content: string }[] = []) {
    return decideIntentTurn({
      question: words,
      history,
      today: YEAR_TODAY,
      saved: null,
      raw: {
        employee: null,
        store: null,
        title: null,
        incidentType: null,
        incidentDate: null,
        payrollAmount: null,
        warningLevel: null,
        formType: kind === "coaching" ? "coaching" : "corrective action",
        formTurn: true,
      },
      people: [],
      stores: STORES,
      headings: HEADINGS,
      templates: TEMPLATES,
      formInProgress: false,
    });
  }

  function remapDate(words: string, kind: "ca" | "coaching"): string | null {
    const grounded = groundFormSlots({
      raw: { templateKey: kind === "coaching" ? "coaching" : "dpoa", employeeName: "Test Employee", observation: null, actionPlan: null },
      history: [],
      question: words,
      today: YEAR_TODAY,
      people: [],
      saved: null,
    });
    return grounded.slots.incidentDateIso ?? null;
  }

  const COACHING = "coaching form for Test Employee at Kearney, she was late on 10-5 and 10-15, I coached her on 10-16 about being late";
  const COACHING_SENTENCES = "Coaching form for Test Employee at Kearney. She was late on 10-5 and 10-15. I coached her on 10-16 about being late.";

  it.each([
    ["lowercase", COACHING.toLowerCase()],
    ["as typed", COACHING],
    ["Sentence case", COACHING_SENTENCES],
    ["negation", "coaching form for Test Employee at Kearney, she was not late on 10-5, I coached her on 10-16"],
    ["negation, Sentence case", "Coaching form for Test Employee at Kearney. She was not late on 10-5. I coached her on 10-16."],
    ["another person", "coaching form for Test Employee at Kearney, Rowan Pell was late on 10-5, I coached Test Employee on 10-16"],
    ["another person, Sentence case", "Coaching form for Test Employee at Kearney. Rowan Pell was late on 10-5. I coached Test Employee on 10-16."],
  ])("the held coaching dates the Coaching Form 10/16 (%s); the remap's card is 10/16 either way", (_label, words) => {
    vi.stubEnv("LATE_OPEN_DATE_ENABLED", "1");
    vi.stubEnv("LATE_OPEN_DATE_FIX_ENABLED", "1");
    expect(read(words, "coaching").state.formDate).toBe("2026-10-16");
    expect(remapDate(words, "coaching")).toBe("2026-10-16");
    // Never-break: fix off reads it as main does (10/5), and the remap's card is the same.
    vi.stubEnv("LATE_OPEN_DATE_FIX_ENABLED", "");
    expect(read(words, "coaching").state.formDate).toBe("2026-10-05");
    expect(remapDate(words, "coaching")).toBe("2026-10-16");
  });

  it("never-break: with LATE_OPEN_DATE off the fix changes nothing", () => {
    vi.stubEnv("LATE_OPEN_DATE_ENABLED", "");
    for (const fix of ["", "1"]) {
      vi.stubEnv("LATE_OPEN_DATE_FIX_ENABLED", fix);
      expect(read(COACHING, "coaching").state.formDate).toBeNull();
      expect(remapDate(COACHING, "coaching")).toBe("2026-10-16");
    }
  });

  /* [label, kind, lowercase, Sentence case, intent date with the fix, intent date on main ("asked": the date question)]. */
  const PINS: readonly (readonly [string, "ca" | "coaching", string, string, string | null | "asked", string | null | "asked"])[] = [
    ["two clauses, a late opening and a held coaching, a CA", "ca", "ca for Test Employee at Kearney, she was late to open on 10-5 and I coached her on 10-16", "CA for Test Employee at Kearney. She was late to open on 10-5 and I coached her on 10-16.", "2026-10-05", "2026-10-05"],
    ["a real late opening", "ca", "ca for Test Employee at Kearney for being late to open on 10-20, no payroll", "CA for Test Employee at Kearney for being late to open on 10-20. No payroll.", "2026-10-20", "2026-10-20"],
    ["opened late on", "ca", "create a ca for Rowan Pell, opened late on 10-5", "Create a CA for Rowan Pell. She opened late on 10-5.", "2026-10-05", "2026-10-05"],
    ["opening the store late on", "ca", "create a ca for Rowan Pell, for opening the store late on 10-5", "Create a CA for Rowan Pell for opening the store late on 10-5.", "2026-10-05", "2026-10-05"],
    ["late on, a CA", "ca", "create a ca for Rowan Pell, she was late on 10-5", "Create a CA for Rowan Pell. She was late on 10-5.", "2026-10-05", "2026-10-05"],
    ["late on, then a held coaching, a CA", "ca", "create a ca for Rowan Pell, she was late on 10-5, I coached her on 10-16", "Create a CA for Rowan Pell. She was late on 10-5. I coached her on 10-16.", "2026-10-05", "2026-10-05"],
    ["late on and opened late on, a CA", "ca", "create a ca for Rowan Pell, she was late on 10-5 and opened late on 10-9", "Create a CA for Rowan Pell. She was late on 10-5 and opened late on 10-9.", "asked", "asked"],
    ["late on, a Coaching Form", "coaching", "coaching form for Rowan Pell, she was late on 10-5", "Coaching form for Rowan Pell. She was late on 10-5.", "2026-10-05", "2026-10-05"],
    ["late again on, a Coaching Form", "coaching", "coaching form for Rowan Pell, she was late again on 10-5", "Coaching form for Rowan Pell. She was late again on 10-5.", "2026-10-05", "2026-10-05"],
    ["two held coachings", "coaching", "coaching form for Rowan Pell, I coached her on 10-16 and 10-18", "Coaching form for Rowan Pell. I coached her on 10-16 and 10-18.", "asked", "2026-10-16"],
  ];
  const CASES = PINS.flatMap(([label, kind, lower, sentence, on, main]) => [
    [`${label} (lowercase)`, kind, lower.toLowerCase(), on, main] as const,
    [`${label} (Sentence case)`, kind, sentence, on, main] as const,
  ]);

  function expectRead(decision: ReturnType<typeof read>, expected: string | null | "asked") {
    if (expected === "asked") {
      expect(decision.clarification).toMatch(/^Which date should go on the form\? Reply with the number\./);
      expect(decision.state.formDate).toBeNull();
      return;
    }
    expect(decision.state.formDate).toBe(expected);
  }

  it.each(CASES)("probe, fix on: %s", (_label, kind, words, on) => {
    vi.stubEnv("LATE_OPEN_DATE_ENABLED", "1");
    vi.stubEnv("LATE_OPEN_DATE_FIX_ENABLED", "1");
    expectRead(read(words, kind), on);
  });

  it.each(CASES)("fix off reads it as main: %s", (_label, kind, words, _on, main) => {
    vi.stubEnv("LATE_OPEN_DATE_ENABLED", "1");
    vi.stubEnv("LATE_OPEN_DATE_FIX_ENABLED", "");
    expectRead(read(words, kind), main);
  });

  it("the date question is answered by its number: 10/18", () => {
    vi.stubEnv("LATE_OPEN_DATE_ENABLED", "1");
    vi.stubEnv("LATE_OPEN_DATE_FIX_ENABLED", "1");
    const words = "coaching form for Rowan Pell, I coached her on 10-16 and 10-18";
    const asked = read(words, "coaching");
    const answer = read("2", "coaching", [
      { role: "user", content: words },
      { role: "assistant", content: asked.clarification! },
    ]);
    expect(answer.state.formDate).toBe("2026-10-18");
  });
});
