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
