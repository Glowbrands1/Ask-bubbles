import { describe, expect, it } from "vitest";

import vercelConfig from "../../../../vercel.json";
import { centralClock, describeDaily, nextDailyRun, parseDailyCron } from "./auto-sync-schedule";

describe("the daily schedule", () => {
  it("parses the daily shape and refuses everything else rather than guessing", () => {
    expect(parseDailyCron("17 11 * * *")).toEqual({ minute: 17, hour: 11 });
    for (const bad of ["*/5 * * * *", "23 */6 * * *", "17 11 * * 1", "61 11 * * *", "17 24 * * *", "", "daily"]) expect(parseDailyCron(bad)).toBeNull();
  });

  it("the next run is strictly after now, today or tomorrow", () => {
    const s = { minute: 17, hour: 11 };
    expect(nextDailyRun(s, new Date("2026-10-14T10:00:00Z")).toISOString()).toBe("2026-10-14T11:17:00.000Z");
    expect(nextDailyRun(s, new Date("2026-10-14T11:17:00Z")).toISOString()).toBe("2026-10-15T11:17:00.000Z");
    expect(nextDailyRun(s, new Date("2026-10-14T20:00:00Z")).toISOString()).toBe("2026-10-15T11:17:00.000Z");
    expect(nextDailyRun(s, new Date("2026-12-31T23:59:00Z")).toISOString()).toBe("2027-01-01T11:17:00.000Z");
  });

  it("describes the schedule in UTC and in Central time", () => {
    expect(describeDaily({ minute: 17, hour: 11 })).toBe("Once a day at 11:17 UTC");
    expect(centralClock(new Date("2026-10-14T11:17:00Z"))).toBe("6:17 AM CDT");
    expect(centralClock(new Date("2026-12-14T11:17:00Z"))).toBe("5:17 AM CST");
  });

  it("vercel.json really schedules the Woven employee cron daily (what the screen reports is what runs)", () => {
    const entry = vercelConfig.crons.find((c) => c.path === "/api/employees/woven/cron");
    expect(entry).toBeDefined();
    expect(parseDailyCron(entry!.schedule)).not.toBeNull();
  });
});
