import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/*
 * Ported from Ask Sunny (src/lib/ai/agent-loop/dates.test.ts @ e5691da, read at 2aa544d8). Only the tests of
 * `dates.ts` itself: Sunny's "account check and incident dates" cases test `agent-loop/tools.ts`, which is not
 * ported yet, and its `monthDayToIso` is the one in `dates.ts`, imported from here instead.
 */
const { isoDate, monthDayToIso, readDates, sameDate, withoutDates } = await import("./dates");

afterEach(() => vi.useRealTimers());

/* Batch E (E13, Pau's review via QA): a month/day is read against the store's local date, never the server's UTC clock. */
describe("a month/day as the card's date", () => {
  it("is this year's when it is not after today", () => {
    expect(monthDayToIso("11/4", "2026-11-14")).toBe("2026-11-04");
    expect(monthDayToIso("11/14", "2026-11-14")).toBe("2026-11-14");
  });
  it("is last year's when it is later in the year than today", () => {
    expect(monthDayToIso("12/20", "2026-11-14")).toBe("2025-12-20");
  });
  it("on the evening of 11/14 in the store's time zone, when UTC is already 11/15, tomorrow's month/day is last year's", () => {
    vi.setSystemTime(new Date("2026-11-15T04:30:00Z"));
    expect(monthDayToIso("11/15", "2026-11-14")).toBe("2025-11-15");
  });
});

/* QA (Pau: "yes its CT"; production sets NEXT_PUBLIC_BUSINESS_TIMEZONE=America/Chicago): 05:30Z on 11/15 is still 11/14 in Central. */
describe("with the store's time zone set to America/Chicago", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });
  it("at 05:30Z on 11/15, today is 11/14 and \"11/15\" is last year's, never this year's", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUSINESS_TIMEZONE", "America/Chicago");
    vi.resetModules();
    const { businessToday } = await import("@/lib/business-date");
    const today = businessToday(new Date("2026-11-15T05:30:00Z"));
    expect(today).toBe("2026-11-14");
    expect(monthDayToIso("11/15", today)).toBe("2025-11-15");
    expect(isoDate("11/15/2026", today)! > today, "a full 11/15/2026 is after today, so the card refuses it").toBe(true);
  });
});

/* Batch E (E14, Pau via QA): one reader for every date style; two dates match when month and day (and year, when both have one) do. */
describe("one date reader for every style", () => {
  const JUNE_11 = ["6/11", "6-11", "on 6.11", "06/11/2026", "6/11/26", "6.11.26", "June 11", "Jun 11", "june 11th", "11 June", "the 11th of June", "June 11, 2026", "11th of June 2026"];
  it.each(JUNE_11)("reads %s as June 11", (text) => {
    const [date] = readDates(`late on ${text} again`.replace("on on", "on"));
    expect(date, text).toBeTruthy();
    expect([date!.month, date!.day]).toEqual([6, 11]);
  });
  it("matches every style against every other style", () => {
    for (const a of JUNE_11) {
      for (const b of JUNE_11) {
        const [x] = readDates(a);
        const [y] = readDates(b);
        expect(sameDate(x!, y!), `${a} vs ${b}`).toBe(true);
      }
    }
  });
  it("reads Sept 28 and September 28, 2026 as the same day as 9-28-26", () => {
    const [short] = readDates("9-28-26");
    for (const text of ["Sept 28", "September 28, 2026", "sep 28th"]) expect(sameDate(short!, readDates(text)[0]!), text).toBe(true);
  });
  it("tells different years apart only when both have one", () => {
    expect(sameDate(readDates("6/11/25")[0]!, readDates("June 11, 2026")[0]!)).toBe(false);
    expect(sameDate(readDates("6/11/25")[0]!, readDates("June 11")[0]!)).toBe(true);
  });
  it("never reads a decimal, a time, an amount, a weekday or a word as a date", () => {
    // Sunny's list said "146 tans" (its own product); a plain count reads the same.
    for (const text of ["4.5 hours", "$6.11", "10:40am", "on Monday", "yesterday", "last night", "146 units", "at 3 pm"]) {
      expect(readDates(text), text).toEqual([]);
    }
  });
  it("takes every date out of the text for the figure checks", () => {
    expect(withoutDates("late on june 11 and 6/20, 4.5 hours")).not.toMatch(/june|6\/20/i);
    expect(withoutDates("late on june 11 and 6/20, 4.5 hours")).toContain("4.5 hours");
  });
  it("reads a form date in any style as ISO", () => {
    expect(isoDate("2026-12-20", "2026-11-14")).toBe("2026-12-20");
    expect(isoDate("12/20/2026", "2026-11-14")).toBe("2026-12-20");
    expect(isoDate("December 20, 2026", "2026-11-14")).toBe("2026-12-20");
    expect(isoDate("December 20", "2026-11-14")).toBe("2025-12-20");
  });
});

/* Sunny PR #1018 (QA's batch J review, NO-GO 2, 15 Nov 2026): an ISO date's time suffix never changes its year. */
describe("isoDate with a time", () => {
  it("2026-12-20T00:00 is 2026-12-20, never last year's 12/20", () => {
    expect(isoDate("2026-12-20T00:00", "2026-11-15")).toBe("2026-12-20");
    expect(isoDate("2026-12-20T00:00:00Z", "2026-11-15")).toBe("2026-12-20");
    expect(isoDate("2026-12-20 00:00:00Z", "2026-11-15")).toBe("2026-12-20");
    expect(isoDate("2026-12-20T08:15:30.250-06:00", "2026-11-15")).toBe("2026-12-20");
    expect(isoDate("2026-11-12 09:30", "2026-11-15")).toBe("2026-11-12");
    expect(isoDate("2026-11-12", "2026-11-15")).toBe("2026-11-12");
  });
});
