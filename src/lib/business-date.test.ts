import { afterEach, describe, expect, it } from "vitest";

import {
  BUSINESS_TIMEZONE,
  businessDayStart,
  businessHour,
  businessToday,
  businessWeekEnd,
  daysBetween,
  shiftDays,
  weekdayOf,
} from "./business-date";

/**
 * THE BUG THIS FILE EXISTS TO PREVENT: a follow-up going overdue in the
 * evening.
 *
 * At 8pm US Eastern the UTC date has already rolled over. A follow-up due
 * tomorrow, judged against `new Date().toISOString().slice(0,10)`, would show
 * as due TODAY that evening and as OVERDUE from 8pm the day it was due — hours
 * before anybody at the location has finished work. The boundary tests below fail
 * if this module ever starts reading UTC or the host's zone.
 */

const original = process.env.TZ;
afterEach(() => {
  process.env.TZ = original;
});

describe("the business date", () => {
  it("is a US business zone, not UTC", () => {
    expect(BUSINESS_TIMEZONE).not.toBe("UTC");
    expect(BUSINESS_TIMEZONE.startsWith("America/")).toBe(true);
  });

  it("is still the previous day late in the evening, when UTC has already moved on", () => {
    // 2026-09-04T23:30Z is 6:30pm Central on the 4th. UTC agrees here...
    expect(businessToday(new Date("2026-09-04T23:30:00Z"))).toBe("2026-09-04");
    // ...and 2026-09-05T02:00Z is 9pm Central, STILL the 4th at the location.
    // A naive UTC slice would say the 5th, and every follow-up due on the 5th
    // would read as due today four hours early.
    expect(new Date("2026-09-05T02:00:00Z").toISOString().slice(0, 10)).toBe("2026-09-05");
    expect(businessToday(new Date("2026-09-05T02:00:00Z"))).toBe("2026-09-04");
  });

  it("rolls over at business midnight, not at UTC midnight", () => {
    // 05:30Z in September is 00:30 Central — the new day has started there...
    expect(businessToday(new Date("2026-09-05T05:30:00Z"))).toBe("2026-09-05");
    // ...and 04:30Z is still 11:30pm on the 4th. The business zone is US Central
    // (owner's instruction, 9 Oct 2026), so Eastern's midnight is not the rollover.
    expect(businessToday(new Date("2026-09-05T04:30:00Z"))).toBe("2026-09-04");
  });

  it("handles the daylight-saving change, because Intl does", () => {
    // Central is UTC-5 in summer and UTC-6 in winter; 05:30Z is the 5th in
    // summer and still the 4th in winter. Hard-coded arithmetic gets this
    // wrong twice a year.
    expect(businessToday(new Date("2026-09-05T05:30:00Z"))).toBe("2026-09-05");
    expect(businessToday(new Date("2026-12-05T05:30:00Z"))).toBe("2026-12-04");
  });

  it("does not depend on the host's timezone", () => {
    const instant = new Date("2026-09-05T02:00:00Z");
    for (const zone of ["UTC", "Pacific/Kiritimati", "Pacific/Midway", "Europe/Dublin"]) {
      process.env.TZ = zone;
      expect(businessToday(instant), zone).toBe("2026-09-04");
    }
  });

  it("formats as ISO, so it compares as a string", () => {
    expect(businessToday(new Date("2026-01-02T17:00:00Z"))).toBe("2026-01-02");
    expect("2026-01-02" < "2026-01-10").toBe(true);
  });
});

describe("whole days between dates", () => {
  it("counts forwards and backwards from a date", () => {
    expect(daysBetween("2026-09-04", "2026-09-05")).toBe(1);
    expect(daysBetween("2026-09-04", "2026-09-03")).toBe(-1);
    expect(daysBetween("2026-09-04", "2026-09-04")).toBe(0);
  });

  it("crosses a month, a year and a daylight-saving change cleanly", () => {
    expect(daysBetween("2026-08-31", "2026-09-01")).toBe(1);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    // The US clocks change on 2026-11-01; these are calendar dates, so the
    // count must not gain or lose an hour's worth of rounding.
    expect(daysBetween("2026-10-31", "2026-11-02")).toBe(2);
  });

  it("does not depend on the host's timezone either", () => {
    for (const zone of ["Pacific/Kiritimati", "Pacific/Midway"]) {
      process.env.TZ = zone;
      expect(daysBetween("2026-09-04", "2026-09-05"), zone).toBe(1);
    }
  });
});

describe("the business week", () => {
  /*
   * SUNDAY TO SATURDAY — the US retail week. "Due this week" on the Overview
   * means "before the weekend", so which day ends the week decides whether
   * next Monday's follow-up is counted today.
   */
  it("ends on the Saturday of the week containing the date", () => {
    expect(weekdayOf("2026-09-04")).toBe(5); // a Friday
    expect(businessWeekEnd("2026-09-04")).toBe("2026-09-05");
  });

  it("is the same day when the date is already Saturday", () => {
    expect(businessWeekEnd("2026-09-05")).toBe("2026-09-05");
  });

  it("reaches the whole week from a Sunday", () => {
    expect(weekdayOf("2026-09-06")).toBe(0);
    expect(businessWeekEnd("2026-09-06")).toBe("2026-09-12");
  });

  it("shifts days across a month boundary", () => {
    expect(shiftDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(shiftDays("2026-09-01", -1)).toBe("2026-08-31");
  });
});

describe("the hour of the business day", () => {
  it("is the business zone's hour, not UTC's", () => {
    // 2026-09-05T02:00Z is 9pm Central on the 4th. UTC would say 2am, which
    // greets a manager who is closing up with "Good morning".
    expect(businessHour(new Date("2026-09-05T02:00:00Z"))).toBe(21);
    expect(businessHour(new Date("2026-09-04T14:00:00Z"))).toBe(9);
  });

  it("reports midnight as 0, not 24", () => {
    // `hour12: false` alone formats midnight as "24" in several locales, which
    // would sort after every evening hour instead of before every morning one.
    expect(businessHour(new Date("2026-09-05T05:00:00Z"))).toBe(0);
  });

  it("follows the daylight-saving offset, like every other date here", () => {
    // 05:30Z is 00:30 Central in September and 23:30 the previous day in
    // December.
    expect(businessHour(new Date("2026-09-05T05:30:00Z"))).toBe(0);
    expect(businessHour(new Date("2026-12-05T05:30:00Z"))).toBe(23);
  });

  it("does not depend on the host's timezone", () => {
    const instant = new Date("2026-09-05T02:00:00Z");
    for (const zone of ["UTC", "Pacific/Kiritimati", "Asia/Tokyo"]) {
      process.env.TZ = zone;
      expect(businessHour(instant), zone).toBe(21);
    }
  });
});

describe("the instant a business day begins", () => {
  const start = (date: string, zone?: string) => businessDayStart(date, zone).toISOString();

  it("is Central midnight: 05:00 UTC in daylight time, 06:00 UTC in standard time", () => {
    expect(start("2026-10-09")).toBe("2026-10-09T05:00:00.000Z");
    expect(start("2026-12-15")).toBe("2026-12-15T06:00:00.000Z");
    expect(start("2026-01-01")).toBe("2026-01-01T06:00:00.000Z");
  });

  it("follows the changeover days: the 23-hour 8 March and the 25-hour 1 November", () => {
    expect(start("2026-03-08")).toBe("2026-03-08T06:00:00.000Z");
    expect(start("2026-03-09")).toBe("2026-03-09T05:00:00.000Z");
    expect(start("2026-11-01")).toBe("2026-11-01T05:00:00.000Z");
    expect(start("2026-11-02")).toBe("2026-11-02T06:00:00.000Z");
  });

  it("is the start of the day businessToday names, at every hour of a changeover day", () => {
    for (const date of ["2026-03-08", "2026-11-01", "2026-07-04"]) {
      const from = businessDayStart(date).getTime();
      const to = businessDayStart(shiftDays(date, 1)).getTime();
      for (let t = from; t < to; t += 15 * 60_000) {
        expect(businessToday(new Date(t))).toBe(date);
      }
      expect(businessToday(new Date(from - 1))).toBe(shiftDays(date, -1));
      expect(businessToday(new Date(to))).toBe(shiftDays(date, 1));
    }
  });

  it("works for any zone it is given", () => {
    expect(start("2026-10-09", "America/New_York")).toBe("2026-10-09T04:00:00.000Z");
    expect(start("2026-10-09", "UTC")).toBe("2026-10-09T00:00:00.000Z");
    expect(start("2026-10-09", "Asia/Kolkata")).toBe("2026-10-08T18:30:00.000Z");
  });

  it("is an invalid date for an invalid input, never a wrong one", () => {
    expect(Number.isNaN(businessDayStart("not-a-date").getTime())).toBe(true);
  });
});
