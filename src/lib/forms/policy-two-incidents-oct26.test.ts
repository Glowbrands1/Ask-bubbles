import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import rows from "@/test/fixtures/jba-manual-production-151.json";
import { accountManualSections } from "@/lib/ai/account-manual-sections";
import { citedSections } from "@/lib/ai/violation-policy";
import { manualChunkFromRow, type ManualChunkRow } from "@/lib/knowledge/full-manual-load";

import { describedAttendanceKeys } from "./ca-policy";
import type { ManualChunk } from "./official-policy-manual";

/**
 * ============================================================================
 * TWO INCIDENTS, BOTH POLICIES, IN THE ORDER SAID (POLICY_TWO_INCIDENTS_ENABLED)
 * ============================================================================
 *
 * QA, 26 Oct 2026 (name invented): "ca for <name> not opening the store on
 * time and no call no show" must cite both policies, one card line each, in
 * the order the manager said them, and never a third. Here a late opening
 * already has its own box and cites both; what was missing is the order said,
 * and a late shift beside a late opening, which cited Late Opening alone.
 *
 * Run with no flags and with the flags production has on (Vercel, 26 Oct 2026).
 */

const CHUNKS: readonly ManualChunk[] = (rows.chunks as ManualChunkRow[]).map((row) => {
  const chunk = manualChunkFromRow(row);
  return { ...chunk, page: chunk.page ?? null, locator: chunk.locator ?? undefined };
});

/** The flags on in Ask Bubbles production, 26 Oct 2026. */
const LIVE = [
  "ACTION_PLAN_MANAGER_ONLY_ENABLED",
  "ACTION_PLAN_SENTENCES_ENABLED",
  "APP_PASSWORD_HELP_ENABLED",
  "CA_TEMPLATE_MAP_ENABLED",
  "CHAT_TRACE_ENABLED",
  "CONVERSATION_DRAFT_REUSE_ENABLED",
  "CROSS_CHAT_REPLY_GUARD_ENABLED",
  "DRAFT_ACTIONS_ENABLED",
  "DRAFT_REUSE_SAME_CHAT_ONLY_ENABLED",
  "FIELD_ACCURACY_ENABLED",
  "FORM_CHOICE_STATED_ENABLED",
  "FORM_FULL_REMAP_ENABLED",
  "FORM_STATE_ENABLED",
  "FULL_MANUAL_CONTEXT_ENABLED",
  "GLOBAL_STORE_ASK_ENABLED",
  "GOOGLE_REVIEWS_SCHEDULE_ENABLED",
  "GOOGLE_REVIEWS_SYNC_ENABLED",
  "GOOGLE_REVIEWS_WRITES_ENABLED",
  "GROUNDED_ENTITIES_ENABLED",
  "INTENT_EXTRACTION_ENABLED",
  "KEEP_FORM_EMPLOYEE_ENABLED",
  "LATE_OPEN_DATE_ENABLED",
  "MANUAL_NEGATED_LIST_NOTE_ENABLED",
  "NOT_A_NAME_GUARD_ENABLED",
  "PAYROLL_DEDUCT_AMOUNT_ENABLED",
  "PLACE_SPAN_GUARD_ENABLED",
  "PRINTED_PAGE_ONLY_ENABLED",
  "PRIOR_ACTIONS_PARSE_ENABLED",
  "PROMPT_CACHE_ENABLED",
  "REMAP_DRAFT_SOURCES_ENABLED",
  "REMAP_INCIDENT_FIX_ENABLED",
  "REOPEN_VERB_GUARD_ENABLED",
  "SLOT_RETENTION_ENABLED",
  "TITLE_WHOLE_WORD_ENABLED",
  "TYPED_NAME_ENABLED",
  "WARNING_LEVEL_MANAGER_ONLY_ENABLED",
  "WOVEN_SYNC_ENABLED",
  "WOVEN_SYNC_SCHEDULE_ENABLED",
  "WOVEN_SYNC_WRITES_ENABLED",
  "WOVEN_VALIDATION_ENABLED",
] as const;

afterEach(() => vi.unstubAllEnvs());
// Flag-off pins hold whatever the environment has on; flag-on tests call on(true).
beforeEach(() => vi.stubEnv("POLICY_TWO_INCIDENTS_ENABLED", ""));

const cited = (text: string) => accountManualSections(text, CHUNKS).map((section) => `${section.heading} p.${section.page}`);
const card = (text: string) => citedSections([text], CHUNKS).map((entry) => `${entry.section} p.${entry.page}`);

const lower = (text: string) => text.toLowerCase();
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
const registers = (text: string) => [text, lower(text), sentence(text), text.toUpperCase()];

const BOTH = "ca for marlo quint not opening the store on time and no call no show";
const BOTH_REVERSED = "ca for marlo quint no call no show and not opening the store on time";
const LATE_SHIFT_TOO = "Marlo was late to her shift on 10-2-26 and opened the store late on 10-5-26";

describe.each([
  ["no other flags", [] as readonly string[]],
  ["the live flags", LIVE],
])("with %s", (_label, flags) => {
  const on = (two: boolean) => {
    for (const name of flags) vi.stubEnv(name, "true");
    if (two) vi.stubEnv("POLICY_TWO_INCIDENTS_ENABLED", "true");
  };

  it("flag off: the order said is not kept, and a late shift beside a late opening is lost (the bug)", () => {
    on(false);
    expect(cited(BOTH_REVERSED)).toEqual(["Late Opening p.15", "Attendance p.14"]);
    expect(cited(LATE_SHIFT_TOO)).toEqual(["Late Opening p.15"]);
  });

  it.each(registers(BOTH))("flag on: %s -> Late Opening p.15, then Attendance p.14", (text) => {
    on(true);
    expect(cited(text)).toEqual(["Late Opening p.15", "Attendance p.14"]);
    expect(card(text)).toEqual(["Late Opening p.15", "Attendance p.14"]);
    expect(describedAttendanceKeys(text)).toEqual(["late_opening", "absenteeism"]);
  });

  it.each(registers(BOTH_REVERSED))("flag on: %s -> in the order said: Attendance, then Late Opening", (text) => {
    on(true);
    expect(cited(text)).toEqual(["Attendance p.14", "Late Opening p.15"]);
    expect(card(text)).toEqual(["Attendance p.14", "Late Opening p.15"]);
  });

  it.each(registers(LATE_SHIFT_TOO))("flag on: %s -> both, the late shift first", (text) => {
    on(true);
    expect(cited(text)).toEqual(["Attendance p.14", "Late Opening p.15"]);
    expect(describedAttendanceKeys(text)).toEqual(["late_opening", "tardiness"]);
  });

  describe("NEVER-BREAK, flag on", () => {
    it.each([...registers("ca for marlo quint not opening the store on time"), ...registers("Marlo Quint opened the store late on 10-1-26")])(
      "a late opening alone is Late Opening only: %s",
      (text) => {
        on(true);
        expect(cited(text)).toEqual(["Late Opening p.15"]);
        expect(describedAttendanceKeys(text)).toEqual(["late_opening"]);
      },
    );

    it.each([...registers("ca for marlo quint no call no show"), ...registers("Marlo Quint was 20 minutes late to her shift on 10-2-26")])(
      "a single attendance incident is Attendance only: %s",
      (text) => {
        on(true);
        expect(cited(text)).toEqual(["Attendance p.14"]);
      },
    );

    it("the second person of a pair keeps only their own policy", () => {
      on(true);
      expect(cited("ca for devon harlan no call no show on 10-4-26")).toEqual(["Attendance p.14"]);
    });

    // QA-2, 26 Oct 2026: a late shift the manager denies is no incident and decides no order.
    it.each(
      [
        "was not late to her shift, she opened the store late",
        "was never late to her shift but opened the store late",
        "is not late to her shift and did not open the store late",
      ].flatMap(registers),
    )("a denied late shift adds nothing: %s", (text) => {
      on(true);
      expect(describedAttendanceKeys(text)).toEqual(["late_opening"]);
      expect(cited(text)).toEqual(["Late Opening p.15"]);
    });

    it("known quirk, the same with the flag off and on: an on-time opening still reads as one", () => {
      const text = "opened the store on time and was a no call no show";
      on(false);
      const off = describedAttendanceKeys(text);
      on(true);
      expect(describedAttendanceKeys(text)).toEqual(off);
    });

    it("never a third section", () => {
      on(true);
      for (const text of [BOTH, BOTH_REVERSED, LATE_SHIFT_TOO]) expect(cited(text)).toHaveLength(2);
    });
  });
});

/*
 * QA-7, 26 Oct 2026 (names invented): another employee's lateness beside a
 * late opening is not a second incident for this one. Original, lowercase,
 * sentence case and CAPS.
 */
describe("flag on: another person's lateness is not a second incident", () => {
  const on = () => vi.stubEnv("POLICY_TWO_INCIDENTS_ENABLED", "true");

  it.each(
    [
      "she opened the store late, devon harlan was late to his shift",
      "she opened the store late, he was late to his shift",
      "Marlo opened the store late on 10-5-26, Devon was late too",
    ].flatMap(registers),
  )("%s -> Late Opening only", (text) => {
    on();
    expect(describedAttendanceKeys(text)).toEqual(["late_opening"]);
    expect(cited(text)).toEqual(["Late Opening p.15"]);
  });

  it.each(
    [
      "she opened the store late and she was late to her shift",
      "Marlo opened the store late and was late to her shift",
      "Marlo opened the store late, Marlo was also late",
      "Marlo opened the store late. She was late to her shift too.",
    ].flatMap(registers),
  )("the same person's lateness is still a second incident: %s", (text) => {
    on();
    expect(describedAttendanceKeys(text)).toEqual(["late_opening", "tardiness"]);
  });

  it("flag off: a late opening alone, as before", () => {
    expect(describedAttendanceKeys("she opened the store late, devon harlan was late to his shift")).toEqual(["late_opening"]);
  });
});
