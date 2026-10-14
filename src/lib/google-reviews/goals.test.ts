import { describe, expect, it } from "vitest";

import { goalContext, goalProgress, goalStatus, goalSummary, isPartialMonth, paceTargetFor, partialMonthNote, rankRows, weekStartOf, type GoalRow } from "./goals";

const row = (over: Partial<GoalRow> = {}): GoalRow => ({
  storeCode: "219",
  displayName: "Lee's Summit",
  monthlyTarget: 10,
  baselineReviewId: "b1",
  baselineReviewTime: "2026-10-01T00:00:00Z",
  qualifyingThisWeek: 0,
  qualifyingLastWeek: 0,
  qualifyingMonthToDate: 0,
  historical: 100,
  ...over,
});

describe("goal context (Central, Sunday weeks)", () => {
  it("opens the week on Sunday and the month on the 1st", () => {
    const c = goalContext("2026-10-14"); // a Wednesday
    expect(c).toMatchObject({ weekStart: "2026-10-11", prevWeekStart: "2026-10-04", monthStart: "2026-10-01", daysInMonth: 31, daysElapsed: 13 });
    expect(weekStartOf("2026-10-11")).toBe("2026-10-11");
    expect(weekStartOf("2026-10-17")).toBe("2026-10-11");
  });

  it("paces a straight line to the target, read at the close of yesterday, rounded up", () => {
    expect(paceTargetFor(10, 0, 31)).toBe(0); // the 1st never reads behind
    expect(paceTargetFor(10, 13, 31)).toBe(5);
    expect(paceTargetFor(10, 31, 31)).toBe(10);
  });
});

describe("goal status, progress and totals", () => {
  const ctx = goalContext("2026-10-14"); // pace 5
  it("a salon with no baseline is not counting, whatever its history", () => {
    expect(goalStatus(row({ baselineReviewId: null, baselineReviewTime: null, qualifyingMonthToDate: 50 }), ctx)).toBe("not_counting");
  });
  it("met at the target, on pace at the pace, behind below it", () => {
    expect(goalStatus(row({ qualifyingMonthToDate: 10 }), ctx)).toBe("met");
    expect(goalStatus(row({ qualifyingMonthToDate: 5 }), ctx)).toBe("on_pace");
    expect(goalStatus(row({ qualifyingMonthToDate: 4 }), ctx)).toBe("behind_pace");
  });
  it("progress passes 100% without the bar overflowing", () => {
    expect(goalProgress(12, 10)).toEqual({ percent: 120, barPercent: 100, remaining: 0, over: 2 });
    expect(goalProgress(3, 10)).toMatchObject({ percent: 30, remaining: 7, over: 0 });
  });
  it("totals cover counting salons only; one salon's overage never covers another's shortfall", () => {
    const s = goalSummary([
      row({ storeCode: "1", qualifyingMonthToDate: 12, qualifyingThisWeek: 3, qualifyingLastWeek: 1 }),
      row({ storeCode: "2", qualifyingMonthToDate: 4, qualifyingThisWeek: 1 }),
      row({ storeCode: "3", baselineReviewId: null, baselineReviewTime: null, qualifyingMonthToDate: 99, historical: 7 }),
    ]);
    expect(s).toMatchObject({ counting: 2, notCounting: 1, qualifyingThisWeek: 4, qualifyingLastWeek: 1, qualifyingMonthToDate: 16, combinedTarget: 20, atGoal: 1, stillNeeded: 6, historical: 207 });
  });
});

describe("leaderboard", () => {
  it("uses competition ranking, leaves non-counting salons unranked, and breaks drawing ties without a rank", () => {
    const ranked = rankRows(
      [
        row({ storeCode: "A", displayName: "A", qualifyingMonthToDate: 8, qualifyingThisWeek: 1 }),
        row({ storeCode: "B", displayName: "B", qualifyingMonthToDate: 8, qualifyingThisWeek: 3 }),
        row({ storeCode: "C", displayName: "C", qualifyingMonthToDate: 2 }),
        row({ storeCode: "D", displayName: "D", baselineReviewId: null, baselineReviewTime: null, qualifyingMonthToDate: 40 }),
      ],
      "month",
    );
    expect(ranked.map((r) => [r.row.storeCode, r.rank, r.tied])).toEqual([["B", 1, true], ["A", 1, true], ["C", 3, false], ["D", null, false]]);
  });
  it("can rank by this week", () => {
    const ranked = rankRows([row({ storeCode: "A", displayName: "A", qualifyingMonthToDate: 9, qualifyingThisWeek: 0 }), row({ storeCode: "B", displayName: "B", qualifyingMonthToDate: 1, qualifyingThisWeek: 4 })], "week");
    expect(ranked[0]!.row.storeCode).toBe("B");
  });
});

describe("a partial October is never presented as a full month", () => {
  const ctx = goalContext("2026-10-14");
  const partial = row({ baselineReviewTime: "2026-10-10T18:40:49Z", qualifyingMonthToDate: 2 });
  const full = row({ baselineReviewTime: "2026-09-28T12:00:00Z", qualifyingMonthToDate: 2 });

  it("flags a baseline set during the current Central month, and not one set before it", () => {
    expect(isPartialMonth(partial, ctx)).toBe(true);
    expect(isPartialMonth(full, ctx)).toBe(false);
    expect(isPartialMonth(row({ baselineReviewId: null, baselineReviewTime: null }), ctx)).toBe(false);
  });

  it("uses the Central date: 22:00 Central on Sep 30 is still last month, 00:30 Central on Oct 1 is this month", () => {
    expect(isPartialMonth(row({ baselineReviewTime: "2026-10-01T03:00:00Z" }), ctx)).toBe(false); // 22:00 CDT, Sep 30
    expect(isPartialMonth(row({ baselineReviewTime: "2026-10-01T05:30:00Z" }), ctx)).toBe(true); // 00:30 CDT, Oct 1
  });

  it("gives a salon short of target no pace verdict, while reaching the target still reads Goal met", () => {
    expect(goalStatus(partial, ctx)).toBe("partial_month");
    expect(goalStatus(full, ctx)).toBe("behind_pace");
    expect(goalStatus({ ...partial, qualifyingMonthToDate: 10 }, ctx)).toBe("met");
  });

  it("summarises which salons are partial, and when counting began", () => {
    expect(partialMonthNote([partial, full, row({ baselineReviewTime: "2026-10-13T21:00:00Z" })], ctx)).toEqual({ salons: 2, from: "2026-10-10", to: "2026-10-13" });
    expect(partialMonthNote([full], ctx)).toBeNull();
  });
});
