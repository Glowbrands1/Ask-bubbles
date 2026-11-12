import { afterEach, describe, expect, it, vi } from "vitest";

import { missedMeetingNotLateness } from "./attendance-action-plan";

/** MISSED_SHIFT_NOT_LATENESS_ENABLED (the sibling app's live Create test, QA round 5, 8 Nov 2026; sf-s38's words, invented people). */
const T1 = "make me an CA for Rhea Calloway missing her saturday and sunday shifts due to wanting to go home for the weekend but failed to communicate proporley";

afterEach(() => vi.unstubAllEnvs());

describe("MISSED_SHIFT_NOT_LATENESS", () => {
  it("off: a missed shift keeps the lateness plan (the report)", () => {
    // Pinned (G5-781): ATTENDANCE_PLAN_NEEDS_LATENESS would also give this account, which states no lateness, the general plan.
    vi.stubEnv("ATTENDANCE_PLAN_NEEDS_LATENESS_ENABLED", "");
    expect(missedMeetingNotLateness(T1)).toBe(false);
  });

  it.each([
    T1,
    "Rhea did not show up for her shift on 11/2",
    "no call no show on saturday",
    "she was a no-show for her sunday shift",
    "she called out of her shift without finding a cover",
    "she missed work on 11/2 and did not tell anyone",
  ])("on: %s — not lateness", (account) => {
    vi.stubEnv("MISSED_SHIFT_NOT_LATENESS_ENABLED", "true");
    expect(missedMeetingNotLateness(account)).toBe(true);
  });

  it.each([
    "she was 30 minutes late to her shift on 11/2",
    "she missed the start of her shift and clocked in at 10:15",
    "she arrived late and then missed her break",
  ])("on, negative: %s — keeps the attendance plan", (account) => {
    vi.stubEnv("MISSED_SHIFT_NOT_LATENESS_ENABLED", "true");
    vi.stubEnv("ATTENDANCE_PLAN_NEEDS_LATENESS_ENABLED", "");
    expect(missedMeetingNotLateness(account)).toBe(false);
  });

  /*
   * Changed on purpose (QA's ruling, 11 Nov 2026; ATTENDANCE_PLAN_NEEDS_LATENESS, G5-781): an account that states no
   * lateness ("rude to a customer at the register") no longer gets the lateness plan once that flag is on. Off, as
   * before: it keeps the attendance plan.
   */
  it.each([
    ["off", "", false],
    ["on", "true", true],
  ] as const)("ATTENDANCE_PLAN_NEEDS_LATENESS %s: \"she was rude to a customer at the register\"", (_label, needsLateness, notLateness) => {
    vi.stubEnv("MISSED_SHIFT_NOT_LATENESS_ENABLED", "true");
    vi.stubEnv("ATTENDANCE_PLAN_NEEDS_LATENESS_ENABLED", needsLateness);
    expect(missedMeetingNotLateness("she was rude to a customer at the register")).toBe(notLateness);
  });
});
